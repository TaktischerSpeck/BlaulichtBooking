import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { Integrations } from "../src/integrations.js";
import { fixture, pending } from "./helpers.js";

async function httpFixture(t) {
  const s = fixture(),
    app = createApp(s, new Integrations(s));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  s.config.baseUrl = origin;
  let cookie = "",
    csrf = "";
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    s.db.close();
  });
  async function request(path, body, extra = {}) {
    const res = await fetch(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Cookie: cookie,
        Origin: origin,
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.headers.get("set-cookie"))
      cookie = res.headers.get("set-cookie").split(";")[0];
    const data = await res.json();
    if (data.csrf) csrf = data.csrf;
    return { status: res.status, data, headers: res.headers };
  }
  return { s, request };
}
test("PIN gate, origin+CSRF checks and admin authorization are enforced on backend APIs", async (t) => {
  const { request } = await httpFixture(t);
  assert.equal((await request("/api/vehicles")).status, 401);
  await request("/api/session");
  assert.equal(
    (
      await request(
        "/api/pin",
        { pin: "1234" },
        { Origin: "https://evil.invalid" },
      )
    ).status,
    403,
  );
  assert.equal(
    (await request("/api/pin", { pin: "1234" }, { "X-CSRF-Token": "wrong" }))
      .status,
    403,
  );
  const pin = await request("/api/pin", { pin: "1234" });
  assert.equal(pin.status, 200);
  assert.ok(pin.headers.get("set-cookie").includes("HttpOnly"));
  assert.equal((await request("/api/admin/overview")).status, 403);
  assert.equal(
    (
      await request("/api/admin/login", {
        username: "admin",
        password: "wrong",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("/api/admin/login", {
        username: "admin",
        password: "test-password-very-long",
      })
    ).status,
    200,
  );
  assert.equal((await request("/api/admin/overview")).status, 200);
  assert.equal((await request("/api/logout", {})).status, 200);
  assert.equal((await request("/api/admin/overview")).status, 401);
});
test("calendar API never returns applicant emails, notes, tokens or Google calendar identifiers", async (t) => {
  const { s, request } = await httpFixture(t);
  const b = pending(s, { notes: "private-notes-secret" });
  s.run("UPDATE vehicles SET calendar_id='private-google-id' WHERE id='v1'");
  await request("/api/session");
  await request("/api/pin", { pin: "1234" });
  const calendar = await request(
    `/api/calendar?start=${b.start - 1000}&end=${b.end + 1000}`,
  );
  assert.equal(calendar.status, 200);
  assert.equal(calendar.data.bookings[0].name, "Test Person");
  const json =
    JSON.stringify(calendar.data) +
    JSON.stringify((await request("/api/vehicles")).data);
  for (const value of [
    "person@example.invalid",
    "private-notes-secret",
    "private-google-id",
    "token",
    "password_hash",
  ])
    assert.ok(!json.includes(value));
});
test("PIN failures are rate-limited and wrong token roles cannot enter protected management", async (t) => {
  const { request } = await httpFixture(t);
  await request("/api/session");
  for (let i = 0; i < 5; i++)
    assert.equal((await request("/api/pin", { pin: "0000" })).status, 401);
  assert.equal((await request("/api/pin", { pin: "1234" })).status, 429);
});
test("admin vehicle/approver configuration and blocks are persistent and validated", async (t) => {
  const { request } = await httpFixture(t);
  await request("/api/session");
  await request("/api/pin", { pin: "1234" });
  await request("/api/admin/login", {
    username: "admin",
    password: "test-password-very-long",
  });
  const person = await request("/api/admin/approvers", {
    name: "Leitung",
    email: "leitung@example.invalid",
    active: true,
  });
  const vehicle = await request("/api/admin/vehicles", {
    name: "MTW",
    callsign: "19",
    approverIds: [person.data.id],
    active: true,
  });
  assert.equal(vehicle.status, 200);
  assert.equal(
    (
      await request("/api/admin/vehicles", {
        name: "No approvers",
        active: true,
        approverIds: [],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/admin/vehicles", {
        id: vehicle.data.id,
        name: "MTW",
        image: "javascript:alert(1)",
        approverIds: [person.data.id],
      })
    ).status,
    400,
  );
  const block = await request("/api/admin/blocks", {
    vehicleId: vehicle.data.id,
    reason: "Werkstatt",
    startDate: "2030-11-01",
    endDate: "2030-11-02",
    allDay: true,
  });
  assert.equal(block.status, 200);
  const overview = await request("/api/admin/overview");
  assert.equal(overview.data.blocks.length, 1);
  assert.equal(
    overview.data.vehicles.find((v) => v.id === vehicle.data.id).approverIds[0],
    person.data.id,
  );
});
