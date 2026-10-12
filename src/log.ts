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
