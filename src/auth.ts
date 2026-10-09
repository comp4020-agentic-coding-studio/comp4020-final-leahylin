import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Passwords are never stored as typed (CLAUDE.md). What goes in the database
// is "scrypt$N$r$p$salt$hash": the parameters travel with the hash, so they
// can be raised later without breaking anyone who already signed up.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function derive(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
): Promise<Buffer> {
  // async: a hash takes tens of milliseconds, and nobody else should wait on it
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64url");
  const key = await derive(password, Buffer.from(salt, "base64url"), Number(n), Number(r), Number(p));
  // constant time, so a wrong guess can't be timed into a right one
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// Spent on a username that doesn't exist, so "no such user" takes as long as
// "wrong password" and the response time doesn't say which usernames are real.
let decoy: Promise<string> | null = null;
export async function burnTime(password: string): Promise<void> {
  decoy ??= hashPassword(randomBytes(16).toString("hex"));
  await verifyPassword(password, await decoy);
}

export const USERNAME = /^[a-z0-9_]{3,20}$/;
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 200;
