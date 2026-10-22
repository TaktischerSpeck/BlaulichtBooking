import { randomUUID } from "node:crypto";
import { interval, formatPeriod } from "./time.js";
import { transaction } from "./database.js";
import { digest, randomToken, seal, text, email, fail } from "./security.js";

export const labels = {
  unverified: "E-Mail unbestätigt",
  pending: "Freigabe ausstehend",
  approved: "Genehmigt",
  rejected: "Abgelehnt",
  cancelled: "Storniert",
  expired: "Abgelaufen",
  completed: "Abgeschlossen",
};
export class BookingService {
  constructor(db, config) {
    this.db = db;
    this.config = config;
  }
  one(sql, ...args) {
    return this.db.prepare(sql).get(...args);
  }
  all(sql, ...args) {
    return this.db.prepare(sql).all(...args);
  }
  run(sql, ...args) {
    return this.db.prepare(sql).run(...args);
  }
  audit(actor, action, bookingId, detail = {}) {
    this.run(
      "INSERT INTO audit(created,actor,action,booking_id,detail) VALUES (?,?,?,?,?)",
      Date.now(),
      actor,
      action,
      bookingId,
      JSON.stringify(detail),
    );
  }
  vehicleList(admin = false) {
    return this.all(
      `SELECT * FROM vehicles ${admin ? "" : "WHERE active=1 AND archived=0"} ORDER BY sort_order,name`,
    ).map((v) => {
      if (admin)
        return {
          ...v,
          approverIds: this.all(
            "SELECT approver_id FROM vehicle_approvers WHERE vehicle_id=?",
            v.id,
          ).map((a) => a.approver_id),
        };
      const {
        calendar_id: _calendar,
        quorum: _quorum,
        rule: _rule,
        ...visible
      } = v;
      return visible;
    });
  }
  get(id, privateView = false) {
    const row = this.one("SELECT * FROM bookings WHERE id=?", id);
    if (!row) fail("Buchung nicht gefunden.", 404);
    const { email: contact, notes, ...publicRow } = row;
    const vehicles = this.all(
      `SELECT r.vehicle_id AS id,v.name,v.callsign,v.color,r.state,r.required,
      (SELECT count(*) FROM decisions d WHERE d.booking_id=r.booking_id AND d.vehicle_id=r.vehicle_id AND d.decision='approve') AS approvals
      FROM reservations r JOIN vehicles v ON v.id=r.vehicle_id WHERE r.booking_id=? ORDER BY v.sort_order,v.name`,
      id,
    );
    return {
      ...publicRow,
      allDay: Boolean(row.all_day),
      vehicles,
      ...(privateView ? { email: contact, notes } : {}),
    };
  }
  parse(input, allowPast = false) {
    const period = interval(input);
    if (!allowPast && period.start < Date.now() - 60000)
      fail("Der Beginn muss in der Zukunft liegen.");
    if (
      !Array.isArray(input.vehicleIds) ||
      !input.vehicleIds.length ||
      input.vehicleIds.length > 100
    )
      fail("Bitte mindestens ein Fahrzeug auswählen.");
    const vehicleIds = [...new Set(input.vehicleIds)];
    const vehicles = vehicleIds.map(
      (id) =>
        this.one(
          "SELECT * FROM vehicles WHERE id=? AND active=1 AND archived=0",
          text(id, "Fahrzeug-ID", 80),
        ) || fail("Ein gewähltes Fahrzeug ist nicht mehr buchbar."),
    );
    return {
      ...period,
      vehicleIds,
      vehicles,
      name: text(input.name, "Name", 100),
      email: email(input.email),
      purpose: text(input.purpose, "Buchungszweck", 300),
      department: text(input.department, "Abteilung", 100, true),
      notes: text(input.notes, "Bemerkungen", 2000, true),
    };
  }
  conflicts(vehicleIds, start, end, exclude = "") {
    if (
      !Array.isArray(vehicleIds) ||
      vehicleIds.length > 100 ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start >= end
    )
      fail("Ungültige Verfügbarkeitsabfrage.");
    const result = [];
    for (const id of [...new Set(vehicleIds)]) {
      if (typeof id !== "string") fail("Ungültige Fahrzeug-ID.");
      for (const row of this.all(
        `SELECT b.id,b.name,b.purpose,b.start,b.end,b.all_day,b.status,v.name AS vehicle_name
        FROM bookings b JOIN reservations r ON r.booking_id=b.id JOIN vehicles v ON v.id=r.vehicle_id
        WHERE r.vehicle_id=? AND b.status IN ('pending','approved') AND b.start<? AND b.end>? AND b.id<>?`,
        id,
        end,
        start,
        exclude,
      )) {
        result.push({
          ...row,
          vehicleId: id,
          blocking: row.status === "approved",
        });
      }
      for (const row of this.all(
        `SELECT x.id,x.reason AS purpose,x.start,x.end,v.name AS vehicle_name FROM blocks x JOIN vehicles v ON v.id=x.vehicle_id
        WHERE x.vehicle_id=? AND x.start<? AND x.end>?`,
        id,
        end,
        start,
      ))
        result.push({
          ...row,
          vehicleId: id,
          status: "blocked",
          name: "Fahrzeugsperre",
          blocking: true,
        });
    }
    return result;
  }
  snapshot(id, data) {
    for (const v of data.vehicles) {
      const people = this.all(
        "SELECT a.id FROM approvers a JOIN vehicle_approvers va ON va.approver_id=a.id WHERE va.vehicle_id=? AND a.active=1",
        v.id,
      );
      const required =
        v.rule === "all" ? people.length : v.rule === "any" ? 1 : v.quorum;
      if (!people.length || required < 1 || required > people.length)
        fail(
          `Für ${v.name} ist noch keine gültige Freigabegruppe eingerichtet.`,
        );
      this.run(
        "INSERT INTO reservations(booking_id,vehicle_id,rule,required) VALUES (?,?,?,?)",
        id,
        v.id,
        v.rule,
        required,
      );
      for (const p of people)
        this.run("INSERT INTO eligible VALUES (?,?,?)", id, v.id, p.id);
    }
  }
  token(id, kind, approverId = null) {
    const b = this.one("SELECT * FROM bookings WHERE id=?", id);
    const raw = randomToken();
    const expires =
      kind === "verify"
        ? Date.now() + 86400000
        : kind === "approve"
          ? Math.min(Date.now() + 7 * 86400000, b.start)
          : Math.max(Date.now() + 7 * 86400000, b.end + 30 * 86400000);
    this.run(
      "INSERT INTO tokens VALUES (?,?,?,?,?,?,0)",
      digest(raw),
      id,
      kind,
      approverId,
      b.revision,
      expires,
    );
    return `${this.config.baseUrl}/#/${kind}/${raw}`;
  }
  resolveToken(raw, kinds) {
    if (typeof raw !== "string" || raw.length !== 43)
      fail("Ungültiger oder abgelaufener Link.", 403);
    const t = this.one("SELECT * FROM tokens WHERE hash=?", digest(raw));
    if (!t || !kinds.includes(t.kind) || t.used || t.expires <= Date.now())
      fail("Ungültiger oder abgelaufener Link.", 403);
    const b = this.one("SELECT * FROM bookings WHERE id=?", t.booking_id);
    if (t.kind !== "manage" && t.revision !== b.revision)
      fail(
        "Diese Anfrage wurde inzwischen geändert. Bitte den neuen Link verwenden.",
        409,
      );
    if (
      t.kind === "approve" &&
      !this.one(
        "SELECT id FROM approvers WHERE id=? AND active=1",
        t.approver_id,
      )
    )
      fail("Diese Freigabeberechtigung ist nicht mehr aktiv.", 403);
    return { ...t, booking: b };
  }
  enqueue(type, bookingId, payload) {
    this.run(
      "INSERT INTO jobs(id,type,booking_id,payload,next_at,created) VALUES (?,?,?,?,?,?)",
      randomUUID(),
      type,
      bookingId,
      seal(payload, this.config.appKey),
      Date.now(),
      Date.now(),
    );
  }
  mail(
    id,
    to,
    subject,
    body,
    link,
    linkLabel = "Buchung öffnen",
    guard = null,
  ) {
    this.enqueue("mail", id, {
      to,
      subject: `BlaulichtBooking: ${subject}`,
      body,
      link,
      linkLabel,
      guard,
    });
  }
  notify(id, event, includeApprovers = false) {
    const b = this.get(id, true);
    const body = `${event}\n\n${b.purpose}\n${b.vehicles.map((v) => v.name).join(", ")}\n${formatPeriod(b)}\nGebucht von: ${b.name}`;
    this.mail(id, b.email, event, body, this.token(id, "manage"));
    if (includeApprovers)
      for (const a of this.all(
        "SELECT DISTINCT a.* FROM approvers a JOIN eligible e ON e.approver_id=a.id WHERE e.booking_id=? AND a.active=1",
        id,
      ))
        this.mail(id, a.email, event, body, null);
  }
  requestApprovals(id) {
    const b = this.get(id, true);
    for (const a of this.all(
      "SELECT DISTINCT a.* FROM approvers a JOIN eligible e ON e.approver_id=a.id WHERE e.booking_id=? AND a.active=1",
      id,
    )) {
      const names = this.all(
        "SELECT v.name FROM vehicles v JOIN eligible e ON e.vehicle_id=v.id WHERE e.booking_id=? AND e.approver_id=?",
        id,
        a.id,
      ).map((v) => v.name);
      this.mail(
        id,
        a.email,
        "Freigabe angefragt",
        `Hallo ${a.name},\n\n${b.name} möchte folgende Fahrzeuge buchen: ${names.join(", ")}.\n${b.purpose}\n${formatPeriod(b)}\n\nBitte prüfe auch mögliche Überschneidungen.`,
        this.token(id, "approve", a.id),
        "Anfrage prüfen",
        { revision: b.revision, status: "pending" },
      );
    }
  }
  create(input, actor = "applicant", manual = false) {
    return transaction(this.db, () => {
      const data = this.parse(input);
      const id = randomUUID();
      this.run(
        `INSERT INTO bookings(id,name,email,purpose,department,notes,start,end,all_day,status,manual,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id,
        data.name,
        data.email,
        data.purpose,
        data.department,
        data.notes,
        data.start,
        data.end,
        data.allDay,
        manual ? "approved" : "unverified",
        Number(manual),
        Date.now(),
        Date.now(),
      );
      if (manual) {
        if (
          this.conflicts(data.vehicleIds, data.start, data.end).some(
            (c) => c.blocking,
          )
        )
          fail(
            "Eine genehmigte Buchung oder Sperre überschneidet sich mit diesem Zeitraum.",
            409,
          );
        for (const v of data.vehicles)
          this.run(
            "INSERT INTO reservations(booking_id,vehicle_id,rule,required,state) VALUES (?,?,'any',1,'approved')",
            id,
            v.id,
          );
        this.enqueue("calendar", id, {});
        this.notify(id, "Buchung administrativ genehmigt");
      } else {
        this.snapshot(id, data);
        this.mail(
          id,
          data.email,
          "E-Mail-Adresse bestätigen",
          `${data.name}, bitte bestätige deine Buchungsanfrage. Erst danach wird sie zur Freigabe weitergeleitet.\n\n${data.purpose}\n${formatPeriod(data)}\n\nDer Bestätigungslink gilt 24 Stunden. Dies ist noch keine bestätigte Reservierung.`,
          this.token(id, "verify"),
          "E-Mail bestätigen",
          { revision: 1, status: "unverified" },
        );
        this.mail(
          id,
          data.email,
          "Dein Verwaltungslink",
          "Über diesen persönlichen Link kannst du den Status einsehen, Angaben ändern oder deine Buchung stornieren. Teile ihn nicht mit anderen.",
          this.token(id, "manage"),
        );
      }
      this.audit(actor, "booking.created", id, {
        vehicleIds: data.vehicleIds,
        start: data.start,
        end: data.end,
        manual,
      });
      return {
        id,
        status: manual ? "approved" : "unverified",
        message: manual
          ? "Buchung gespeichert."
          : "Bitte bestätige die Anfrage über den Link in deiner E-Mail.",
      };
    });
  }
  verify(raw) {
    return transaction(this.db, () => {
      const t = this.resolveToken(raw, ["verify"]);
      if (t.booking.status !== "unverified")
        fail("Diese Anfrage wurde bereits bearbeitet.", 409);
      if (t.booking.start <= Date.now())
        fail("Der Buchungsbeginn liegt bereits in der Vergangenheit.", 409);
      this.run("UPDATE tokens SET used=1 WHERE hash=?", t.hash);
      this.run(
        "UPDATE bookings SET status='pending',updated=? WHERE id=?",
        Date.now(),
        t.booking_id,
      );
      this.requestApprovals(t.booking_id);
      this.notify(t.booking_id, "E-Mail bestätigt – Freigabe ausstehend");
      this.audit("applicant", "booking.verified", t.booking_id);
      return this.get(t.booking_id, true);
    });
  }
  linkView(raw) {
    const t = this.resolveToken(raw, ["verify", "manage", "approve"]);
    const b = this.get(t.booking_id, true);
    const eligible =
      t.kind === "approve"
        ? this.all(
            "SELECT vehicle_id FROM eligible WHERE booking_id=? AND approver_id=?",
            b.id,
            t.approver_id,
          ).map((r) => r.vehicle_id)
        : [];
    return {
      kind: t.kind,
      booking: b,
      eligible,
      decisions:
        t.kind === "approve"
          ? this.all(
              "SELECT vehicle_id,decision,reason FROM decisions WHERE booking_id=? AND approver_id=?",
              b.id,
              t.approver_id,
            )
          : [],
      conflicts: this.conflicts(
        b.vehicles.map((v) => v.id),
        b.start,
        b.end,
        b.id,
      ),
    };
  }
  decide(raw, input) {
    return transaction(this.db, () => {
      const t = this.resolveToken(raw, ["approve"]);
      const b = t.booking;
      if (b.status !== "pending" || b.start <= Date.now())
        fail("Diese Anfrage ist nicht mehr zur Freigabe offen.", 409);
      if (!["approve", "reject"].includes(input.decision))
        fail("Ungültige Entscheidung.");
      const reason = text(input.reason, "Begründung", 1000, true);
      const ids = Array.isArray(input.vehicleIds)
        ? [...new Set(input.vehicleIds)]
        : [];
      if (!ids.length) fail("Bitte ein Fahrzeug zur Entscheidung auswählen.");
      for (const id of ids) {
        const eligible = this.one(
          "SELECT * FROM eligible WHERE booking_id=? AND vehicle_id=? AND approver_id=?",
          b.id,
          id,
          t.approver_id,
        );
        const r = this.one(
          "SELECT * FROM reservations WHERE booking_id=? AND vehicle_id=?",
          b.id,
          id,
        );
        if (!eligible)
          fail("Für dieses Fahrzeug besteht keine Freigabeberechtigung.", 403);
        if (
          r.state !== "pending" ||
          this.one(
            "SELECT 1 FROM decisions WHERE booking_id=? AND vehicle_id=? AND approver_id=?",
            b.id,
            id,
            t.approver_id,
          )
        )
          fail("Für dieses Fahrzeug wurde bereits entschieden.", 409);
        if (
          input.decision === "approve" &&
          this.conflicts([id], b.start, b.end, b.id).some((c) => c.blocking)
        )
          fail(
            "Eine bestätigte Buchung oder Fahrzeugsperre verhindert die Freigabe.",
            409,
          );
        this.run(
          "INSERT INTO decisions VALUES (?,?,?,?,?,?)",
          b.id,
          id,
          t.approver_id,
          input.decision,
          reason,
          Date.now(),
        );
        const votes = this.all(
          "SELECT decision FROM decisions WHERE booking_id=? AND vehicle_id=?",
          b.id,
          id,
        );
        const total = this.one(
          "SELECT count(*) AS n FROM eligible WHERE booking_id=? AND vehicle_id=?",
          b.id,
          id,
        ).n;
        const yes = votes.filter((v) => v.decision === "approve").length;
        const no = votes.length - yes;
        const state =
          r.rule === "any"
            ? input.decision === "approve"
              ? "approved"
              : "rejected"
            : yes >= r.required
              ? "approved"
              : total - no < r.required
                ? "rejected"
                : "pending";
        this.run(
          "UPDATE reservations SET state=? WHERE booking_id=? AND vehicle_id=?",
          state,
          b.id,
          id,
        );
      }
      const reservations = this.all(
        "SELECT * FROM reservations WHERE booking_id=?",
        b.id,
      );
      let status = "pending";
      if (reservations.some((r) => r.state === "rejected")) status = "rejected";
      else if (reservations.every((r) => r.state === "approved")) {
        if (
          this.conflicts(
            reservations.map((r) => r.vehicle_id),
            b.start,
            b.end,
            b.id,
          ).some((c) => c.blocking)
        )
          fail(
            "Die Belegung hat sich geändert. Eine vollständige Freigabe ist wegen eines Konflikts derzeit nicht möglich.",
            409,
          );
        if (
          reservations.some(
            (r) =>
              !this.one(
                "SELECT 1 FROM vehicles WHERE id=? AND active=1 AND archived=0",
                r.vehicle_id,
              ),
          )
        )
          fail(
            "Ein Fahrzeug ist inzwischen deaktiviert. Bitte die Verwaltung kontaktieren.",
            409,
          );
        status = "approved";
      }
      this.run(
        "UPDATE bookings SET status=?,updated=? WHERE id=?",
        status,
        Date.now(),
        b.id,
      );
      this.audit(
        `approver:${t.approver_id}`,
        `booking.${input.decision}`,
        b.id,
        { vehicleIds: ids, reason, status },
      );
      if (status !== "pending") {
        this.run(
          "UPDATE tokens SET used=1 WHERE booking_id=? AND kind='approve'",
          b.id,
        );
        this.notify(
          b.id,
          status === "approved" ? "Buchung genehmigt" : "Buchung abgelehnt",
          true,
        );
        if (status === "approved") this.enqueue("calendar", b.id, {});
      }
      return this.get(b.id, true);
    });
  }
  cancel(id, actor) {
    const b = this.get(id, true);
    if (["cancelled", "completed", "expired"].includes(b.status))
      fail("Diese Buchung kann nicht mehr storniert werden.", 409);
    this.run(
      "UPDATE bookings SET status='cancelled',updated=? WHERE id=?",
      Date.now(),
      id,
    );
    this.run(
      "UPDATE tokens SET used=1 WHERE booking_id=? AND kind<>'manage'",
      id,
    );
    this.enqueue("calendar", id, {});
    this.notify(id, "Buchung storniert", b.status !== "unverified");
    this.audit(actor, "booking.cancelled", id, { previousStatus: b.status });
    return this.get(id, true);
  }
  manage(raw, action, input) {
    return transaction(this.db, () => {
      const t = this.resolveToken(raw, ["manage"]);
      if (action === "cancel") return this.cancel(t.booking_id, "applicant");
      if (action !== "edit") fail("Ungültige Aktion.");
      return this.edit(t.booking_id, input, "applicant");
    });
  }
  edit(id, input, actor) {
    const before = this.get(id, true);
    if (!["pending", "approved", "unverified"].includes(before.status))
      fail("Diese Buchung kann nicht mehr geändert werden.", 409);
    const data = this.parse({
      ...input,
      name: before.name,
      email: before.email,
    });
    this.run("DELETE FROM reservations WHERE booking_id=?", id);
    this.snapshot(id, data);
    const status = before.status === "unverified" ? "unverified" : "pending";
    this.run(
      "UPDATE bookings SET purpose=?,department=?,notes=?,start=?,end=?,all_day=?,status=?,revision=revision+1,updated=? WHERE id=?",
      data.purpose,
      data.department,
      data.notes,
      data.start,
      data.end,
      data.allDay,
      status,
      Date.now(),
      id,
    );
    this.run(
      "UPDATE tokens SET used=1 WHERE booking_id=? AND kind<>'manage'",
      id,
    );
    this.enqueue("calendar", id, {});
    if (status === "pending") this.requestApprovals(id);
    else
      this.mail(
        id,
        before.email,
        "Geänderte Anfrage bestätigen",
        "Bitte bestätige deine aktualisierte Buchungsanfrage.",
        this.token(id, "verify"),
        "E-Mail bestätigen",
        { revision: before.revision + 1, status },
      );
    this.notify(
      id,
      "Buchungsanfrage geändert – erneute Freigabe erforderlich",
      before.status !== "unverified",
    );
    this.audit(actor, "booking.edited", id, {
      before,
      after: this.get(id, true),
    });
    return this.get(id, true);
  }
  calendar(start, end, vehicleId = "") {
    const bookings = this.all(
      "SELECT DISTINCT b.id,b.start FROM bookings b JOIN reservations r ON r.booking_id=b.id WHERE b.status IN ('pending','approved','completed') AND b.start<? AND b.end>? AND (?='' OR r.vehicle_id=?) ORDER BY b.start",
      end,
      start,
      vehicleId,
      vehicleId,
    ).map((b) => this.get(b.id));
    const blocks = this.all(
      "SELECT x.*,v.name AS vehicle_name,v.color FROM blocks x JOIN vehicles v ON v.id=x.vehicle_id WHERE x.start<? AND x.end>? AND (?='' OR x.vehicle_id=?)",
      end,
      start,
      vehicleId,
      vehicleId,
    );
    return { bookings, blocks };
  }
}
