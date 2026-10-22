import { workerData } from "node:worker_threads";
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import mariadb from "mariadb";
import { mariaSql } from "./mariadb-sql.js";

const { options, port } = workerData;
const lockName =
  "blaulichtbooking:" +
  createHash("sha256").update(options.database).digest("hex").slice(0, 40);
let connection,
  inTransaction = false;
async function connect() {
  if (!connection?.isValid()) {
    if (inTransaction)
      throw new Error("Database connection lost during transaction.");
    connection = await mariadb.createConnection({
      ...options,
      // MySQL 8 local authentication can request its RSA key over trusted loopback.
      // Remote servers should use verified TLS instead of key retrieval.
      allowPublicKeyRetrieval:
        !options.ssl &&
        ["127.0.0.1", "localhost", "::1"].includes(options.host),
      charset: "utf8mb4",
      bigIntAsNumber: true,
      insertIdAsNumber: true,
      decimalAsNumber: true,
      checkNumberRange: true,
      connectTimeout: 10000,
      // A socket deadline works on both servers; queryTimeout is MariaDB-only.
      socketTimeout: 20000,
      multipleStatements: false,
      trace: false,
      logParam: false,
    });
  }
  return connection;
}
async function acquire() {
  const result = await connection.query("SELECT GET_LOCK(?, 10) AS acquired", [
    lockName,
  ]);
  if (result[0].acquired !== 1)
    throw new Error("Database is busy. Please try again.");
}
async function release() {
  if (connection?.isValid())
    await connection.query("SELECT RELEASE_LOCK(?)", [lockName]);
}
async function initialize() {
  await connect();
  await acquire();
  try {
    await connection.query(
      "CREATE TABLE IF NOT EXISTS migrations (name VARCHAR(100) PRIMARY KEY, applied BIGINT NOT NULL) ENGINE=InnoDB",
    );
    const folder = new URL("../migrations/mariadb/", import.meta.url);
    for (const name of readdirSync(folder)
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      if (
        (
          await connection.query("SELECT name FROM migrations WHERE name=?", [
            name,
          ])
        ).length
      )
        continue;
      // MariaDB DDL auto-commits. Every statement is restart-safe under the migration lock.
      const sql = readFileSync(new URL(name, folder), "utf8");
      for (const statement of sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await connection.query(statement);
      await connection.query("INSERT INTO migrations VALUES (?,?)", [
        name,
        Date.now(),
      ]);
    }
  } finally {
    await release();
  }
}
async function execute({ action, sql, params }) {
  if (action === "initialize") return initialize();
  if (action === "exec" && sql.trim().toUpperCase() === "ROLLBACK") {
    try {
      if (connection?.isValid()) await connection.rollback();
    } finally {
      inTransaction = false;
      await release();
    }
    return;
  }
  await connect();
  if (action === "exec") {
    if (sql.trim().toUpperCase() === "BEGIN IMMEDIATE") {
      await acquire();
      try {
        await connection.beginTransaction();
        inTransaction = true;
      } catch (error) {
        await release();
        throw error;
      }
      return;
    }
    if (sql.trim().toUpperCase() === "COMMIT") {
      try {
        await connection.commit();
      } finally {
        inTransaction = false;
        await release();
      }
      return;
    }
    await connection.query(mariaSql(sql));
    return;
  }
  const result = await connection.query(mariaSql(sql), params);
  if (action === "get") return result[0];
  if (action === "all") return Array.from(result);
  return { changes: result.affectedRows, lastInsertRowid: result.insertId };
}
port.on("message", async (message) => {
  let response;
  try {
    response = { result: await execute(message) };
  } catch (error) {
    // Never forward driver errors that can contain SQL parameters or credentials.
    response = {
      error: {
        code: error.code || "DATABASE_ERROR",
        message:
          "MariaDB operation failed (" +
          (error.code || "DATABASE_ERROR") +
          "). Check database settings and availability.",
      },
    };
  }
  port.postMessage(response);
  Atomics.store(message.signal, 0, 1);
  Atomics.notify(message.signal, 0);
});
