import type { IncomingMessage, ServerResponse } from "node:http";
import * as log from "./log.ts";

// Live updates are one process telling the browsers it is already serving that
// something moved (docs/decisions/0001, Consequences). No pub/sub, no second
// service: one machine, one writer, so a Set in memory is the whole fan-out.
//
// What goes down the wire is a signal, never content. A client hears "topic
// m:12 changed", re-fetches its own page with its own cookie and swaps in what
// differs, so every page stays rendered by src/views.ts and personal to whoever
// asked for it. Nothing here knows what a meetup looks like.
//
// Losing this registry on restart costs a reconnect, not data: CLAUDE.md's
// "nothing that matters lives in memory" still holds.

// Sized for one campus. Deliberately well under Fly's per-machine concurrency
// limit, which these long-lived connections also count against — if that limit
// is reached the proxy starts failing ordinary page loads, not just streams.
const MAX_STREAMS = 60;
// A flood of cookie-less connections must not be able to lock out people who
// have one, so the anonymous share is capped separately.
const MAX_ANON = 20;
const MAX_PER_PERSON = 3;
// Looser than the per-person cap on purpose: a share house, a lecture theatre
// on campus wifi and the spec suite all arrive as one address.
const MAX_PER_IP = 20;
// under Fly's proxy idle timeout, so a quiet stream isn't mistaken for a dead one
const HEARTBEAT_MS = 25_000;
// A backstop, not the cost control: the client closes its own stream when the
// tab is hidden, which is what actually lets the machine stop. This only bounds
// a stream whose client has stopped behaving.
const LIFETIME_MS = 10 * 60_000;
// A phone on a dying cell link accepts no bytes; the socket buffers in memory
// instead. Past this, drop it rather than grow.
const MAX_BUFFERED = 64 * 1024;
// What we ask a client to wait before coming back after we close a stream
// deliberately. Long enough that a capped-out or shutting-down machine isn't
// hammered, short enough that a reader isn't stranded.
const RETRY_MS = 60_000;

// i:<interest slug> for a list, m:<id> for one meetup. A topic is only a
// filter: it decides what you are told changed, never what you may see. The
// page you then fetch is authorised by your cookie like any other request, so
// subscribing to someone else's topic reveals nothing a plain GET wouldn't.
// p:<person> is one person's own page furniture (friend requests, the
// friends count, their circles) and c:<circle> a circle's member list. Both
// are only ever subscribed by the person or a member: the server drops any
// other before subscribing (server.ts, /events).
const TOPIC = /^(i:[a-z0-9-]{1,32}|[mpc]:[0-9]{1,9})$/;
const MAX_TOPICS = 24;

export function parseTopics(raw: string | null): Set<string> {
  const topics = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const topic = part.trim();
    if (TOPIC.test(topic)) topics.add(topic);
    if (topics.size >= MAX_TOPICS) break;
  }
  return topics;
}

interface Stream {
  res: ServerResponse;
  topics: Set<string>;
  personId: number | null;
  actor: string;
  ip: string;
  opened: number;
  // why the server ended it, if it did; otherwise the browser went away
  why?: "expired" | "not_draining" | "shutdown";
  logged?: boolean;
}

// The other half of the `subscribe` line (decision 6): one line when a stream
// ends, saying who, what they were watching and for how long.
function logClose(stream: Stream): void {
  if (stream.logged) return;
  stream.logged = true;
  const secs = Math.round((Date.now() - stream.opened) / 1000);
  log.emit({
    time: new Date().toISOString(),
    actor: stream.actor,
    action: "unsubscribe",
    topics: [...stream.topics].join(","),
    open_for: `${Math.floor(secs / 60)}m${secs % 60}s`,
    reason: stream.why ?? "client_closed",
  });
}

const streams = new Set<Stream>();

// Fly's proxy sets fly-client-ip. x-forwarded-for is attacker-controlled on the
// left, so it is never consulted.
function clientIp(req: IncomingMessage): string {
  const fly = req.headers["fly-client-ip"];
  if (typeof fly === "string" && fly) return fly;
  return req.socket.remoteAddress ?? "unknown";
}

function atCap(personId: number | null, ip: string): boolean {
  if (streams.size >= MAX_STREAMS) return true;
  let anon = 0;
  let mine = 0;
  let sameIp = 0;
  for (const s of streams) {
    if (s.personId === null) anon++;
    if (personId !== null && s.personId === personId) mine++;
    if (s.ip === ip) sameIp++;
  }
  if (personId === null && anon >= MAX_ANON) return true;
  if (personId !== null && mine >= MAX_PER_PERSON) return true;
  return sameIp >= MAX_PER_IP;
}

// Turning a client away must still look like a stream. Per the EventSource
// spec a response that isn't 200 text/event-stream *fails the connection*: the
// browser gives up for good and that tab is silently dead for the rest of its
// life. So we always answer 200, say how long to wait, and close. The client
// comes back instead of giving up.
export function decline(res: ServerResponse): void {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(`retry: ${RETRY_MS}\n: busy\n\n`);
}

export function subscribe(
  req: IncomingMessage,
  res: ServerResponse,
  topics: Set<string>,
  personId: number | null,
  actor = "anon",
): boolean {
  const ip = clientIp(req);
  if (atCap(personId, ip)) return false;

  const stream: Stream = { res, topics, personId, actor, ip, opened: Date.now() };
  // Registered before the headers go out, so that "the client's fetch resolved"
  // means "the server already has me". The spec test relies on that ordering to
  // publish straight after connecting without sleeping first — don't reorder.
  streams.add(stream);

  res.on("close", () => {
    streams.delete(stream);
    logClose(stream);
  });

  try {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
      // some proxies buffer by default, which would hold events back
      "x-accel-buffering": "no",
    });
    res.write(`retry: ${RETRY_MS}\n: open\n\n`);
  } catch {
    streams.delete(stream);
    return false;
  }
  return true;
}

// Writes to one stream, dropping it if it has stopped draining or has gone.
function push(stream: Stream, frame: string): void {
  try {
    if (stream.res.writableEnded || stream.res.writableLength > MAX_BUFFERED) {
      stream.why ??= "not_draining";
      stream.res.destroy();
      streams.delete(stream);
      return;
    }
    stream.res.write(frame);
  } catch {
    streams.delete(stream);
  }
}

// Called after a write has committed, never from inside db.ts's tx(): a publish
// from inside a transaction that then rolled back would announce something that
// never happened.
// `mayKnow` decides who hears it at all (decision 4). A signal carries no
// content, but "the running list just moved" still tells you a meetup exists,
// so a change only reaches people who can see the meetup it's about.
export function publish(
  topics: string[],
  mayKnow: (personId: number | null) => boolean = () => true,
): void {
  const frame = `event: change\ndata: ${JSON.stringify({ topics })}\n\n`;
  let delivered = 0;
  for (const stream of [...streams]) {
    if (topics.some((t) => stream.topics.has(t)) && mayKnow(stream.personId)) {
      push(stream, frame);
      delivered++;
    }
  }
  // Who caused it is on the request line just before; this says who was told.
  log.emit({
    time: new Date().toISOString(),
    action: "broadcast",
    topics: topics.join(","),
    delivered,
  });
}

// One timer for everyone rather than two per connection: fewer objects, and one
// place that notices a socket which has stopped draining.
const sweep = setInterval(() => {
  const now = Date.now();
  for (const stream of [...streams]) {
    if (now - stream.opened > LIFETIME_MS) {
      stream.why = "expired";
      stream.res.end();
      streams.delete(stream);
      continue;
    }
    push(stream, ": beat\n\n");
  }
}, HEARTBEAT_MS);
sweep.unref();

// Fly stops the machine when nobody is using it. Without this the process is
// killed with every stream still open, each client sees a severed socket and
// reconnects within seconds, and auto_start_machines boots the machine straight
// back up — the stop undone by the thing it just killed. Closing cleanly with a
// retry delay staggers them instead.
export function closeAll(): void {
  for (const stream of [...streams]) {
    // logged now: the process exits before the sockets report closing
    stream.why = "shutdown";
    logClose(stream);
    try {
      stream.res.end(`retry: ${RETRY_MS}\n: bye\n\n`);
    } catch {
      // already gone
    }
    streams.delete(stream);
  }
}
