// One log line per request, to stdout, which Fly captures (`flyctl logs`).
// Plain key=value, not JSON: a presenter narrating a live crit reads it at a
// glance, and it's still trivially greppable (decision 0006).
export type Fields = Record<string, string | number | undefined>;

// Structural guardrail, not just a convention: a call site literally cannot
// log a password or someone's note/reply text (CLAUDE.md).
const FORBIDDEN = ["password", "note", "body", "message"];

export function format(fields: Fields): string {
  for (const key of FORBIDDEN)
    if (key in fields) throw new Error(`never log ${key}`);
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${String(v).replace(/\s+/g, "_") || "-"}`)
    .join(" ");
}

export function emit(fields: Fields): void {
  console.log(format(fields));
}

// An invite link's code lets anyone who reads it join the circle, and crit 10
// puts the log on a projector. The line keeps that it was /join/, not which.
export function logPath(path: string): string {
  return path.replace(/^\/join\/[^/]+$/, "/join/[code]");
}

// A meetup or circle someone can't see answers 404, exactly as if it didn't
// exist, so the response gives nothing away. The log, which only the app's
// owner reads, says they were turned away and from what.
const MEETUP_ACTIONS: Record<string, string> = {
  "": "view_meetup",
  join: "join_meetup",
  leave: "leave_meetup",
  cancel: "cancel_meetup",
  edit: "edit_meetup",
  notes: "add_note",
  checkin: "checkin",
};
const CIRCLE_ACTIONS: Record<string, string> = {
  "": "view_circle",
  leave: "leave_circle",
  reset: "reset_invite",
};

export function notVisible(path: string): Fields | null {
  const m = /^\/m\/(\d+)(?:\/([a-z]+))?/.exec(path);
  if (m) {
    const action = path.endsWith("/delete") ? "delete_note" : MEETUP_ACTIONS[m[2] ?? ""];
    return action ? { action, meetup: Number(m[1]), result: "denied", reason: "not_visible" } : null;
  }
  const c = /^\/c\/(\d+)(?:\/([a-z]+))?$/.exec(path);
  if (c) {
    const action = CIRCLE_ACTIONS[c[2] ?? ""];
    return action ? { action, circle: Number(c[1]), result: "denied", reason: "not_visible" } : null;
  }
  return null;
}
