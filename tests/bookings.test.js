import { test } from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { interval } from "../src/time.js";
import { digest } from "../src/security.js";
import { transaction } from "../src/database.js";
import {
  fixture,
  input,
  token,
  pending,
  approve,
  payloads,
} from "./helpers.js";

test("single and multi-vehicle requests require email verification; public data excludes private fields", () => {
  const s = fixture();
  const b = s.create(
    input({ vehicleIds: ["v1", "v2", "v1"], notes: "Private note" }),
  );
  assert.equal(b.status, "unverified");
  assert.equal(s.get(b.id).vehicles.length, 2);
  assert.equal(s.get(b.id).email, undefined);
  assert.equal(s.get(b.id).notes, undefined);
  assert.equal(s.calendar(0, 9999999999999).bookings.length, 0);
  assert.equal(
    payloads(s).filter((j) => j.data.subject.includes("Freigabe angefragt"))
      .length,
    0,
  );
  s.verify(token(s, b.id, "verify"));
  assert.equal(s.get(b.id).status, "pending");
  assert.equal(
    payloads(s).filter((j) => j.data.subject.includes("Freigabe angefragt"))
      .length,
    3,
  );
  assert.equal(s.calendar(0, 9999999999999).bookings[0].email, undefined);
  const stored =
    JSON.stringify(s.all("SELECT * FROM tokens")) +
    JSON.stringify(s.all("SELECT payload FROM jobs"));
  assert.ok(!stored.includes("person@example.invalid"));
  s.db.close();
});
test("per-vehicle approval and recipient permissions; the whole request is approved atomically", () => {
  const s = fixture();
  s.run(
    "DELETE FROM vehicle_approvers WHERE vehicle_id='v2' AND approver_id<>'b'",
  );
  const b = pending(s, { vehicleIds: ["v1", "v2"] });
  assert.throws(() => approve(s, b.id, "a", ["v2"]), /Freigabeberechtigung/);
  assert.equal(approve(s, b.id).status, "pending");
  assert.equal(payloads(s, "calendar").length, 0);
  assert.equal(approve(s, b.id, "b", ["v2"]).status, "approved");
  assert.equal(payloads(s, "calendar").length, 1);
  s.db.close();
});
test("any rule: first rejection is final; replaying a decision cannot change it", () => {
  const s = fixture(),
    b = pending(s);
  assert.equal(approve(s, b.id, "a", ["v1"], "reject").status, "rejected");
  assert.throws(() => approve(s, b.id, "b"), /nicht mehr/);
  assert.equal(s.one("SELECT count(*) AS n FROM decisions").n, 1);
  s.db.close();
});
test("all and quorum rules count approvals, reject when the required result becomes impossible", () => {
  const s = fixture();
  s.run("UPDATE vehicles SET rule='all' WHERE id='v1'");
  const all = pending(s);
  assert.equal(approve(s, all.id).status, "pending");
  assert.throws(() => approve(s, all.id), /bereits entschieden/);
  assert.equal(approve(s, all.id, "b", ["v1"], "reject").status, "rejected");
  s.run("UPDATE vehicles SET rule='quorum',quorum=2 WHERE id='v1'");
  const q = pending(s);
  assert.equal(approve(s, q.id, "a", ["v1"], "reject").status, "pending");
  assert.equal(approve(s, q.id, "b").status, "pending");
  assert.equal(approve(s, q.id, "c").status, "approved");
  const q2 = pending(s, { startDate: "2030-11-03", endDate: "2030-11-03" });
  approve(s, q2.id, "a", ["v1"], "reject");
  assert.equal(approve(s, q2.id, "b", ["v1"], "reject").status, "rejected");
  s.db.close();
});
test("open overlaps are advisory, approved overlaps and blocks prevent final approval", () => {
  const s = fixture(),
    a = pending(s),
    b = pending(s);
  assert.ok(
    s.conflicts(["v1"], a.start, a.end, a.id).every((c) => !c.blocking),
  );
  approve(s, a.id);
  assert.throws(() => approve(s, b.id), /verhindert/);
  assert.equal(s.get(b.id).status, "pending");
  assert.throws(() => s.create(input(), "admin", true), /überschneidet/);
  s.run(
    "INSERT INTO blocks VALUES (?,?,?,?,?)",
    "block1",
    "v2",
    a.start,
    a.end,
    "Werkstatt",
  );
  const c = pending(s, { vehicleIds: ["v2"] });
  assert.throws(() => approve(s, c.id, "a", ["v2"]), /verhindert/);
  assert.equal(s.conflicts(["v1"], a.end, a.end + 3600000).length, 0);
  s.db.close();
});
test("full-day multi-day bookings cover overnight continuously and use an exclusive next-midnight end", () => {
  const result = interval(
    input({ allDay: true, startDate: "2030-11-02", endDate: "2030-11-05" }),
  );
  assert.equal(
    new Date(result.start).toISOString(),
    "2030-11-02T05:00:00.000Z",
  );
  assert.equal(new Date(result.end).toISOString(), "2030-11-05T23:00:00.000Z");
  const s = fixture(),
    b = pending(s, { allDay: true, endDate: "2030-11-05" });
  approve(s, b.id);
  const night = interval(
    input({
      startDate: "2030-11-04",
      endDate: "2030-11-04",
      startTime: "01:00",
      endTime: "02:00",
    }),
  );
  assert.equal(s.conflicts(["v1"], night.start, night.end).length, 1);
  s.db.close();
});
test("custom overnight intervals and DST transitions use Europe/Berlin independently of host timezone", () => {
  const overnight = interval(
    input({ startTime: "23:30", endDate: "2030-11-03", endTime: "01:30" }),
  );
  assert.equal(overnight.end - overnight.start, 2 * 3600000);
  const spring = interval(
    input({
      startDate: "2027-03-28",
      endDate: "2027-03-28",
      startTime: "01:00",
      endTime: "04:00",
    }),
  );
  assert.equal(spring.end - spring.start, 2 * 3600000);
  const autumn = interval(
    input({
      startDate: "2027-10-31",
      endDate: "2027-10-31",
      startTime: "01:00",
      endTime: "04:00",
    }),
  );
  assert.equal(autumn.end - autumn.start, 4 * 3600000);
  for (const date of ["2027-03-28", "2027-10-31"])
    assert.throws(
      () =>
        interval(
          input({
            startDate: date,
            endDate: date,
            startTime: "02:30",
            endTime: "04:00",
          }),
        ),
      /Zeitumstellung/,
    );
  assert.throws(() => interval(input({ endTime: "17:00" })), /nach dem Beginn/);
});
test("tokens expire, are hashed, reject invalid roles and GET-like inspection never verifies", () => {
  const s = fixture(),
    b = s.create(input()),
    raw = token(s, b.id, "verify");
  assert.equal(s.linkView(raw).booking.status, "unverified");
  assert.equal(s.get(b.id).status, "unverified");
  assert.notEqual(
    s.one("SELECT hash FROM tokens WHERE hash=?", digest(raw)).hash,
    raw,
  );
  s.run("UPDATE tokens SET expires=0 WHERE hash=?", digest(raw));
  assert.throws(() => s.verify(raw), /abgelaufener/);
  assert.throws(() => s.linkView("x".repeat(43)), /abgelaufener/);
  assert.throws(
    () => s.manage(token(s, b.id, "verify"), "cancel", {}),
    /abgelaufener/,
  );
  s.db.close();
});
test("editing revokes approval links, resets votes, keeps management access and schedules calendar cleanup", () => {
  const s = fixture(),
    b = pending(s),
    old = token(s, b.id, "approve", "b"),
    manage = token(s, b.id, "manage");
  approve(s, b.id);
  const edited = s.manage(
    manage,
    "edit",
    input({ vehicleIds: ["v2"], endTime: "21:00" }),
  );
  assert.equal(edited.status, "pending");
  assert.equal(edited.revision, 2);
  assert.equal(
    s.all("SELECT * FROM decisions WHERE booking_id=?", b.id).length,
    0,
  );
  assert.throws(
    () => s.decide(old, { decision: "approve", vehicleIds: ["v1"] }),
    /abgelaufener/,
  );
  assert.equal(s.linkView(manage).booking.revision, 2);
  assert.equal(s.manage(manage, "cancel", {}).status, "cancelled");
  assert.ok(payloads(s, "calendar").length >= 3);
  s.db.close();
});
test("inactive vehicles cannot be booked, and failed snapshot validation rolls the entire transaction back", () => {
  const s = fixture();
  s.run("UPDATE vehicles SET active=0 WHERE id='v2'");
  assert.throws(() => s.create(input({ vehicleIds: ["v1", "v2"] })), /buchbar/);
  s.run("DELETE FROM vehicle_approvers WHERE vehicle_id='v1'");
  assert.throws(() => s.create(input()), /Freigabegruppe/);
  assert.equal(s.one("SELECT count(*) AS n FROM bookings").n, 0);
  s.db.close();
});
test("an already-approved vehicle is rechecked when the last vehicle is released", () => {
  const s = fixture(),
    multi = pending(s, { vehicleIds: ["v1", "v2"] }),
    single = pending(s);
  approve(s, multi.id, "a", ["v1"]);
  approve(s, single.id);
  assert.throws(
    () => approve(s, multi.id, "b", ["v2"]),
    /Belegung hat sich geändert/,
  );
  assert.equal(s.get(multi.id).status, "pending");
  assert.equal(
    s.one(
      "SELECT count(*) AS n FROM decisions WHERE booking_id=? AND vehicle_id='v2'",
      multi.id,
    ).n,
    0,
  );
  s.db.close();
});
test("separate worker connections cannot approve overlapping reservations concurrently", async () => {
  const directory = mkdtempSync(join(tmpdir(), "booking-race-")),
    path = join(directory, "race.sqlite");
  const s = fixture(path),
    a = pending(s),
    b = pending(s);
  const tokens = [
    token(s, a.id, "approve", "a"),
    token(s, b.id, "approve", "a"),
  ];
  const barrier = new SharedArrayBuffer(4);
  const run = (raw) =>
    new Promise((resolve, reject) => {
      const worker = new Worker(
        new URL("../scripts/decision-worker.js", import.meta.url),
        { workerData: { path, raw, config: s.config, barrier } },
      );
      worker.once("message", resolve);
      worker.once("error", reject);
    });
  const jobs = tokens.map(run);
  Atomics.store(new Int32Array(barrier), 0, 1);
  Atomics.notify(new Int32Array(barrier), 0, 2);
  const result = await Promise.all(jobs);
  assert.equal(result.filter((r) => r.status === "approved").length, 1);
  assert.equal(result.filter((r) => r.error).length, 1);
  assert.equal(
    s.one("SELECT count(*) AS n FROM bookings WHERE status='approved'").n,
    1,
  );
  s.db.close();
  rmSync(directory, { recursive: true, force: true });
});
test("transaction helper restores all mutations when a decision fails", () => {
  const s = fixture();
  assert.throws(() =>
    transaction(s.db, () => {
      s.run("UPDATE vehicles SET name='Changed'");
      throw new Error("Rollback");
    }),
  );
  assert.equal(
    s.one("SELECT name FROM vehicles WHERE id='v1'").name,
    "Fahrzeug v1",
  );
  s.db.close();
});
