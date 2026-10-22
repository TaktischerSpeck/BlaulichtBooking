import express from "express";
import helmet from "helmet";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { dirname } from "node:path";
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  unlinkSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { settingsPath, saveSettings } from "./runtime-settings.js";
import { getConfig } from "./config.js";
import { openDatabase, bootstrap } from "./database.js";
import { text, email, fail } from "./security.js";

export function createSetupApp(env = process.env, onComplete = () => {}) {
  const app = express();
  const token = env.SETUP_TOKEN || "";
  app.disable("x-powered-by");
  app.set("trust proxy", Number(env.TRUST_PROXY || 1));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "script-src": ["'self'"],
          "style-src": ["'self'"],
          "upgrade-insecure-requests":
            env.NODE_ENV === "production" ? [] : null,
        },
      },
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
  app.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (env.NODE_ENV === "production" && !req.secure)
      return res
        .status(400)
        .send(
          "HTTPS is required. Check the Plesk reverse proxy configuration.",
        );
    next();
  });
  app.use(express.json({ limit: "16kb" }));
  const attempts = new Map();
  let installed = false;
  app.post("/api/setup", (req, res) => {
    if (installed || existsSync(settingsPath(env)))
      fail(
        "Die Einrichtung ist bereits abgeschlossen. Bitte die Anwendung in Plesk neu starten.",
        409,
      );
    const now = Date.now();
    for (const [ip, limit] of attempts)
      if (limit.until < now) attempts.delete(ip);
    const entry = attempts.get(req.ip) || { count: 0, until: now + 15 * 60000 };
    if (entry.count >= 5 || attempts.size >= 10000)
      fail("Zu viele Versuche. Bitte nach 15 Minuten erneut versuchen.", 429);
    attempts.set(req.ip, { ...entry, count: entry.count + 1 });
    const origin = env.BASE_URL
      ? new URL(env.BASE_URL).origin
      : `${req.protocol}://${req.get("host")}`;
    if (req.get("origin") !== origin)
      fail(
        "Ungültiger Seitenaufruf. Bitte die Einrichtungsseite neu laden.",
        403,
      );
    if (token.length < 16)
      fail(
        "Bitte zuerst in Plesk die Umgebungsvariable SETUP_TOKEN mit mindestens 16 Zeichen setzen und die App neu starten.",
        503,
      );
    const hash = (value) => createHash("sha256").update(value).digest();
    if (
      typeof req.body.setupToken !== "string" ||
      !timingSafeEqual(hash(req.body.setupToken), hash(token))
    )
      fail("Der Einrichtungscode ist nicht korrekt.", 403);
    attempts.delete(req.ip);
    const input = req.body;
    const type = input.databaseType || "mariadb";
    if (!["mariadb", "mysql", "sqlite"].includes(type))
      fail("Ungültiger Datenbanktyp.");
    const baseUrl = new URL(text(input.baseUrl, "Website-URL", 500));
    if (
      !["http:", "https:"].includes(baseUrl.protocol) ||
      baseUrl.username ||
      baseUrl.password ||
      baseUrl.pathname !== "/" ||
      baseUrl.search ||
      baseUrl.hash
    )
      fail(
        "Bitte nur die vollständige Website-Adresse eingeben, z. B. https://buchung.ff-or.de.",
      );
    if (env.NODE_ENV === "production" && baseUrl.protocol !== "https:")
      fail("Die Website-Adresse muss HTTPS verwenden.");
    if (baseUrl.origin !== origin)
      fail(
        "Die Website-Adresse muss mit der aufgerufenen Domain übereinstimmen.",
      );
    if (!/^\d{4}$/.test(input.pin || ""))
      fail("Bitte eine vierstellige PIN festlegen.");
    const password = text(input.adminPassword, "Admin-Passwort", 256);
    if (password.length < 12)
      fail("Das Admin-Passwort muss mindestens 12 Zeichen haben.");
    const port = Number(input.dbPort || 3306);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      fail("Ungültiger Datenbankport.");
    const settings = {
      APP_KEY: env.APP_KEY || randomBytes(32).toString("hex"),
      BASE_URL: baseUrl.origin,
      TRUST_PROXY: String(env.TRUST_PROXY || 1),
      SITE_NAME: text(input.siteName, "Feuerwehrname", 100),
      DB_CLIENT: type,
      ...(type === "sqlite"
        ? {}
        : {
            DB_HOST: text(input.dbHost || "127.0.0.1", "Datenbankserver", 250),
            DB_PORT: String(port),
            DB_NAME: text(input.dbName, "Datenbankname", 100),
            DB_USER: text(input.dbUser, "Datenbankbenutzer", 100),
            DB_PASSWORD:
              typeof input.dbPassword === "string" ? input.dbPassword : "",
            DB_SSL: input.dbSsl === true ? "true" : "false",
          }),
      SMTP_HOST: text(input.smtpHost, "SMTP-Server", 250, true),
      SMTP_PORT: String(input.smtpPort || 587),
      SMTP_SECURE: input.smtpSecure === true ? "true" : "false",
      SMTP_USER: text(input.smtpUser, "SMTP-Benutzer", 254, true),
      SMTP_PASSWORD:
        typeof input.smtpPassword === "string" ? input.smtpPassword : "",
      SMTP_FROM: input.smtpFrom ? email(input.smtpFrom) : "",
      SMTP_FROM_NAME: text(input.siteName, "Feuerwehrname", 100),
    };
    if (
      !Number.isInteger(Number(settings.SMTP_PORT)) ||
      Number(settings.SMTP_PORT) < 1 ||
      Number(settings.SMTP_PORT) > 65535
    )
      fail("Ungültiger SMTP-Port.");
    const bootstrapEnv = {
      ...settings,
      ...Object.fromEntries(
        Object.entries(env).filter(([, value]) => value !== ""),
      ),
      INITIAL_PIN: input.pin,
      ADMIN_USERNAME: text(input.adminUsername, "Admin-Benutzername", 100),
      ADMIN_PASSWORD: password,
    };
    const config = getConfig(bootstrapEnv);
    const lockPath = settingsPath(env) + ".lock";
    mkdirSync(dirname(lockPath), { recursive: true, mode: 0o700 });
    let lock;
    try {
      lock = openSync(lockPath, "wx", 0o600);
    } catch {
      fail(
        "Die Einrichtung wird bereits ausgeführt. Bitte kurz warten und erneut laden.",
        409,
      );
    }
    let db;
    try {
      if (existsSync(settingsPath(env)))
        fail("Die Einrichtung ist bereits abgeschlossen.", 409);
      db = openDatabase(config.database);
      // Never use the installer to reset access to an already populated database.
      if (db.prepare("SELECT id FROM admins LIMIT 1").get())
        fail(
          "Diese Datenbank ist bereits eingerichtet. Verwende eine leere Datenbank oder die bestehende Konfiguration aus dem Backup.",
          409,
        );
      bootstrap(db, config);
      // Bootstrap secrets are hashed in the database and are not saved in the configuration.
      saveSettings(settings, env);
      installed = true;
      config.pin = undefined;
      config.adminPassword = undefined;
      onComplete(config, db);
      db = null;
      res.json({ ok: true });
    } finally {
      if (db) db.close();
      closeSync(lock);
      unlinkSync(lockPath);
    }
  });
  const publicPath = fileURLToPath(new URL("../public/", import.meta.url));
  app.get("/", (req, res) => res.sendFile(`${publicPath}/setup.html`));
  app.get("/api/session", (req, res) =>
    res
      .status(503)
      .json({
        message: "Bitte zuerst die Einrichtung auf der Startseite abschließen.",
      }),
  );
  app.get("/healthz", (req, res) => res.json({ status: "setup-required" }));
  app.use(express.static(publicPath, { index: false, maxAge: 0 }));
  app.use((error, req, res, next) => {
    const code = error.status || 500;
    if (code >= 500)
      console.error(
        "Initial setup failed (" + (error.code || "CONFIGURATION_ERROR") + ")",
      );
    res
      .status(code)
      .json({
        message:
          code < 500
            ? error.message
            : error.code
              ? "Datenbankverbindung fehlgeschlagen (" +
                error.code +
                "). Bitte Server, Datenbankname, Benutzer, Passwort und Berechtigungen in Plesk prüfen."
              : "Einrichtung fehlgeschlagen. Bitte Konfiguration und Schreibrechte für das Datenverzeichnis prüfen.",
      });
  });
  return app;
}
