import { backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { getConfig } from "../src/config.js";
import { openDatabase } from "../src/database.js";
const config = getConfig();
if (typeof config.database === "object") {
  console.error(
    "For MariaDB/MySQL, use Plesk database export or the Plesk Backup Manager. Also back up data/runtime.json separately.",
  );
  process.exit(1);
}
mkdirSync("backups", { recursive: true, mode: 0o700 });
const db = openDatabase(config.database);
const path = resolve(
  `backups/booking-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`,
);
await backup(db, path);
db.close();
console.log(`Backup created: ${path}`);
