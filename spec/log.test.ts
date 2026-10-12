import { describe, expect, it } from "vitest";
import { format, logPath, notVisible } from "../src/log.ts";

// Decision 6: the log tells two people apart, shows who was turned away, and
// never carries a secret. These run without the app; the rest of spec/ can't
// see stdout.
describe("action log", () => {
  it("never shows an invite link's code", () => {
    expect(logPath("/join/KtARm85TmPj8")).toBe("/join/[code]");
    expect(logPath("/m/12/join")).toBe("/m/12/join");
  });

  it("says who was turned away from a meetup or circle they can't see", () => {
    expect(notVisible("/m/7")).toEqual({ action: "view_meetup", meetup: 7, result: "denied", reason: "not_visible" });
    expect(notVisible("/m/7/join")?.action).toBe("join_meetup");
    expect(notVisible("/m/7/notes/3/delete")?.action).toBe("delete_note");
    expect(notVisible("/c/4")).toEqual({ action: "view_circle", circle: 4, result: "denied", reason: "not_visible" });
    expect(notVisible("/nowhere")).toBe(null);
  });

  it("refuses to log a password or a note", () => {
    expect(() => format({ password: "x" })).toThrow();
    expect(() => format({ note: "x" })).toThrow();
  });
});
