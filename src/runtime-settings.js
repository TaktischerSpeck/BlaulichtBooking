import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { resolve, dirname, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

export function settingsPath(env = process.env) {
  const directory = resolve(env.APP_DATA_DIR || "data");
  const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
  const location = relative(publicRoot, directory);
  if (
    location === "" ||
    (!isAbsolute(location) &&
      location !== ".." &&
      !location.startsWith(".." + sep))
  )
    throw new Error("APP_DATA_DIR must be outside the public document root");
  return resolve(directory, "runtime.json");
}
export function readSettings(env = process.env) {
  const path = settingsPath(env);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
}
export function runtimeEnv(env = process.env) {
  return {
    ...readSettings(env),
    ...Object.fromEntries(
      Object.entries(env).filter(([, value]) => value !== ""),
    ),
  };
}
export function saveSettings(settings, env = process.env) {
  const path = settingsPath(env);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(settings, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}
