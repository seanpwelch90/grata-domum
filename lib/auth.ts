import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

const pairingAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function checkPassword(stored: string, password: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function newToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function newId(): string {
  return randomBytes(16).toString("hex");
}

export function pairingCode(): string {
  const bytes = randomBytes(6);
  return [...bytes]
    .map((byte) => pairingAlphabet[byte % pairingAlphabet.length])
    .join("");
}
