// Everything about time in one place. The app lives on one campus, so every
// time a person types or reads is Australia/Sydney; the database stores UTC ms.
export const TZ = "Australia/Sydney";

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function sydneyParts(ms: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of partsFmt.formatToParts(new Date(ms))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out;
}

// How far Sydney wall-clock time is ahead of UTC at this instant (10h or 11h).
function offsetAt(ms: number): number {
  const p = sydneyParts(ms);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(ms / 1000) * 1000;
}

// "2026-10-07T18:00" (what <input type=datetime-local> sends), read as Sydney
// time. Returns UTC ms, or null if it isn't that shape.
export function parseSydney(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (Number.isNaN(wall)) return null;
  // two passes so a time near a daylight-saving switch lands on the right offset
  const first = wall - offsetAt(wall);
  return wall - offsetAt(first);
}

// The inverse, for an input's value/min/max attributes.
export function toSydneyInput(ms: number): string {
  const p = sydneyParts(ms);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${two(p.month)}-${two(p.day)}T${two(p.hour)}:${two(p.minute)}`;
}

const whenFmt = new Intl.DateTimeFormat("en-AU", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

// "Tue 7 Oct, 6:00 pm" — how a person would say it.
export function formatWhen(ms: number): string {
  return whenFmt.format(new Date(ms));
}

const dayFmt = new Intl.DateTimeFormat("en-AU", { timeZone: TZ, day: "numeric", month: "short" });
export function formatDay(ms: number): string {
  return dayFmt.format(new Date(ms));
}

// "in 3 hours", "tomorrow", "starting now" — the nearness is the point.
export function relative(ms: number, now: number): string {
  const mins = Math.round((ms - now) / 60000);
  if (mins < -5) return "on now";
  if (mins <= 5) return "starting now";
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return days === 1 ? "tomorrow" : `in ${days} days`;
}
