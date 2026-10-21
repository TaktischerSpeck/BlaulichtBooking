import nodemailer from "nodemailer";
import { createSign } from "node:crypto";
import { digest, fail, unseal } from "./security.js";
import { transaction } from "./database.js";
import { formatPeriod } from "./time.js";

const escape = (str) =>
  String(str).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
export class Integrations {
  constructor(service, options = {}) {
    this.s = service;
    this.config = service.config;
    this.fetch = options.fetch || fetch;
    this.transport = options.transport;
    this.busy = false;
    this.access = null;
  }
  smtp() {
    if (this.transport) return this.transport;
    const c = this.config.smtp;
    if (!c.host || !c.from) throw new Error("SMTP is not configured");
    this.transport = nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.secure,
      requireTLS: !c.secure,
      auth: c.user ? { user: c.user, pass: c.pass } : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    });
    return this.transport;
  }
  async sendMail(data) {
    const c = this.config.smtp;
    const text = `${data.body}${data.link ? `\n\n${data.linkLabel}: ${data.link}` : ""}\n\n${this.config.siteName}`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#132339;line-height:1.65"><h2 style="color:#bb2337">BlaulichtBooking</h2><div style="white-space:pre-wrap">${escape(data.body)}</div>${data.link ? `<p><a href="${escape(data.link)}" style="display:inline-block;background:#172a43;color:white;padding:12px 20px;border-radius:8px">${escape(data.linkLabel)}</a></p>` : ""}<p style="color:#65748a">${escape(this.config.siteName)}</p></div>`;
    await this.smtp().sendMail({
      from: { name: c.name, address: c.from },
      to: data.to,
      subject: data.subject,
      text,
      html,
    });
  }
  async googleToken() {
    if (this.access?.expires > Date.now() + 60000) return this.access.token;
    const c = this.config.google;
    if (!c.email || !c.privateKey)
      throw new Error("Google service account is not configured");
    const encode = (value) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: c.email, scope: "https://www.googleapis.com/auth/calendar", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
    const sign = createSign("RSA-SHA256");
    sign.update(payload);
    const assertion = `${payload}.${sign.sign(c.privateKey, "base64url")}`;
    const response = await this.fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!response.ok)
      throw new Error(`Google authentication failed (${response.status})`);
    const result = await response.json();
    this.access = {
      token: result.access_token,
      expires: Date.now() + result.expires_in * 1000,
    };
    return this.access.token;
  }
  async google(method, calendarId, path = "", body = undefined) {
    const token = await this.googleToken();
    const response = await this.fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}${path}`,
      {
        method,
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    if (response.status === 401) this.access = null;
    return response;
  }
  async removeEvent(event) {
    const response = await this.google(
      "DELETE",
      event.calendar_id,
      `/events/${event.event_id}?sendUpdates=none`,
    );
    if (![204, 404, 410].includes(response.status))
      throw new Error(`Google event removal failed (${response.status})`);
    this.s.run(
      "UPDATE calendar_events SET status='deleted',error=NULL WHERE booking_id=? AND vehicle_id=? AND calendar_id=?",
      event.booking_id,
      event.vehicle_id,
      event.calendar_id,
    );
  }
  async syncCalendar(id) {
    const b = this.s.get(id, true);
    const wanted = ["approved", "completed"].includes(b.status)
      ? this.s.all(
          "SELECT v.* FROM vehicles v JOIN reservations r ON r.vehicle_id=v.id WHERE r.booking_id=? AND v.calendar_id<>''",
          id,
        )
      : [];
    const existing = this.s.all(
      "SELECT * FROM calendar_events WHERE booking_id=?",
      id,
    );
    for (const event of existing) {
      const v = wanted.find(
        (v) => v.id === event.vehicle_id && v.calendar_id === event.calendar_id,
      );
      const eventId = v ? digest(`${id}:${v.id}:${b.revision}`) : null;
      if ((!v || eventId !== event.event_id) && event.status !== "deleted")
        await this.removeEvent(event);
    }
    for (const v of wanted) {
      const eventId = digest(`${id}:${v.id}:${b.revision}`);
      const old = existing.find(
        (e) => e.vehicle_id === v.id && e.calendar_id === v.calendar_id,
      );
      if (
        old?.status === "synced" &&
        old.event_id === eventId &&
        old.synced_revision === b.revision
      )
        continue;
      this.s.run(
        `INSERT INTO calendar_events(booking_id,vehicle_id,calendar_id,event_id) VALUES (?,?,?,?)
        ON CONFLICT(booking_id,vehicle_id,calendar_id) DO UPDATE SET event_id=excluded.event_id,status='pending'`,
        id,
        v.id,
        v.calendar_id,
        eventId,
      );
      const event = {
        id: eventId,
        summary: `${v.name} · ${b.purpose}`,
        description: `Gebucht von: ${b.name}\n${formatPeriod(b)}\nBuchungsnummer: ${b.id}`,
        start: {
          dateTime: new Date(b.start).toISOString(),
          timeZone: "Europe/Berlin",
        },
        end: {
          dateTime: new Date(b.end).toISOString(),
          timeZone: "Europe/Berlin",
        },
        visibility: "private",
        transparency: "opaque",
        extendedProperties: { private: { bookingId: b.id, vehicleId: v.id } },
      };
      let response = await this.google(
        "POST",
        v.calendar_id,
        "/events?sendUpdates=none",
        event,
      );
      if (response.status === 409)
        response = await this.google(
          "PUT",
          v.calendar_id,
          `/events/${eventId}?sendUpdates=none`,
          event,
        );
      if (!response.ok)
        throw new Error(
          `Google event synchronization failed (${response.status})`,
        );
      this.s.run(
        "UPDATE calendar_events SET status='synced',synced_revision=?,error=NULL WHERE booking_id=? AND vehicle_id=? AND calendar_id=?",
        b.revision,
        id,
        v.id,
        v.calendar_id,
      );
    }
  }
  async testCalendar(calendarId) {
    const response = await this.google("GET", calendarId);
    if (!response.ok)
      fail(`Google-Kalender nicht erreichbar (HTTP ${response.status}).`, 502);
    const result = await response.json();
    return {
      name: result.summary,
      message:
        "Kalender erfolgreich verbunden. Schreibrechte bitte über eine Testbuchung prüfen. Namen können bei einer öffentlichen Kalenderfreigabe außerhalb der Website sichtbar sein.",
    };
  }
  async processJobs(limit = 10) {
    if (this.busy) return;
    this.busy = true;
    try {
      for (let index = 0; index < limit; index++) {
        const job = transaction(this.s.db, () => {
          const row = this.s.one(
            `SELECT j.* FROM jobs j WHERE j.status IN ('pending','processing') AND j.next_at<=?
            AND (j.type<>'calendar' OR NOT EXISTS (SELECT 1 FROM jobs active WHERE active.type='calendar'
              AND active.booking_id=j.booking_id AND active.status='processing' AND active.next_at>?))
            ORDER BY j.created LIMIT 1`,
            Date.now(),
            Date.now(),
          );
          if (row)
            this.s.run(
              "UPDATE jobs SET status='processing',next_at=? WHERE id=?",
              Date.now() + 3 * 60000,
              row.id,
            );
          return row;
        });
        if (!job) break;
        // Serialize calendar reconciliation per booking across all app processes.
        const heartbeat = setInterval(
          () =>
            this.s.run(
              "UPDATE jobs SET next_at=? WHERE id=? AND status='processing'",
              Date.now() + 3 * 60000,
              job.id,
            ),
          60000,
        );
        heartbeat.unref();
        try {
          const payload = unseal(job.payload, this.config.appKey);
          const b = job.booking_id
            ? this.s.one("SELECT * FROM bookings WHERE id=?", job.booking_id)
            : null;
          if (job.type === "calendar") await this.syncCalendar(job.booking_id);
          else if (
            !payload.guard ||
            (b &&
              b.status === payload.guard.status &&
              b.revision === payload.guard.revision)
          )
            await this.sendMail(payload);
          this.s.run(
            "UPDATE jobs SET status='done',payload='',error=NULL WHERE id=?",
            job.id,
          );
        } catch {
          const attempts = job.attempts + 1;
          const error =
            job.type === "mail"
              ? "SMTP delivery failed. Check server configuration and connectivity."
              : "Google synchronization failed. Check credentials, calendar ID and write access.";
          this.s.run(
            "UPDATE jobs SET status=?,attempts=?,next_at=?,error=? WHERE id=?",
            attempts >= 8 ? "failed" : "pending",
            attempts,
            Date.now() + Math.min(6 * 3600000, 30000 * 2 ** attempts),
            error,
            job.id,
          );
          if (job.type === "calendar")
            this.s.run(
              "UPDATE calendar_events SET status='error',error=? WHERE booking_id=? AND status<>'deleted'",
              error,
              job.booking_id,
            );
          console.error(
            `Background ${job.type} job failed (attempt ${attempts})`,
          );
        } finally {
          clearInterval(heartbeat);
        }
      }
    } finally {
      this.busy = false;
    }
  }
  maintenance() {
    transaction(this.s.db, () => {
      const now = Date.now();
      for (const b of this.s.all(
        "SELECT id FROM bookings WHERE (status='unverified' AND created<?) OR (status='pending' AND start<=?)",
        now - 86400000,
        now,
      )) {
        this.s.run(
          "UPDATE bookings SET status='expired',updated=? WHERE id=?",
          now,
          b.id,
        );
        this.s.run(
          "UPDATE tokens SET used=1 WHERE booking_id=? AND kind<>'manage'",
          b.id,
        );
        this.s.audit("system", "booking.expired", b.id);
      }
      this.s.run(
        "UPDATE bookings SET status='completed',updated=? WHERE status='approved' AND end<=?",
        now,
        now,
      );
      this.s.run("DELETE FROM sessions WHERE expires<?", now);
      this.s.run("DELETE FROM rate_limits WHERE reset_at<?", now);
      this.s.run("DELETE FROM tokens WHERE expires<?", now - 86400000);
      this.s.run(
        "DELETE FROM jobs WHERE status='done' AND created<?",
        now - 7 * 86400000,
      );
      const cutoff = now - this.config.retentionDays * 86400000;
      for (const b of this.s.all(
        "SELECT id FROM bookings WHERE end<?",
        cutoff,
      )) {
        // Keep records until outstanding external cleanup has completed.
        if (
          this.s.one(
            "SELECT id FROM jobs WHERE booking_id=? AND type='calendar' AND status<>'done'",
            b.id,
          )
        )
          continue;
        this.s.run("DELETE FROM audit WHERE booking_id=?", b.id);
        this.s.run("DELETE FROM bookings WHERE id=?", b.id);
      }
      this.s.run("DELETE FROM audit WHERE created<?", cutoff);
    });
  }
}
