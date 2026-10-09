// Every piece of user text goes through esc() before it reaches a page.
export function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const CSS = `
:root{--ink:#1d1b19;--muted:#6b645c;--line:#e4ddd3;--paper:#fbf8f3;--card:#fff;--accent:#d9542b;--ok:#2b7a5b}
*{box-sizing:border-box}
body{margin:0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--paper)}
main{max-width:40rem;margin:0 auto;padding:1rem 1rem 4rem}
header.site{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;padding:.75rem 1rem;max-width:40rem;margin:0 auto}
header.site a{color:inherit;text-decoration:none}
.brand{font-weight:700;font-size:1.15rem}
.brand span{color:var(--accent)}
.who{font-size:.9rem;color:var(--muted)}
h1{font-size:1.6rem;line-height:1.2;margin:.5rem 0 .25rem}
h2{font-size:1.1rem;margin:2rem 0 .5rem}
p.lede{color:var(--muted);margin-top:0}
a{color:var(--accent)}
.interests{display:grid;gap:.75rem}
.interest{display:block;padding:1rem 1.1rem;border-radius:14px;background:var(--card);border:1px solid var(--line);border-left:6px solid var(--c);text-decoration:none;color:inherit}
.interest strong{font-size:1.15rem}
.interest .meta{color:var(--muted);font-size:.9rem}
.meetups{list-style:none;padding:0;margin:0;display:grid;gap:.75rem}
.meetup{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:.9rem 1rem}
.meetup a.title{color:inherit;text-decoration:none;font-weight:600}
.meetup .when{font-weight:600}
.meetup .rel{color:var(--c,var(--accent));font-size:.9rem;margin-left:.35rem}
.meetup .place{margin:.1rem 0}
.meetup .note{color:var(--muted);margin:.1rem 0}
.meetup .row{display:flex;justify-content:space-between;align-items:center;gap:.75rem;margin-top:.5rem;flex-wrap:wrap}
.spots{font-size:.9rem;color:var(--muted)}
.spots b{color:var(--ink)}
.dots{letter-spacing:2px;color:var(--c,var(--accent))}
form.inline{display:inline;margin:0}
button,.button{font:inherit;border:0;border-radius:999px;padding:.5rem 1.1rem;background:var(--c,var(--accent));color:#fff;cursor:pointer;text-decoration:none;display:inline-block}
button.quiet{background:transparent;color:var(--muted);border:1px solid var(--line)}
button[disabled]{opacity:.45;cursor:not-allowed}
.tag{font-size:.8rem;padding:.1rem .5rem;border-radius:999px;background:#f1ebe2;color:var(--muted)}
.tag.you{background:var(--c,var(--accent));color:#fff}
.tag.changed{background:#fff3cd;color:#7a5a00;font-weight:600}
.changes{margin:.3rem 0 0}
.next{background:var(--card);border:1px solid var(--line);border-top:6px solid var(--c);border-radius:16px;padding:1rem 1.1rem;margin:.5rem 0 1rem}
.next .label{margin:0;color:var(--c);font-weight:600;font-size:.9rem;text-transform:uppercase;letter-spacing:.03em}
.next .big-when{font-size:1.5rem;font-weight:700;margin:.3rem 0 0;line-height:1.2}
.next .big-when a{color:inherit;text-decoration:none}
.next .countdown{margin:0;color:var(--c);font-weight:600}
.next .big-place{font-size:1.15rem;margin:.5rem 0 .2rem}
.next .row{display:flex;justify-content:space-between;align-items:center;gap:.75rem;margin-top:.75rem;flex-wrap:wrap}
.banner{background:#fff3cd;border:1px solid #f0d58a;border-radius:10px;padding:.5rem .75rem;margin:.5rem 0;color:#5c4400}
.banner p{margin:.1rem 0}
.banner.small{font-size:.9rem;padding:.35rem .6rem;margin:.35rem 0 0}
.later-list{list-style:none;padding:0;margin:0;display:grid;gap:.5rem}
.later{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--c);border-radius:12px;padding:.6rem .8rem}
.later a{color:inherit;text-decoration:none}
.later.off{opacity:.8}
a.button.quiet{background:transparent;color:var(--muted);border:1px solid var(--line);padding:.45rem 1rem}
fieldset{border:1px solid var(--line);border-radius:14px;background:var(--card);padding:1rem;margin:0}
legend{font-weight:600;padding:0 .3rem}
label{display:block;margin:.6rem 0 .2rem;font-size:.95rem}
input,textarea,select{font:inherit;width:100%;padding:.5rem .6rem;border:1px solid #cfc6b9;border-radius:8px;background:#fff}
input[type=number]{width:6rem}
.hint{font-size:.85rem;color:var(--muted)}
.error{background:#fdecea;border:1px solid #f3b7ae;color:#8a1f11;padding:.6rem .8rem;border-radius:10px;margin:.75rem 0}
.empty{color:var(--muted);padding:1rem;border:1px dashed var(--line);border-radius:14px;text-align:center}
.log{list-style:none;padding:0;color:var(--muted);font-size:.95rem}
.log li{padding:.25rem 0;border-bottom:1px dotted var(--line)}
.people{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:.4rem}
.people li{background:#f1ebe2;border-radius:999px;padding:.2rem .7rem}
footer{max-width:40rem;margin:0 auto;padding:1rem;color:var(--muted);font-size:.85rem}
.readme{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:.5rem 1.25rem 1.5rem}
.readme h1{font-size:1.8rem}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
@keyframes just-changed{from{box-shadow:0 0 0 4px #f0d58a}to{box-shadow:0 0 0 4px rgba(240,213,138,0)}}
[data-live].just-changed{animation:just-changed 1.4s ease-out}
@media (prefers-reduced-motion:reduce){[data-live].just-changed{animation:none}}
`;

// Progressive enhancement, and nothing more: with this script blocked the page
// is exactly what it was before — a form POST and a redirect (CLAUDE.md, "works
// with JavaScript off"). All it does is notice that the server said something
// changed, ask for this same page again, and swap in the parts that differ. The
// rendering stays in views.ts, so there is no second copy of it here to drift.
const LIVE_JS = `
(function () {
  var topics = document.body.getAttribute("data-topics");
  if (!topics || !window.EventSource) return;

  var src = null, fails = 0, pending = null, inflight = null, hiding = null;
  var loaded = Date.now(), active = Date.now();
  var SETTLE = 1500, GIVE_UP = 1800000, HIDE_GRACE = 30000, TICK = 60000;

  function regions(doc) {
    var map = {}, all = doc.querySelectorAll("[data-live]"), i;
    for (i = 0; i < all.length; i++) map[all[i].getAttribute("data-live")] = all[i];
    return map;
  }

  function typing() {
    var el = document.activeElement, t = el && el.tagName;
    return t === "INPUT" || t === "TEXTAREA" || t === "SELECT";
  }

  // A focused button inside a region about to be replaced would drop focus to
  // <body>, sending a keyboard user back to the top. A form's action names it
  // stably across the swap.
  function focusKey() {
    var el = document.activeElement;
    if (!el || el.tagName !== "BUTTON" || !el.closest) return null;
    var form = el.closest("form[action]");
    return form && form.getAttribute("action");
  }

  function refresh() {
    var waited = Date.now() - loaded;
    if (waited < SETTLE) {
      clearTimeout(pending);
      pending = setTimeout(refresh, SETTLE - waited + 50);
      return;
    }
    if (typing()) return;
    if (inflight) inflight.abort();
    var ac = new AbortController();
    inflight = ac;
    fetch(location.href, { cache: "no-store", credentials: "same-origin", signal: ac.signal })
      .then(function (r) {
        var type = r.headers.get("content-type") || "";
        return r.ok && type.indexOf("text/html") === 0 ? r.text() : null;
      })
      .then(function (html) {
        if (!html || typing()) return;
        var fresh = regions(new DOMParser().parseFromString(html, "text/html"));
        var here = regions(document), key = focusKey(), changed = 0, name, el;
        for (name in here) {
          if (!fresh[name] || fresh[name].innerHTML === here[name].innerHTML) continue;
          el = here[name];
          // Same-origin HTML this server just rendered, already through esc();
          // DOMParser does not run scripts.
          el.innerHTML = fresh[name].innerHTML;
          el.classList.remove("just-changed");
          void el.offsetWidth;
          el.classList.add("just-changed");
          changed++;
        }
        if (!changed) return;
        if (key) {
          var form = document.querySelector('form[action="' + key + '"]');
          var btn = form && form.querySelector("button");
          if (btn) btn.focus();
        }
        var status = document.getElementById("live-status");
        if (status) status.textContent = "This page just updated.";
      })
      .catch(function () {})
      .then(function () { if (inflight === ac) inflight = null; });
  }

  // Everyone watching hears the same event in the same instant; without a
  // spread they all re-render on one shared vCPU at once.
  function soon() {
    clearTimeout(pending);
    pending = setTimeout(refresh, 150 + Math.random() * 1200);
  }

  function close() { if (src) { src.close(); src = null; } }

  function open() {
    if (src || document.hidden) return;
    src = new EventSource("/events?topics=" + encodeURIComponent(topics));
    src.onopen = function () { fails = 0; };
    src.addEventListener("change", function () { active = Date.now(); soon(); });
    src.onerror = function () {
      close();
      if (document.hidden || Date.now() - active > GIVE_UP) return;
      fails++;
      setTimeout(open, Math.min(2000 * Math.pow(2, fails - 1), 120000));
    };
  }

  // Phones app-switch constantly. Closing the instant a tab hides would mean a
  // fresh handshake every few seconds; waiting lets a glance back be free.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { hiding = setTimeout(close, HIDE_GRACE); return; }
    clearTimeout(hiding);
    active = Date.now();
    open();
    soon();
  });
  // A page being navigated away from should not re-render itself.
  window.addEventListener("pagehide", close);
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    active = Date.now();
    open();
    soon();
  });
  ["pointerdown", "keydown"].forEach(function (name) {
    document.addEventListener(name, function () {
      active = Date.now();
      if (!src && !document.hidden) { fails = 0; open(); }
    }, { passive: true });
  });

  // Nothing is published when a meetup simply starts, so "in 5 min" would sit
  // there lying on a page that claims to be live. A slow tick keeps the clock
  // honest, and heals anything missed while the machine was asleep.
  setInterval(function () { if (!document.hidden) refresh(); }, TICK);

  open();
})();
`;

export function page(opts: {
  title: string;
  body: string;
  who?: string | null;
  colour?: string;
  // Only pages rendered by a GET that returned 200 pass topics. An error page
  // rendered from a POST sits at a URL that isn't GET-able, so re-fetching it
  // would 404 — and on the host form's 400 it would wipe what someone typed.
  topics?: string[];
}): string {
  const who = opts.who
    ? `<span class="who">Hey <b>${esc(opts.who)}</b> · <a href="/me">change</a></span>`
    : "";
  const style = opts.colour ? ` style="--c:${esc(opts.colour)}"` : "";
  const live = opts.topics?.length
    ? ` data-topics="${esc(opts.topics.join(","))}"`
    : "";
  const script = opts.topics?.length
    ? `<div id="live-status" class="sr-only" role="status" aria-live="polite"></div>
<script>${LIVE_JS}</script>`
    : "";
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<style>${CSS}</style>
</head>
<body${style}${live}>
<header class="site"><a class="brand" href="/">Buddy Up</a>${who}</header>
<main>
${opts.body}
</main>
<footer>Find someone to do the thing with, today. · <a href="/readme/">What this is, and why</a></footer>
${script}
</body>
</html>`;
}
