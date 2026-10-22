import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { runtimeEnv } from "./runtime-settings.js";

if (existsSync(".env")) loadEnvFile(".env");

export function getConfig(env = runtimeEnv()) {
  const production = env.NODE_ENV === "production";
  const baseUrl = (env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  if (production && !baseUrl.startsWith("https://"))
    throw new Error("BASE_URL must use HTTPS in production");
  if (!/^[a-f\d]{64}$/i.test(env.APP_KEY || ""))
    throw new Error("APP_KEY must contain 64 hexadecimal characters");
  const client = env.DB_CLIENT || "sqlite";
  if (!["sqlite", "mariadb", "mysql"].includes(client))
    throw new Error("DB_CLIENT must be sqlite, mariadb or mysql");
  if (client !== "sqlite" && (!env.DB_NAME || !env.DB_USER))
    throw new Error("Set DB_NAME and DB_USER for MariaDB");
  const databasePort = Number(env.DB_PORT || 3306);
  if (
    !Number.isInteger(databasePort) ||
    databasePort < 1 ||
    databasePort > 65535
  )
    throw new Error("DB_PORT must be a valid port");
  return {
    production,
    baseUrl,
    port: Number(env.PORT || 3000),
    host: env.HOST || "127.0.0.1",
    database:
      client === "sqlite"
        ? resolve(
            env.DATABASE_PATH ||
              resolve(env.APP_DATA_DIR || "data", "booking.sqlite"),
          )
        : {
            client: "mariadb",
            connection: {
              host: env.DB_HOST || "127.0.0.1",
              port: databasePort,
              database: env.DB_NAME,
              user: env.DB_USER,
              password: env.DB_PASSWORD || "",
              ...(env.DB_SOCKET ? { socketPath: env.DB_SOCKET } : {}),
              ...(env.DB_SSL === "true" ? { ssl: true } : {}),
            },
          },
    appKey: env.APP_KEY,
    trustProxy: Number(env.TRUST_PROXY || 0),
    siteName: env.SITE_NAME || "Feuerwehr Ober-Ramstadt",
    pin: env.INITIAL_PIN,
    adminUsername: env.ADMIN_USERNAME,
    adminPassword: env.ADMIN_PASSWORD,
    retentionDays: Math.max(30, Number(env.RETENTION_DAYS || 365)),
    smtp: {
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT || 587),
      secure: env.SMTP_SECURE === "true",
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
      from: env.SMTP_FROM,
      name: env.SMTP_FROM_NAME || "BlaulichtBooking",
    },
    google: {
      email: env.GOOGLE_CLIENT_EMAIL,
      privateKey: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
  };
}
