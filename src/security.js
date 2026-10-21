import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";

export const randomToken = () => randomBytes(32).toString("base64url");
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export function hashPassword(value) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(value, salt, 64).toString("hex")}`;
}
export function verifyPassword(value, encoded) {
  if (!encoded || typeof value !== "string" || value.length > 1024)
    return false;
  const [salt, hash] = encoded.split(":");
  const actual = scryptSync(value, salt, 64);
  const expected = Buffer.from(hash || "", "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function seal(value, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
export function unseal(value, key) {
  const data = Buffer.from(value, "base64");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    data.subarray(0, 12),
  );
  cipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString(
      "utf8",
    ),
  );
}
export function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
export function text(value, name, max = 200, optional = false) {
  if (optional && (value === undefined || value === null || value === ""))
    return "";
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    fail(`${name}: Bitte einen gültigen Wert angeben (max. ${max} Zeichen).`);
  return value.trim();
}
export function email(value) {
  const result = text(value, "E-Mail", 254).toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(result) || /[\r\n]/.test(result))
    fail("Bitte eine gültige E-Mail-Adresse eingeben.");
  return result;
}
