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
`;

export function page(opts: { title: string; body: string; who?: string | null; colour?: string }): string {
  const who = opts.who
    ? `<span class="who">Hey <b>${esc(opts.who)}</b> · <a href="/me">change</a></span>`
    : "";
  const style = opts.colour ? ` style="--c:${esc(opts.colour)}"` : "";
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<style>${CSS}</style>
</head>
<body${style}>
<header class="site"><a class="brand" href="/">Buddy Up</a>${who}</header>
<main>
${opts.body}
</main>
<footer>Find someone to do the thing with, today. · <a href="/readme/">What this is, and why</a></footer>
</body>
</html>`;
}
