import { openDatabase, bootstrap } from "../src/database.js";
import { BookingService } from "../src/bookings.js";
import { unseal } from "../src/security.js";

export function fixture(path = ":memory:") {
  const config = {
    appKey: "ab".repeat(32),
    baseUrl: "http://localhost:3000",
    production: false,
    trustProxy: 0,
    siteName: "Test Feuerwehr",
    pin: "1234",
    adminUsername: "admin",
    adminPassword: "test-password-very-long",
    retentionDays: 365,
    smtp: {
      host: "smtp.example.invalid",
      from: "booking@example.invalid",
      name: "Test",
    },
    google: {},
  };
  const db = openDatabase(path);
  bootstrap(db, config);
  const s = new BookingService(db, config);
  for (const id of ["a", "b", "c"])
    s.run(
      "INSERT OR IGNORE INTO approvers(id,name,email) VALUES (?,?,?)",
      id,
      `Person ${id}`,
      `${id}@example.invalid`,
    );
  for (const id of ["v1", "v2"]) {
    s.run(
      "INSERT OR IGNORE INTO vehicles(id,name,callsign) VALUES (?,?,?)",
      id,
      `Fahrzeug ${id}`,
      `Florian ${id}`,
    );
    for (const a of ["a", "b", "c"])
      s.run("INSERT OR IGNORE INTO vehicle_approvers VALUES (?,?)", id, a);
  }
  return s;
}
export function input(override = {}) {
  return {
    vehicleIds: ["v1"],
    name: "Test Person",
    email: "person@example.invalid",
    purpose: "Übungsdienst",
    startDate: "2030-11-02",
    endDate: "2030-11-02",
    startTime: "18:00",
    endTime: "20:00",
    allDay: false,
    ...override,
  };
}
export function token(s, id, kind, approver = null) {
  return s.token(id, kind, approver).split("/").at(-1);
}
export function pending(s, override = {}) {
  const b = s.create(input(override));
  s.verify(token(s, b.id, "verify"));
  return s.get(b.id, true);
}
export function approve(
  s,
  id,
  approver = "a",
  vehicleIds = ["v1"],
  decision = "approve",
) {
  return s.decide(token(s, id, "approve", approver), { vehicleIds, decision });
}
export function payloads(s, type = "mail") {
  return s
    .all("SELECT * FROM jobs WHERE type=?", type)
    .map((j) => ({ ...j, data: unseal(j.payload, s.config.appKey) }));
}
