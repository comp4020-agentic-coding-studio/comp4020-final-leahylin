import { INTERESTS } from "./interests.ts";

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
:root{--ink:#1F1B16;--muted:#5E554C;--line:#E8DFD2;--paper:#FBF7F0;--card:#FFFFFF;--soft:#F3ECE2;--accent:#C2410C;--link:#B23A0A;--display:"Bricolage Grotesque",system-ui,sans-serif}
*{box-sizing:border-box}
body{margin:0;font:16px/1.5 "DM Sans",system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--paper)}
a{color:var(--link)}
.wrap{max-width:40rem;margin:0 auto;padding:0 16px}
header.site{background:var(--card);border-bottom:1px solid var(--line)}
header.site .bar{max-width:40rem;margin:0 auto;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;gap:16px}
.brand{font-family:var(--display);font-weight:800;font-size:22px;color:var(--ink);text-decoration:none}
.nav{display:none;gap:24px;font-size:15px}
.nav a{color:var(--ink);text-decoration:none}
.nav a:hover{color:var(--link)}
.who{font-size:14px;color:var(--muted);display:flex;align-items:center;gap:8px}
.who b{color:var(--ink)}
.live-dot{width:8px;height:8px;border-radius:50%;background:#15803D;flex:none}
main.wrap{padding-top:20px;padding-bottom:96px}
h1{font-family:var(--display);font-weight:800;font-size:30px;line-height:1.1;margin:0 0 6px}
h2{font-size:17px;margin:28px 0 10px}
p.lede{color:var(--muted);margin:0 0 8px}
.side{margin-top:8px}
.interests{display:grid;gap:10px}
.interest{display:block;padding:16px 18px;border-radius:18px;background:var(--c);color:#FFFFFF;text-decoration:none}
.interest strong{font-family:var(--display);font-weight:800;font-size:22px;display:block;line-height:1.2}
.interest .meta{font-size:14px;margin-top:4px}
.meetups{list-style:none;padding:0;margin:0;display:grid;gap:12px}
.meetup{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px 16px}
.meetup a.title{color:inherit;text-decoration:none;display:block}
.meetup .when{font-weight:700;font-size:17px}
.rel{color:var(--c,var(--accent));font-size:14px;font-weight:700;margin-left:6px}
.place{margin:6px 0 0;display:flex;gap:6px;align-items:flex-start}
.icon{flex:none;width:18px;height:18px;margin-top:3px;color:var(--c,var(--accent))}
.note{color:var(--muted);margin:2px 0 0;font-size:15px}
.row{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap}
.row>span:last-child{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.spots{font-size:14px;color:var(--muted)}
.spots b{color:var(--ink)}
.dots{letter-spacing:2px;color:var(--c,var(--accent))}
form.inline{display:inline;margin:0}
button.link{all:unset;color:var(--link);text-decoration:underline;cursor:pointer;font-size:inherit}
button.link:focus-visible{outline:2px solid var(--link);outline-offset:2px}
.invite{font-family:ui-monospace,Menlo,monospace;font-size:14px;background:var(--soft)}
.inline-gap{margin:12px 0}
.later>span:first-child{flex:1}
.row-actions{display:flex;gap:8px;flex-wrap:wrap}
.count{color:var(--link);font-weight:700}
select{appearance:auto}
.tag.for{background:var(--soft);color:var(--ink);font-weight:500}
.hint.warn{color:#8A1F11}
.auth-actions{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0}
button,.button{font:inherit;font-weight:700;border:0;border-radius:999px;min-height:44px;padding:0 20px;background:var(--c,var(--accent));color:#FFFFFF;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
button.quiet,a.button.quiet{background:transparent;color:var(--muted);border:1px solid #D8CDBE;font-weight:500;padding:0 16px}
button[disabled]{background:#D8CDBE;color:var(--muted);cursor:not-allowed}
.tag{font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;background:var(--soft);color:var(--muted)}
.tag.you{background:var(--c,var(--accent));color:#FFFFFF}
.tag.changed{background:#FFF4D6;color:#5C4400}
.changes{margin:6px 0 0;display:flex;gap:6px;flex-wrap:wrap}
.hint{font-size:14px;color:var(--muted)}
.next{background:var(--card);border:1px solid var(--line);border-radius:20px;overflow:hidden;box-shadow:0 6px 18px rgba(60,40,20,.08);margin:10px 0 4px}
.next::before{content:"";display:block;height:6px;background:var(--c)}
.next .inner{padding:16px}
.next .label{margin:0;color:var(--c);font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.06em}
.next .big-when{font-family:var(--display);font-weight:800;font-size:40px;line-height:1;margin:10px 0 0}
.next .big-when a{color:inherit;text-decoration:none}
.next .countdown{margin:4px 0 0;color:var(--c);font-weight:700}
.next .countdown .date{color:var(--muted);font-weight:500}
.next .big-place{font-size:18px;font-weight:700;margin:12px 0 0}
.next .people-label{margin:12px 0 0}
.banner{background:#FFF4D6;border:1px solid #F0D58A;border-radius:12px;padding:8px 12px;margin:10px 0;color:#5C4400;font-size:15px}
.banner p{margin:2px 0}
.banner.small{font-size:14px;padding:6px 10px;margin:8px 0 0}
.later-list{list-style:none;padding:0;margin:0;display:grid;gap:10px}
.later{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.later::before{content:"";width:10px;height:10px;border-radius:50%;background:var(--c);flex:none}
.later a{color:inherit;text-decoration:none;flex:1}
.later .banner{flex-basis:100%}
.later.off{opacity:.8}
.people{list-style:none;padding:0;margin:6px 0 0;display:flex;flex-wrap:wrap;gap:6px}
.people li{background:var(--soft);border-radius:999px;padding:4px 12px;font-size:14px}
fieldset{border:1px solid var(--line);border-radius:20px;background:var(--card);padding:18px;margin:0}
legend{float:left;width:100%;padding:0;margin:0 0 2px;font-family:var(--display);font-weight:800;font-size:20px}
legend+*{clear:left}
label{display:block;margin:12px 0 4px;font-size:14px;font-weight:700}
label .hint{font-weight:400}
input,textarea,select{font:inherit;width:100%;min-height:44px;padding:10px 12px;border:1px solid #CFC6B9;border-radius:10px;background:#FFFFFF}
input[type=number]{width:6rem}
fieldset button[type=submit]{background:var(--ink);margin-top:14px}
.error{background:#FDECEA;border:1px solid #F3B7AE;color:#8A1F11;padding:10px 12px;border-radius:12px;margin:10px 0}
.empty{color:var(--muted);padding:18px;border:1px dashed #D8CDBE;border-radius:18px;text-align:center;background:var(--card)}
.log{list-style:none;padding:0;margin:4px 0 0;color:var(--muted);font-size:14px}
.log li{padding:6px 0;border-bottom:1px dotted #D8CDBE}
details.past summary{cursor:pointer;color:var(--muted);padding:12px 0}
.web-only{display:none}
.fab{position:fixed;left:16px;right:16px;bottom:16px;z-index:5;display:flex;align-items:center;justify-content:center;min-height:54px;border-radius:999px;background:var(--ink);color:#FFFFFF;font-weight:700;font-size:17px;text-decoration:none;box-shadow:0 8px 20px rgba(31,27,22,.25)}
footer{max-width:40rem;margin:0 auto;padding:16px;color:var(--muted);font-size:14px}
.readme{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:8px 20px 24px}
.readme h1{font-size:32px;margin-top:16px}
@media (min-width:700px){
.meetups.grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.interests.row3{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media (min-width:1000px){
header.site .bar,.wrap,footer{max-width:1440px;padding-left:clamp(24px,4vw,64px);padding-right:clamp(24px,4vw,64px)}
main.wrap:not(:has(.cols,.interests)){max-width:calc(44rem + 2 * clamp(24px,4vw,64px))}
.nav{display:flex}
h1{font-size:clamp(36px,3.2vw,52px)}
main.wrap{padding-top:36px;padding-bottom:48px}
.cols{display:grid;grid-template-columns:minmax(0,1fr) clamp(300px,26vw,400px);gap:clamp(32px,3vw,56px);align-items:start}
.meetups.grid{grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
.side{margin-top:0;position:sticky;top:24px}
.side .interests{grid-template-columns:1fr}
.next .inner{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:28px;padding:26px 28px}
.next .big-when{font-size:56px}
.fab,.mobile-only{display:none}
.web-only{display:block}
}
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

export type Who = { name: string; requests: number } | null;

export function page(opts: {
  title: string;
  body: string;
  // the signed-in person's display name, plus how many friend requests wait
  who?: Who;
  colour?: string;
  // Only pages rendered by a GET that returned 200 pass topics. An error page
  // rendered from a POST sits at a URL that isn't GET-able, so re-fetching it
  // would 404 — and on the host form's 400 it would wipe what someone typed.
  topics?: string[];
}): string {
  const requests = opts.who?.requests ?? 0;
  const who = opts.who
    ? `<span class="who">${opts.topics?.length ? `<span class="live-dot" title="Live"></span>` : ""}Hey <b>${esc(opts.who.name)}</b> · <a href="/me">change</a> · <form class="inline" method="post" action="/logout"><button class="link">Log out</button></form></span>`
    : `<span class="who"><a href="/login">Log in</a></span>`;
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&amp;family=DM+Sans:wght@400;500;700&amp;display=swap">
<style>${CSS}</style>
</head>
<body${style}${live}>
<header class="site"><div class="bar"><a class="brand" href="/">Buddy Up</a><nav class="nav" aria-label="Interests">${INTERESTS.map((i) => `<a href="/i/${i.slug}">${esc(i.name)}</a>`).join("")}<a href="/circles">Circles</a><a href="/friends">${requests ? `Friends <span class="count">(${requests})</span>` : "Friends"}</a><a href="/readme/">About</a></nav>${who}</div></header>
<main class="wrap">
${opts.body}
</main>
<footer>Find someone to do the thing with, today. · <a href="/readme/">What this is, and why</a></footer>
${script}
</body>
</html>`;
}
