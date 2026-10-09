import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth.ts";

// README: "passwords are never stored as typed". The database can't be read
// over HTTP, so this checks the one function every stored password goes
// through.
describe("password storage", () => {
  it("stores a salted hash, never the password", async () => {
    const password = "correct horse battery";
    const a = await hashPassword(password);
    const b = await hashPassword(password);
    expect(a).not.toContain(password);
    expect(a.startsWith("scrypt$")).toBe(true);
    // a fresh salt each time, so equal passwords don't look equal
    expect(a).not.toBe(b);
    expect(await verifyPassword(password, a)).toBe(true);
    expect(await verifyPassword("correct horse batterY", a)).toBe(false);
    expect(await verifyPassword(password, "not-a-hash")).toBe(false);
  });
});
