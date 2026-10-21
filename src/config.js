import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

if (existsSync(".env")) loadEnvFile(".env");

export function getConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const baseUrl = (env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  if (production && !baseUrl.startsWith("https://"))
    throw new Error("BASE_URL must use HTTPS in production");
  if (!/^[a-f\d]{64}$/i.test(env.APP_KEY || ""))
    throw new Error("APP_KEY must contain 64 hexadecimal characters");
  return {
    production,
    baseUrl,
    port: Number(env.PORT || 3000),
    host: env.HOST || "127.0.0.1",
    database: resolve(env.DATABASE_PATH || "data/booking.sqlite"),
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
