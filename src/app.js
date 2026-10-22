import express from "express";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  digest,
  randomToken,
  hashPassword,
  verifyPassword,
  text,
  email,
  fail,
} from "./security.js";
import { interval, dayBounds } from "./time.js";
import { transaction } from "./database.js";

export function createApp(service, integrations) {
  const s = service,
    config = s.config;
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", config.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "default-src": ["'self'"],
          "script-src": ["'self'"],
          "style-src": ["'self'"],
          "img-src": ["'self'", "https:"],
          "connect-src": ["'self'"],
          "form-action": ["'self'"],
          "frame-ancestors": ["'none'"],
          "upgrade-insecure-requests": config.production ? [] : null,
        },
      },
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
  app.use((req, res, next) => {
    if (config.production && !req.secure)
      return res
        .status(400)
        .send("HTTPS is required. Check reverse proxy settings.");
    next();
  });
  app.get("/healthz", (req, res) => {
    s.one("SELECT 1");
    res.json({ status: "ok" });
  });
  app.use("/api", express.json({ limit: "32kb" }));
  function limit(req, group, max, windowMs) {
    const key = digest(`${group}:${req.ip}`);
    const now = Date.now();
    const row = s.one("SELECT * FROM rate_limits WHERE key=?", key);
    if (row && row.reset_at > now && row.count >= max)
      fail("Zu viele Versuche. Bitte später erneut versuchen.", 429);
    s.run(
      "INSERT INTO rate_limits VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,reset_at=excluded.reset_at",
      key,
      row && row.reset_at > now ? row.count + 1 : 1,
      row && row.reset_at > now ? row.reset_at : now + windowMs,
    );
  }
  const cookieName = config.production ? "__Host-bb" : "bb";
  function setCookie(res, value) {
    res.cookie(cookieName, value, {
      httpOnly: true,
      secure: config.production,
      sameSite: "strict",
      maxAge: 12 * 3600000,
      path: "/",
    });
  }
  function newSession(req, res, pin = false, adminId = null) {
    if (req.session)
      s.run("DELETE FROM sessions WHERE hash=?", req.session.hash);
    const token = randomToken();
    const csrf = randomToken();
    s.run(
      "INSERT INTO sessions VALUES (?,?,?,?,?)",
      digest(token),
      csrf,
      Number(pin),
      adminId,
      Date.now() + 12 * 3600000,
    );
    req.session = s.one("SELECT * FROM sessions WHERE hash=?", digest(token));
    setCookie(res, token);
    return csrf;
  }
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    limit(req, "api", 300, 60000);
    const raw = (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    req.session =
      raw && raw.length === 43
        ? s.one(
            "SELECT * FROM sessions WHERE hash=? AND expires>?",
            digest(raw),
            Date.now(),
          )
        : null;
    if (!req.session && req.path === "/session" && req.method === "GET")
      newSession(req, res);
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (
        req.get("origin") !== new URL(config.baseUrl).origin ||
        !req.session ||
        req.get("x-csrf-token") !== req.session.csrf
      )
        fail("Die Sitzung ist ungültig. Bitte die Seite neu laden.", 403);
    }
    next();
  });
  const gate = (req, res, next) => {
    if (!req.session?.pin) fail("Bitte zuerst die Website-PIN eingeben.", 401);
    next();
  };
  const admin = (req, res, next) => {
    if (!req.session?.admin_id)
      fail("Administrativer Login erforderlich.", 403);
    next();
  };
  app.get("/api/session", (req, res) =>
    res.json({
      pin: Boolean(req.session?.pin),
      admin: Boolean(req.session?.admin_id),
      csrf: req.session.csrf,
      siteName:
        s.one("SELECT value FROM settings WHERE key='site_name'")?.value ||
        config.siteName,
    }),
  );
  app.post("/api/pin", (req, res) => {
    limit(req, "pin", 5, 15 * 60000);
    if (
      !/^\d{4}$/.test(req.body.pin || "") ||
      !verifyPassword(
        req.body.pin,
        s.one("SELECT value FROM settings WHERE key='pin_hash'")?.value,
      )
    )
      fail("Die PIN ist nicht korrekt.", 401);
    res.json({ csrf: newSession(req, res, true), pin: true });
  });
  app.post("/api/logout", (req, res) =>
    res.json({ csrf: newSession(req, res), pin: false, admin: false }),
  );
  app.use("/api", gate);
  app.post("/api/admin/login", (req, res) => {
    limit(req, "admin", 5, 15 * 60000);
    const user = s.one(
      "SELECT * FROM admins WHERE username=?",
      String(req.body.username || "").toLowerCase(),
    );
    const encoded =
      user?.password_hash ||
      s.one("SELECT password_hash FROM admins LIMIT 1")?.password_hash;
    const valid = verifyPassword(req.body.password, encoded);
    if (!user || !valid)
      fail("Benutzername oder Passwort ist nicht korrekt.", 401);
    s.audit(`admin:${user.id}`, "admin.login", null);
    res.json({ csrf: newSession(req, res, true, user.id), admin: true });
  });
  app.get("/api/vehicles", (req, res) => res.json(s.vehicleList()));
  app.get("/api/calendar", (req, res) => {
    const start = Number(req.query.start),
      end = Number(req.query.end);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start ||
      end - start > 370 * 86400000
    )
      fail("Ungültiger Kalenderzeitraum.");
    res.json(s.calendar(start, end, String(req.query.vehicleId || "")));
  });
  app.post("/api/conflicts", (req, res) => {
    const times = interval(req.body);
    // Exclusion is only accepted with a valid personal management token.
    const exclude = req.body.token
      ? s.resolveToken(req.body.token, ["manage"]).booking_id
      : req.session.admin_id
        ? String(req.body.excludeBookingId || "")
        : "";
    res.json(
      s.conflicts(req.body.vehicleIds || [], times.start, times.end, exclude),
    );
  });
  app.post("/api/bookings", (req, res) => {
    limit(req, "booking", 10, 3600000);
    res.status(201).json(s.create(req.body));
  });
  app.post("/api/link", (req, res) => {
    limit(req, "token", 90, 60000);
    res.json(s.linkView(req.body.token));
  });
  app.post("/api/verify", (req, res) => {
    limit(req, "token", 90, 60000);
    res.json(s.verify(req.body.token));
  });
  app.post("/api/decide", (req, res) => {
    limit(req, "token", 90, 60000);
    res.json(s.decide(req.body.token, req.body));
  });
  app.post("/api/manage", (req, res) => {
    limit(req, "token", 90, 60000);
    res.json(s.manage(req.body.token, req.body.action, req.body));
  });
  app.use("/api/admin", admin);
  app.get("/api/admin/overview", (req, res) =>
    res.json({
      vehicles: s.vehicleList(true),
      approvers: s.all("SELECT * FROM approvers ORDER BY name"),
      blocks: s.all("SELECT * FROM blocks ORDER BY start DESC"),
      counts: s.all(
        "SELECT status,count(*) AS count FROM bookings GROUP BY status",
      ),
      jobs: s.all(
        "SELECT id,type,booking_id,attempts,status,error,next_at,created FROM jobs WHERE status<>'done' ORDER BY created LIMIT 200",
      ),
      settings: {
        siteName: s.one("SELECT value FROM settings WHERE key='site_name'")
          .value,
        smtpConfigured: Boolean(config.smtp.host && config.smtp.from),
        googleConfigured: Boolean(
          config.google.email && config.google.privateKey,
        ),
        retentionDays: config.retentionDays,
        databaseType: s.db.kind === "mariadb" ? "MariaDB / MySQL" : "SQLite",
      },
    }),
  );
  app.get("/api/admin/bookings", (req, res) => {
    const status = String(req.query.status || ""),
      search = String(req.query.search || "").slice(0, 100),
      vehicle = String(req.query.vehicleId || "");
    const start = req.query.startDate
        ? dayBounds(req.query.startDate).start
        : Number(req.query.start || 0),
      end = req.query.endDate
        ? dayBounds(req.query.endDate).end
        : Number(req.query.end || 9999999999999);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
      fail("Ungültiger Filterzeitraum.");
    res.json(
      s
        .all(
          `SELECT DISTINCT b.id,b.created FROM bookings b JOIN reservations r ON r.booking_id=b.id WHERE (?='' OR b.status=?) AND b.name LIKE ?
      AND (?='' OR r.vehicle_id=?) AND b.start<? AND b.end>? ORDER BY b.created DESC LIMIT 300`,
          status,
          status,
          `%${search}%`,
          vehicle,
          vehicle,
          end,
          start,
        )
        .map((b) => ({
          ...s.get(b.id, true),
          conflicts: s.conflicts(
            s.get(b.id).vehicles.map((v) => v.id),
            s.get(b.id).start,
            s.get(b.id).end,
            b.id,
          ),
          history: s.all(
            "SELECT * FROM audit WHERE booking_id=? ORDER BY created DESC",
            b.id,
          ),
          decisions: s.all(
            "SELECT d.*,a.name AS approver_name FROM decisions d JOIN approvers a ON a.id=d.approver_id WHERE d.booking_id=?",
            b.id,
          ),
        })),
    );
  });
  app.post("/api/admin/bookings", (req, res) =>
    res
      .status(201)
      .json(s.create(req.body, `admin:${req.session.admin_id}`, true)),
  );
  app.post("/api/admin/bookings/:id", (req, res) =>
    res.json(
      transaction(s.db, () =>
        req.body.action === "cancel"
          ? s.cancel(req.params.id, `admin:${req.session.admin_id}`)
          : req.body.action === "edit"
            ? s.edit(req.params.id, req.body, `admin:${req.session.admin_id}`)
            : fail("Ungültige Aktion."),
      ),
    ),
  );
  app.post("/api/admin/approvers", (req, res) =>
    res.json(
      transaction(s.db, () => {
        const id = req.body.id || randomUUID();
        if (req.body.id && !s.one("SELECT id FROM approvers WHERE id=?", id))
          fail("Person nicht gefunden.", 404);
        const previous = s.one("SELECT email FROM approvers WHERE id=?", id);
        const name = text(req.body.name, "Name", 100),
          contact = email(req.body.email),
          active = Number(req.body.active !== false);
        s.run(
          "INSERT INTO approvers VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,active=excluded.active",
          id,
          name,
          contact,
          active,
        );
        if (!active || (previous && previous.email !== contact))
          s.run("UPDATE tokens SET used=1 WHERE approver_id=?", id);
        s.audit(`admin:${req.session.admin_id}`, "approver.saved", null, {
          id,
          name,
          active,
        });
        return { id };
      }),
    ),
  );
  app.post("/api/admin/vehicles", (req, res) =>
    res.json(
      transaction(s.db, () => {
        const v = req.body,
          id = v.id || randomUUID();
        if (v.id && !s.one("SELECT id FROM vehicles WHERE id=?", id))
          fail("Fahrzeug nicht gefunden.", 404);
        const ids = Array.isArray(v.approverIds)
          ? [...new Set(v.approverIds)]
          : [];
        if (
          ids.length > 100 ||
          ids.some(
            (id) =>
              !s.one("SELECT id FROM approvers WHERE id=? AND active=1", id),
          )
        )
          fail("Bitte aktive Freigabeberechtigte auswählen.");
        const rule = v.rule || "any",
          quorum = Number(v.quorum || 1);
        if (
          !["any", "all", "quorum"].includes(rule) ||
          !Number.isInteger(quorum) ||
          quorum < 1 ||
          (rule === "quorum" && quorum > ids.length)
        )
          fail("Ungültige Freigaberegel.");
        if (v.active !== false && !v.archived && !ids.length)
          fail(
            "Ein aktives Fahrzeug benötigt mindestens einen Freigabeberechtigten.",
          );
        const color = /^#[a-f\d]{6}$/i.test(v.color || "")
          ? v.color
          : "#2563eb";
        const image = text(v.image, "Bild-URL", 1000, true);
        if (image && !/^https:\/\/[^\s]+$/i.test(image))
          fail("Bilder müssen über eine HTTPS-URL erreichbar sein.");
        const seats =
          v.seats === "" || v.seats === undefined || v.seats === null
            ? null
            : Number(v.seats);
        if (
          seats !== null &&
          (!Number.isInteger(seats) || seats < 1 || seats > 100)
        )
          fail("Ungültige Sitzplatzanzahl.");
        const sortOrder = Number(v.sort_order || 0);
        if (!Number.isInteger(sortOrder) || Math.abs(sortOrder) > 10000)
          fail("Ungültige Reihenfolge.");
        s.run(
          `INSERT INTO vehicles VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,callsign=excluded.callsign,plate=excluded.plate,description=excluded.description,seats=excluded.seats,image=excluded.image,
      color=excluded.color,active=excluded.active,archived=excluded.archived,sort_order=excluded.sort_order,rule=excluded.rule,quorum=excluded.quorum,calendar_id=excluded.calendar_id`,
          id,
          text(v.name, "Fahrzeugname", 100),
          text(v.callsign, "Funkrufname", 100, true),
          text(v.plate, "Kennzeichen", 30, true),
          text(v.description, "Beschreibung", 1000, true),
          seats,
          image,
          color,
          Number(v.active !== false && !v.archived),
          Number(Boolean(v.archived)),
          sortOrder,
          rule,
          quorum,
          text(v.calendar_id, "Kalender-ID", 300, true),
        );
        s.run("DELETE FROM vehicle_approvers WHERE vehicle_id=?", id);
        ids.forEach((a) =>
          s.run("INSERT INTO vehicle_approvers VALUES (?,?)", id, a),
        );
        for (const b of s.all(
          "SELECT DISTINCT b.id FROM bookings b JOIN reservations r ON r.booking_id=b.id WHERE r.vehicle_id=? AND b.status IN ('approved','completed')",
          id,
        ))
          s.enqueue("calendar", b.id, {});
        s.audit(`admin:${req.session.admin_id}`, "vehicle.saved", null, {
          id,
          name: v.name,
          rule,
          approverIds: ids,
        });
        return { id };
      }),
    ),
  );
  app.post("/api/admin/blocks", (req, res) =>
    res.json(
      transaction(s.db, () => {
        const period = interval(req.body),
          id = randomUUID();
        if (!s.one("SELECT id FROM vehicles WHERE id=?", req.body.vehicleId))
          fail("Fahrzeug nicht gefunden.");
        const affected = s.conflicts(
          [req.body.vehicleId],
          period.start,
          period.end,
        );
        if (
          affected.some((c) => c.blocking) &&
          req.body.confirmConflicts !== true
        )
          fail(
            "Die Sperre betrifft genehmigte Buchungen. Bitte die betroffenen Personen informieren und die Sperre ausdrücklich bestätigen.",
            409,
          );
        s.run(
          "INSERT INTO blocks VALUES (?,?,?,?,?)",
          id,
          req.body.vehicleId,
          period.start,
          period.end,
          text(req.body.reason, "Sperrgrund", 300),
        );
        s.audit(`admin:${req.session.admin_id}`, "block.created", null, {
          id,
          ...period,
          affected: affected.map((a) => a.id),
        });
        return { id, affected };
      }),
    ),
  );
  app.delete("/api/admin/blocks/:id", (req, res) => {
    s.run("DELETE FROM blocks WHERE id=?", req.params.id);
    s.audit(`admin:${req.session.admin_id}`, "block.deleted", null, {
      id: req.params.id,
    });
    res.json({ ok: true });
  });
  app.post("/api/admin/settings", (req, res) =>
    res.json(
      transaction(s.db, () => {
        if (req.body.pin !== undefined && req.body.pin !== "") {
          if (!/^\d{4}$/.test(req.body.pin))
            fail("Die PIN muss genau vier Ziffern enthalten.");
          s.run(
            "UPDATE settings SET value=? WHERE key='pin_hash'",
            hashPassword(req.body.pin),
          );
          s.run("DELETE FROM sessions WHERE hash<>?", req.session.hash);
        }
        if (req.body.password) {
          const password = text(req.body.password, "Passwort", 256);
          if (password.length < 12)
            fail("Das Passwort muss mindestens 12 Zeichen enthalten.");
          s.run(
            "UPDATE admins SET password_hash=? WHERE id=?",
            hashPassword(password),
            req.session.admin_id,
          );
          s.run(
            "DELETE FROM sessions WHERE hash<>? AND admin_id=?",
            req.session.hash,
            req.session.admin_id,
          );
        }
        s.run(
          "UPDATE settings SET value=? WHERE key='site_name'",
          text(req.body.siteName, "Name der Feuerwehr", 100),
        );
        s.audit(`admin:${req.session.admin_id}`, "settings.changed", null, {
          pinChanged: Boolean(req.body.pin),
          passwordChanged: Boolean(req.body.password),
        });
        return { ok: true };
      }),
    ),
  );
  app.post("/api/admin/test-smtp", async (req, res) => {
    limit(req, "mailtest", 5, 3600000);
    await integrations.sendMail({
      to: email(req.body.email),
      subject: "BlaulichtBooking: SMTP-Test",
      body: "Der SMTP-Versand funktioniert.",
      link: null,
    });
    res.json({ message: "Test-E-Mail versendet." });
  });
  app.post("/api/admin/test-calendar", async (req, res) =>
    res.json(
      await integrations.testCalendar(
        text(req.body.calendarId, "Kalender-ID", 300),
      ),
    ),
  );
  app.post("/api/admin/retry", (req, res) => {
    s.run(
      "UPDATE jobs SET status='pending',attempts=0,next_at=? WHERE status='failed' OR status='pending'",
      Date.now(),
    );
    s.audit(`admin:${req.session.admin_id}`, "jobs.retried", null);
    res.json({ message: "Ausstehende Aufgaben werden erneut ausgeführt." });
  });
  app.get("/api/admin/audit", (req, res) =>
    res.json(s.all("SELECT * FROM audit ORDER BY id DESC LIMIT 300")),
  );
  app.use("/api", (req, res) =>
    res.status(404).json({ message: "Endpunkt nicht gefunden." }),
  );
  app.use(
    express.static(fileURLToPath(new URL("../public/", import.meta.url)), {
      etag: true,
      maxAge: 0,
      index: "index.html",
    }),
  );
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || 500;
    if (status >= 500)
      console.error(`Request failed: ${req.method} ${req.path} (${status})`);
    res.status(status).json({
      message:
        status >= 500
          ? "Die Aktion konnte nicht ausgeführt werden. Bitte Einstellungen und Verbindungsstatus prüfen."
          : error.message,
    });
  });
  return app;
}
