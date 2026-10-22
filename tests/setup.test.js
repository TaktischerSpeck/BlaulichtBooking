import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSetupApp } from "../src/setup.js";
import { runtimeEnv, settingsPath } from "../src/runtime-settings.js";
import { getConfig } from "../src/config.js";
import { openDatabase } from "../src/database.js";
import { verifyPassword } from "../src/security.js";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

test("runtime secrets cannot be stored beneath the public document root", () => {
  assert.throws(
    () =>
      settingsPath({
        APP_DATA_DIR: fileURLToPath(new URL("../public/data", import.meta.url)),
      }),
    /outside the public/,
  );
});

async function setupFixture(t, extra = {}) {
  const directory = mkdtempSync(join(tmpdir(), "booking-installer-"));
  const env = {
    APP_DATA_DIR: directory,
    SETUP_TOKEN: "test-only-setup-token-long",
    NODE_ENV: "development",
    ...extra,
  };
  let activeDatabase;
  const app = createSetupApp(env, (config, db) => {
    activeDatabase = db;
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const payload = {
    setupToken: env.SETUP_TOKEN,
    databaseType: "sqlite",
    baseUrl: origin,
    siteName: "Test Feuerwehr",
    pin: "4826",
    adminUsername: "manager",
    adminPassword: "a-long-test-only-password",
    smtpHost: "smtp.example.invalid",
    smtpUser: "user",
    smtpPassword: "test-smtp-password",
    smtpFrom: "booking@example.invalid",
  };
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    activeDatabase?.close();
    rmSync(directory, { recursive: true, force: true });
  });
  async function submit(input = payload, suppliedOrigin = origin) {
    const response = await fetch(origin + "/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: suppliedOrigin },
      body: JSON.stringify(input),
    });
    return { status: response.status, body: await response.json() };
  }
  return { env, origin, payload, submit };
}
test("browser setup creates keys/schema/admin without CLI and persists across restart", async (t) => {
  const { env, origin, payload, submit } = await setupFixture(t);
  assert.match(await (await fetch(origin)).text(), /Datenbank verbinden/);
  assert.equal((await submit({ ...payload, setupToken: "wrong" })).status, 403);
  assert.equal((await submit(payload, "https://other.invalid")).status, 403);
  const result = await submit();
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const content = readFileSync(settingsPath(env), "utf8"),
    saved = JSON.parse(content);
  assert.match(saved.APP_KEY, /^[a-f0-9]{64}$/);
  assert.equal(saved.BASE_URL, origin);
  assert.ok(!content.includes(payload.adminPassword));
  assert.ok(!content.includes("4826"));
  assert.ok(!content.includes(env.SETUP_TOKEN));
  if (process.platform !== "win32")
    assert.equal(statSync(settingsPath(env)).mode & 0o777, 0o600);
  assert.equal((await submit()).status, 409);
  const config = getConfig(runtimeEnv(env)),
    db = openDatabase(config.database);
  assert.ok(
    verifyPassword(
      payload.pin,
      db.prepare("SELECT value FROM settings WHERE key='pin_hash'").get().value,
    ),
  );
  assert.ok(
    verifyPassword(
      payload.adminPassword,
      db.prepare("SELECT password_hash FROM admins").get().password_hash,
    ),
  );
  db.close();
  const outside = await fetch(origin + "/data/runtime.json");
  assert.equal(outside.status, 404);
});
test("installer refuses missing setup protection and rate-limits guesses", async (t) => {
  const missing = await setupFixture(t, { SETUP_TOKEN: "" });
  assert.equal((await missing.submit()).status, 503);
  const f = await setupFixture(t);
  for (let n = 0; n < 5; n++)
    assert.equal(
      (await f.submit({ ...f.payload, setupToken: "bad" })).status,
      403,
    );
  assert.equal((await f.submit()).status, 429);
});
test("installer validates access details before creating configuration", async (t) => {
  const f = await setupFixture(t);
  assert.equal((await f.submit({ ...f.payload, pin: "12" })).status, 400);
  assert.equal(
    (await f.submit({ ...f.payload, adminPassword: "short" })).status,
    400,
  );
  assert.equal(
    (await f.submit({ ...f.payload, baseUrl: "https://other.invalid" })).status,
    400,
  );
  assert.equal((await f.submit({ ...f.payload, dbPort: 99999 })).status, 400);
});
test("Plesk startup bridge switches from setup to normal app and survives a restart", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "booking-startup-"));
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  let child;
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
  }
  async function start() {
    child = spawn(process.execPath, ["app.cjs"], {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: String(port),
        HOST: "127.0.0.1",
        APP_DATA_DIR: directory,
        APP_KEY: "",
        DATABASE_PATH: "",
        BASE_URL: "",
        SETUP_TOKEN: "test-only-setup-token-long",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("App startup timed out"));
      }, 10000);
      child.once("error", reject);
      child.once("exit", (code) => {
        clearTimeout(timer);
        if (code !== null) reject(new Error("App startup failed"));
      });
      child.stdout.once("data", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  t.after(async () => {
    await stop();
    rmSync(directory, { recursive: true, force: true });
  });
  await start();
  assert.match(await (await fetch(origin)).text(), /Datenbank verbinden/);
  const result = await fetch(origin + "/api/setup", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      setupToken: "test-only-setup-token-long",
      databaseType: "sqlite",
      baseUrl: origin,
      siteName: "Feuerwehr Test",
      pin: "4826",
      adminUsername: "manager",
      adminPassword: "long-test-only-password",
    }),
  });
  assert.equal(result.status, 200, await result.text());
  assert.equal(
    (await (await fetch(origin + "/api/session")).json()).pin,
    false,
  );
  await stop();
  await start();
  assert.match(await (await fetch(origin)).text(), /app.js/);
  assert.equal(
    (await (await fetch(origin + "/api/session")).json()).siteName,
    "Feuerwehr Test",
  );
  assert.equal(
    (
      await fetch(origin + "/api/setup", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    403,
  );
});
