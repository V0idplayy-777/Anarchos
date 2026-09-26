"use node";

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing runs in a Node.js action (the V8 sandbox used by queries and
 * mutations has no crypto primitives), using scrypt with a per-user random salt.
 * Only the resulting encoding is persisted — never the password itself.
 * Format: scrypt:<N>:<r>:<p>:<saltHex>:<hashHex>
 */
const SCRYPT = { N: 16384, r: 8, p: 1, keyLength: 64 };

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT.keyLength, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("hex"),
    hash.toString("hex"),
  ].join(":");
}

export function verifyPassword(password, stored) {
  const parts = String(stored ?? "").split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  const expected = Buffer.from(parts[5], "hex");
  if (expected.length === 0) return false;
  const actual = scryptSync(password, Buffer.from(parts[4], "hex"), expected.length, {
    N,
    r,
    p,
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}
