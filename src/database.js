import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "./security.js";

export function openDatabase(path) {
  if (path !== ":memory:")
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied INTEGER NOT NULL)",
  );
  const folder = fileURLToPath(new URL("../migrations/", import.meta.url));
  for (const name of readdirSync(folder)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    if (!db.prepare("SELECT name FROM migrations WHERE name=?").get(name))
      transaction(db, () => {
        db.exec(readFileSync(`${folder}/${name}`, "utf8"));
        db.prepare("INSERT INTO migrations VALUES (?,?)").run(name, Date.now());
      });
  }
  return db;
}
export function transaction(db, action) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = action();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function bootstrap(db, config) {
  transaction(db, () => {
    if (!db.prepare("SELECT value FROM settings WHERE key='pin_hash'").get()) {
      if (!/^\d{4}$/.test(config.pin || ""))
        throw new Error("INITIAL_PIN must contain four digits on first start");
      db.prepare("INSERT INTO settings VALUES (?,?)").run(
        "pin_hash",
        hashPassword(config.pin),
      );
      db.prepare("INSERT INTO settings VALUES (?,?)").run(
        "site_name",
        config.siteName,
      );
    }
    if (!db.prepare("SELECT id FROM admins LIMIT 1").get()) {
      if (!config.adminUsername || (config.adminPassword || "").length < 12)
        throw new Error(
          "Set ADMIN_USERNAME and ADMIN_PASSWORD (at least 12 characters) on first start",
        );
      db.prepare("INSERT INTO admins(username,password_hash) VALUES (?,?)").run(
        config.adminUsername.toLowerCase(),
        hashPassword(config.adminPassword),
      );
    }
  });
}
