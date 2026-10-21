import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { Integrations } from "../src/integrations.js";
import { transaction } from "../src/database.js";
import { fixture, pending, approve, token, input } from "./helpers.js";

test("SMTP failures remain durable and retry without exposing credentials or tokens", async () => {
  const s = fixture();
  let failures = 1;
  const sent = [];
  const i = new Integrations(s, {
    transport: {
      sendMail: async (mail) => {
        if (failures--) throw new Error("Sensitive SMTP details");
        sent.push(mail);
      },
    },
  });
  s.mail(
    null,
    "test@example.invalid",
    "Test",
    "<private body>",
    "https://example.invalid/#/manage/secret",
  );
  await i.processJobs(1);
  let job = s.one("SELECT * FROM jobs");
  assert.equal(job.status, "pending");
  assert.equal(job.attempts, 1);
  assert.ok(!job.error.includes("Sensitive"));
  s.run("UPDATE jobs SET next_at=0");
  await i.processJobs(1);
  job = s.one("SELECT * FROM jobs");
  assert.equal(job.status, "done");
  assert.equal(job.payload, "");
  assert.equal(sent.length, 1);
  assert.ok(sent[0].html.includes("&lt;private body&gt;"));
  assert.ok(sent[0].text.includes("#/manage/secret"));
  s.db.close();
});
test("Google service account signs JWT, caches access tokens and never sends SMTP secrets", async () => {
  const s = fixture();
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  s.config.google = {
    email: "account@example.invalid",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }),
  };
  let count = 0;
  const i = new Integrations(s, {
    fetch: async (url, options) => {
      assert.equal(url, "https://oauth2.googleapis.com/token");
      count++;
      const assertion = options.body.get("assertion"),
        parts = assertion.split(".");
      assert.equal(
        JSON.parse(Buffer.from(parts[1], "base64url")).iss,
        "account@example.invalid",
      );
      assert.ok(
        verify(
          "RSA-SHA256",
          Buffer.from(`${parts[0]}.${parts[1]}`),
          publicKey,
          Buffer.from(parts[2], "base64url"),
        ),
      );
      return Response.json({ access_token: "test-access", expires_in: 3600 });
    },
  });
  assert.equal(await i.googleToken(), "test-access");
  await i.googleToken();
  assert.equal(count, 1);
  s.db.close();
});
test("calendar synchronization is idempotent, does not publish contact data, and reconciles edit/cancellation", async () => {
  const s = fixture();
  s.run(
    "UPDATE vehicles SET calendar_id='calendar@example.invalid' WHERE id='v1'",
  );
  const b = pending(s),
    manage = token(s, b.id, "manage");
  approve(s, b.id);
  const i = new Integrations(s),
    calls = [];
  i.google = async (method, calendar, path, body) => {
    calls.push({ method, calendar, path, body });
    return new Response(null, { status: method === "DELETE" ? 204 : 200 });
  };
  await i.syncCalendar(b.id);
  await i.syncCalendar(b.id);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "POST");
  assert.ok(!JSON.stringify(calls[0].body).includes("person@example.invalid"));
  const oldId = calls[0].body.id;
  s.manage(manage, "edit", input({ endTime: "21:00" }));
  await i.syncCalendar(b.id);
  assert.equal(calls[1].method, "DELETE");
  approve(s, b.id);
  await i.syncCalendar(b.id);
  assert.notEqual(calls[2].body.id, oldId);
  s.manage(manage, "cancel", {});
  await i.syncCalendar(b.id);
  assert.equal(calls[3].method, "DELETE");
  assert.equal(s.one("SELECT status FROM calendar_events").status, "deleted");
  s.db.close();
});
test("failed calendar updates retry using a stable event ID; remote duplicates are updated", async () => {
  const s = fixture();
  s.run("UPDATE vehicles SET calendar_id='private-calendar' WHERE id='v1'");
  const b = pending(s);
  approve(s, b.id);
  s.run("UPDATE jobs SET status='done' WHERE type='mail'");
  const i = new Integrations(s);
  let fail = true;
  const ids = [];
  i.google = async (method, calendar, path, body) => {
    if (body) ids.push(body.id);
    return new Response(null, {
      status: fail ? 503 : method === "POST" ? 409 : 200,
    });
  };
  await i.processJobs(1);
  assert.equal(
    s.one("SELECT status FROM jobs WHERE type='calendar'").status,
    "pending",
  );
  assert.equal(s.one("SELECT status FROM calendar_events").status, "error");
  fail = false;
  s.run("UPDATE jobs SET next_at=0 WHERE type='calendar'");
  await i.processJobs(1);
  assert.equal(s.one("SELECT status FROM calendar_events").status, "synced");
  assert.ok(ids.every((id) => id === ids[0]));
  s.db.close();
});
test("queued verification/freigabe messages are discarded after cancellation; stale mail does not send", async () => {
  const s = fixture(),
    b = s.create(input());
  transaction(s.db, () => s.cancel(b.id, "admin"));
  const sent = [],
    i = new Integrations(s, {
      transport: { sendMail: async (data) => sent.push(data) },
    });
  await i.processJobs(20);
  assert.ok(
    sent.every((mail) => !mail.subject.includes("E-Mail-Adresse bestätigen")),
  );
  s.db.close();
});
test("maintenance expires pending requests, completes ended bookings and removes data after retention", () => {
  const s = fixture(),
    b = pending(s),
    i = new Integrations(s);
  s.run(
    "UPDATE bookings SET start=?,end=? WHERE id=?",
    Date.now() - 2000,
    Date.now() + 100000,
    b.id,
  );
  i.maintenance();
  assert.equal(s.get(b.id).status, "expired");
  const c = pending(s);
  approve(s, c.id);
  s.run(
    "UPDATE bookings SET start=?,end=? WHERE id=?",
    Date.now() - 100000,
    Date.now() - 1,
    c.id,
  );
  i.maintenance();
  assert.equal(s.get(c.id).status, "completed");
  s.run("UPDATE jobs SET status='done' WHERE booking_id=?", c.id);
  s.run(
    "UPDATE bookings SET start=?,end=? WHERE id=?",
    Date.now() - 400 * 86400000 - 2000,
    Date.now() - 400 * 86400000,
    c.id,
  );
  i.maintenance();
  assert.equal(s.one("SELECT id FROM bookings WHERE id=?", c.id), undefined);
  s.db.close();
});
test("separate background workers serialize calendar jobs for the same booking", async () => {
  const s = fixture(),
    b = pending(s);
  approve(s, b.id);
  s.run("UPDATE jobs SET status='done' WHERE type='mail'");
  s.enqueue("calendar", b.id, {});
  const first = new Integrations(s),
    second = new Integrations(s);
  let release;
  const wait = new Promise((resolve) => (release = resolve));
  let calls = 0;
  first.syncCalendar = async () => {
    calls++;
    await wait;
  };
  second.syncCalendar = async () => {
    calls++;
  };
  const running = first.processJobs(1);
  await second.processJobs(1);
  assert.equal(calls, 1);
  assert.equal(
    s.one(
      "SELECT count(*) AS n FROM jobs WHERE type='calendar' AND status='pending'",
    ).n,
    1,
  );
  release();
  await running;
  await second.processJobs(1);
  assert.equal(calls, 2);
  s.db.close();
});
