import { test } from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { openDatabase } from "../src/database.js";
import { transaction } from "../src/database.js";
import { Integrations } from "../src/integrations.js";
import { mariaSql } from "../src/mariadb-sql.js";
import { fixture, input, pending, approve, token } from "./helpers.js";
import { createSetupApp } from "../src/setup.js";
import { createApp } from "../src/app.js";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { settingsPath } from "../src/runtime-settings.js";

const enabled = Boolean(process.env.TEST_MARIADB_HOST);
const database = {
  client: "mariadb",
  connection: {
    host: process.env.TEST_MARIADB_HOST,
    port: Number(process.env.TEST_MARIADB_PORT || 3306),
    database: process.env.TEST_MARIADB_DATABASE || "booking_test",
    user: process.env.TEST_MARIADB_USER || "booking_test",
    password: process.env.TEST_MARIADB_PASSWORD || "",
  },
};
function clearDatabase() {
  assert.match(
    database.connection.database,
    /^booking_test(?:_|$)/,
    "Use a dedicated booking_test database; this fixture clears it.",
  );
  const db = openDatabase(database);
  for (const table of [
    "sessions",
    "rate_limits",
    "decisions",
    "tokens",
    "jobs",
    "calendar_events",
    "eligible",
    "reservations",
    "blocks",
    "bookings",
    "vehicle_approvers",
    "vehicles",
    "approvers",
    "audit",
    "admins",
    "settings",
  ])
    db.prepare(`DELETE FROM ${table}`).run();
  db.close();
}
function sqlFixture(t) {
  clearDatabase();
  const s = fixture(database);
  t.after(() => s.db.close());
  return s;
}

test(
  "MariaDB browser installer validates credentials, initializes access and locks itself",
  { skip: !enabled },
  async (t) => {
    clearDatabase();
    const directory = mkdtempSync(join(tmpdir(), "booking-sql-setup-"));
    const env = {
      APP_DATA_DIR: directory,
      SETUP_TOKEN: "test-only-installer-code-long",
      NODE_ENV: "development",
    };
    let databaseHandle;
    const server = createSetupApp(env, (config, db) => {
      databaseHandle = db;
      assert.equal(db.kind, "mariadb");
    }).listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    t.after(async () => {
      await new Promise((resolve) => server.close(resolve));
      databaseHandle?.close();
      rmSync(directory, { recursive: true, force: true });
    });
    const payload = {
      setupToken: env.SETUP_TOKEN,
      databaseType: "mariadb",
      dbHost: database.connection.host,
      dbPort: database.connection.port,
      dbName: database.connection.database,
      dbUser: database.connection.user,
      dbPassword: database.connection.password,
      baseUrl: origin,
      siteName: "SQL Feuerwehr",
      pin: "4826",
      adminUsername: "manager",
      adminPassword: "long-test-only-password",
    };
    async function submit(body) {
      const response = await fetch(origin + "/api/setup", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    }
    const invalid = await submit({
      ...payload,
      dbPassword: "wrong-private-test-password",
    });
    assert.equal(invalid.status, 500);
    assert.ok(
      !JSON.stringify(invalid.body).includes("wrong-private-test-password"),
    );
    assert.equal(existsSync(settingsPath(env)), false);
    const result = await submit(payload);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(
      databaseHandle.prepare("SELECT username FROM admins").get().username,
      "manager",
    );
    assert.equal(
      JSON.parse(readFileSync(settingsPath(env), "utf8")).DB_CLIENT,
      "mariadb",
    );
    assert.equal((await submit(payload)).status, 409);
  },
);
test("MariaDB SQL adaptation preserves literals and quotes reserved column names", () => {
  assert.equal(
    mariaSql(
      "SELECT 'end key excluded.name' AS literal, key, b.end FROM bookings b",
    ),
    "SELECT 'end key excluded.name' AS literal, `key`, b.`end` FROM bookings b",
  );
  assert.equal(
    mariaSql(
      "INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    ),
    "INSERT INTO settings VALUES (?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)",
  );
});
test(
  "MariaDB creates persistent schema and completes booking/email verification/approval",
  { skip: !enabled },
  (t) => {
    const s = sqlFixture(t),
      b = pending(s, { vehicleIds: ["v1", "v2"] });
    assert.equal(s.db.kind, "mariadb");
    assert.equal(approve(s, b.id, "a", ["v1"]).status, "pending");
    assert.equal(approve(s, b.id, "b", ["v2"]).status, "approved");
    assert.equal(
      s.calendar(b.start - 1, b.end + 1).bookings[0].email,
      undefined,
    );
    const reopened = openDatabase(database);
    assert.equal(
      reopened.prepare("SELECT status FROM bookings WHERE id=?").get(b.id)
        .status,
      "approved",
    );
    assert.equal(
      reopened.prepare("SELECT count(*) AS n FROM migrations").get().n,
      1,
    );
    reopened.close();
  },
);
test(
  "MariaDB quorum, rejection, rollback and key-column upserts match SQLite behavior",
  { skip: !enabled },
  (t) => {
    const s = sqlFixture(t);
    s.run("UPDATE vehicles SET rule='quorum',quorum=2 WHERE id='v1'");
    const b = pending(s);
    assert.equal(approve(s, b.id, "a").status, "pending");
    assert.equal(approve(s, b.id, "b").status, "approved");
    const collision = pending(s);
    assert.throws(() => approve(s, collision.id), /verhindert/);
    assert.throws(
      () =>
        transaction(s.db, () => {
          s.run("UPDATE vehicles SET name='Changed'");
          throw new Error("Rollback");
        }),
      /Rollback/,
    );
    assert.equal(
      s.one("SELECT name FROM vehicles WHERE id='v1'").name,
      "Fahrzeug v1",
    );
    for (const value of ["one", "two"])
      s.run(
        "INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        "probe",
        value,
      );
    assert.equal(
      s.one("SELECT value FROM settings WHERE key='probe'").value,
      "two",
    );
    const manage = token(s, b.id, "manage");
    assert.equal(
      s.manage(manage, "edit", input({ vehicleIds: ["v2"] })).status,
      "pending",
    );
    assert.equal(approve(s, b.id, "a", ["v2"], "reject").status, "rejected");
  },
);
test(
  "SQL-backed calendar and admin listing endpoints preserve ordering, filters and privacy",
  { skip: !enabled },
  async (t) => {
    const s = sqlFixture(t),
      b = pending(s, { vehicleIds: ["v1", "v2"] });
    approve(s, b.id, "a", ["v1", "v2"]);
    const server = createApp(s, new Integrations(s)).listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    s.config.baseUrl = origin;
    let cookie = "",
      csrf = "";
    async function request(path, body) {
      const response = await fetch(origin + "/api" + path, {
        method: body ? "POST" : "GET",
        headers: {
          Origin: origin,
          Cookie: cookie,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (response.headers.get("set-cookie"))
        cookie = response.headers.get("set-cookie").split(";")[0];
      const result = await response.json();
      if (result.csrf) csrf = result.csrf;
      assert.equal(response.status, 200, JSON.stringify(result));
      return result;
    }
    try {
      await request("/session");
      await request("/pin", { pin: "1234" });
      const calendar = await request(
        `/calendar?start=${b.start - 1}&end=${b.end + 1}`,
      );
      assert.equal(calendar.bookings.length, 1);
      assert.equal(calendar.bookings[0].email, undefined);
      await request("/admin/login", {
        username: "admin",
        password: "test-password-very-long",
      });
      const rows = await request(
        "/admin/bookings?status=approved&vehicleId=v1",
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, b.id);
      assert.equal(
        (await request("/admin/overview")).settings.databaseType,
        "MariaDB / MySQL",
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
test(
  "MariaDB named transaction lock prevents double booking across separate app processes",
  { skip: !enabled },
  async (t) => {
    const s = sqlFixture(t),
      a = pending(s),
      b = pending(s),
      barrier = new SharedArrayBuffer(4);
    const jobs = [a, b].map(
      (b) =>
        new Promise((resolve, reject) => {
          const worker = new Worker(
            new URL("../scripts/decision-worker.js", import.meta.url),
            {
              workerData: {
                path: database,
                config: s.config,
                raw: token(s, b.id, "approve", "a"),
                barrier,
              },
            },
          );
          worker.once("message", resolve);
          worker.once("error", reject);
        }),
    );
    Atomics.store(new Int32Array(barrier), 0, 1);
    Atomics.notify(new Int32Array(barrier), 0);
    const result = await Promise.all(jobs);
    assert.equal(result.filter((r) => r.status === "approved").length, 1);
    assert.equal(result.filter((r) => r.error).length, 1);
    assert.equal(
      s.one("SELECT count(*) AS n FROM bookings WHERE status='approved'").n,
      1,
    );
  },
);
test(
  "MariaDB background jobs, calendar upserts and cancellation preserve synchronization state",
  { skip: !enabled },
  async (t) => {
    const s = sqlFixture(t);
    s.run("UPDATE vehicles SET calendar_id='private-test' WHERE id='v1'");
    const b = pending(s);
    approve(s, b.id);
    s.run("UPDATE jobs SET status='done' WHERE type='mail'");
    const i = new Integrations(s);
    let writes = 0,
      deletes = 0;
    i.google = async (method) => {
      if (method === "DELETE") deletes++;
      else writes++;
      return new Response(null, { status: method === "DELETE" ? 204 : 200 });
    };
    await i.processJobs(10);
    await i.syncCalendar(b.id);
    assert.equal(writes, 1);
    assert.equal(s.one("SELECT status FROM calendar_events").status, "synced");
    transaction(s.db, () => s.cancel(b.id, "test"));
    await i.syncCalendar(b.id);
    assert.equal(deletes, 1);
    assert.equal(s.one("SELECT status FROM calendar_events").status, "deleted");
  },
);
