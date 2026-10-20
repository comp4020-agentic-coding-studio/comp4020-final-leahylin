# Multi-user test report: Fly logs

How Buddy Up behaves with several people at once, checked against the
deployed app using only `flyctl logs`. Each scenario says what should happen
(from the code and the decisions) and what was actually seen. **Observed**
is filled in only from a real run; a blank means the scenario hasn't been run.

- **App:** `comp4020-final-leahylin` (one shared-cpu-1x machine, 256 MB, one volume at `/data`)
- **Commit tested:** `main` as deployed on 20 October 2026 (latest app change [`52bb3b4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/52bb3b4))
- **Date and people:** 20 October 2026, 12:55–13:08 UTC. A = `lll#1026` (new account), B = `anu#210`, C = `lin#2`, each in their own browser window

## 1. What the logs cover

One `key=value` line per request, written to stdout
([decision 6](../decisions/0006-action-logging.md)), for example:

```
actor=amy#12 action=join_meetup meetup=7 status=303 result=ok
actor=anu#15 action=view_meetup meetup=68 status=404 result=denied reason=not_visible
```

| Event the checklist asks for | Logged? | How it shows up |
| --- | --- | --- |
| User connects / joins a room | Yes (**fixed** in [`8bbd07c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/8bbd07c)) | `action=subscribe` when a page opens its live stream, with the topics it was allowed (a meetup, an activity, a person, a circle). Before the fix this line was never written for an accepted stream: it waited for `finish`, which an open stream never reaches. Confirmed on the deployed app in 3.8 |
| User disconnects / leaves a room | Yes (**added** after the test) | `action=unsubscribe` when a stream ends, with its topics, `open_for=` and a `reason=`: `client_closed` (tab closed or hidden), `expired` (10-minute cap), `not_draining`, or `shutdown`. During 3.1–3.8 this wasn't logged and had to be read from a page's once-a-minute refreshes stopping. Leaving a *meetup* (`leave_meetup`) was already logged |
| Server receives an action | Yes | One line per POST: `create_meetup`, `join_meetup`, `edit_meetup`, `add_friend`, `join_circle`, … with `result=` |
| Server broadcasts an update | Yes (**added** after the test) | `action=broadcast topics=… delivered=N` after every write: which topics changed and how many open streams were told. The request line just before it says who caused it. During 3.1–3.8 this had to be read from each open page's follow-up GET |
| Server rejects an action | Yes | `result=denied` with a `reason=` (`full`, `not_visible`, `not_host`, `closed`, …) |
| Server sends a state snapshot to one user | Yes | The re-fetch GET after a signal is an ordinary page request, logged under that viewer's `actor=` |

When the test ran, disconnects and broadcasts weren't logged, so those two
were read from the re-fetch GETs. Both were added afterwards, so every row
above can now be read straight from the log.

**Found during the test, and fixed:** in 3.1–3.6 no `action=subscribe` line
appeared at all, although live updates were working. The line was written on
the response's `finish` event, which an open stream never reaches. An accepted
stream is now logged as soon as it opens
([`8bbd07c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/8bbd07c)),
and 3.8, run after the fix, shows it.

## 2. Setup

1. Deploy the commit under test (push to `main`, or `flyctl deploy`).
2. In a terminal: `mise exec -- flyctl logs -a comp4020-final-leahylin`
3. Each tester signs up in their own private window. Note who is who
   (`actor=name#id`) so the log can be read back.

## 3. Scenarios

### 3.1 Two users join the same meetup

- **Do:** A posts a meetup for a circle B is in. B opens it and taps I'm in.
- **Expected:** A's open page updates within about a second without reload;
  head count goes up by one. Log: A `create_meetup`, B `join_meetup result=ok`,
  then a GET from A's page.
- **Observed: as expected.** A made circle 373 and posted coffee meetup 310
  (12:57:31.097); B's open circle page re-fetched 0.37 s later and showed it.
  B joined (12:57:41.995, `join_meetup result=ok`); A's coffee page re-fetched
  0.5 s later.

### 3.2 One user's action reaches only the right people

- **Do:** A edits the meetup's time. B (in the circle) and C (not in it) both
  have pages open.
- **Expected:** B's page shows exactly what changed. C sees nothing and C's
  stream was never given that topic. Log: A `edit_meetup`, a GET from B only.
- **Observed: as expected.** A edited meetup 310 (12:58:05.879); B's page
  re-fetched 0.45 s later. C wasn't in the circle yet and had no page open, so
  the "C sees nothing" half was checked in 3.6 instead. Once C had joined, a
  later edit (13:06:18) reached both B (0.29 s) and C (0.51 s), as it should.

### 3.3 Simultaneous action (same second)

- **Do:** A meetup with one spot left; two people tap I'm in together.
- **Expected:** exactly one gets in; the other sees it's full. Log: one
  `join_meetup result=ok`, one `result=denied reason=full`. (The spec tests
  the same race with five joiners.)
- **Observed: as expected.** A posted badminton meetup 311 with one spot
  left. B and C tapped I'm in 14 ms apart: B `join_meetup result=ok`
  (13:00:18.436), C `status=409 result=denied reason=full` (13:00:18.450).
  C saw "Just filled up: Someone took the last spot a moment ago. Start your
  own?". A's page re-fetched 0.4 s later.

### 3.4 Late user joins

- **Do:** after 3.1–3.3, D joins the circle and opens the meetup.
- **Expected:** D sees the current state (head count, edits) on first load,
  not a replay. Log: D `join_circle`, D's GET, D's `subscribe`.
- **Observed: as expected (C played D).** C joined circle 373 by code
  (12:59:29–12:59:30) and the circle page loaded with its current meetups.
  A's open circle page re-fetched 0.37 s later with C in the members list.
  C saw meetup 310 on that first load. `subscribe` was missing from the log
  (see section 1).

### 3.5 Leave and return (close the tab)

- **Do:** B closes the tab, A changes something, B reopens the page.
- **Expected:** nothing is lost; B sees the change on reopening. Log: no line
  when B closes (see gaps), B's GET and `subscribe` on return.
- **Observed: as expected.** B's once-a-minute refreshes stop after 13:07:18,
  so B's window was closed. A edited meetup 311 at 13:07:54 and nothing was
  sent to B. B came back at 13:07:59 as `anon`, because closing a private
  window also clears its cookie, and logged in again at 13:08:17. B's home
  page then showed 311's new time.

### 3.6 Isolated rooms

- **Do:** two circles with no shared members each post a meetup at once.
- **Expected:** neither circle's pages refresh for the other's meetup. An
  outsider opening the other circle's meetup URL gets 404. Log:
  `action=view_meetup result=denied reason=not_visible`.
- **Observed: as expected.** C posted running meetup 312 in C's own circle 1
  (13:04:00.087). Neither A's nor B's open pages re-fetched for it. A opened
  its URL and got a 404 page; the log said
  `status=404 action=view_meetup meetup=312 result=denied reason=not_visible`.
  When A opened the running page at 13:04:10, 312 was not listed.

### 3.7 Two machines (`fly scale count 2`)

- **Expected: not supported, by design.** `fly.toml` fixes the app at one
  machine and one volume, and decision 1 relies on that: SQLite lives on the
  one volume and live updates are sent from the process's own memory. A
  second machine would get its own empty volume, so users routed to it would
  see a different database, and live updates wouldn't cross machines.
- **Recommendation:** don't run this on the course app; record it as a known
  limit instead. If it is run, scale back with `fly scale count 1` straight
  after and check no data was written to the second volume.
- **Observed:** not run, as recommended.

### 3.8 Restart the machine mid-session

- **Do:** with pages open, `flyctl machine restart <machine-id>`.
- **Expected:** open streams drop and the browser reconnects on its own
  (EventSource retry); pages then show the current state. Everything posted
  before the restart is still there, because it is in SQLite on the volume.
  Log: the startup line, then fresh `subscribe` lines from each open page.
- **Observed: as expected**, run after the log fixes were deployed, with A's
  home page open. `flyctl machine restart` at 13:44:07: the app took SIGINT
  and exited cleanly within a second, the volume remounted and checked clean,
  and `buddy up listening on :8080` came at 13:44:12. In the 3 s between the
  machine starting and Node listening, the proxy logged two
  `instance refused connection` errors; Fly's hint about 127.0.0.1 doesn't
  apply, since the same requests succeed from 13:44:12. A's page reconnected
  on its own about 8 s later (13:44:20 GET, 13:44:21 `subscribe`) with the
  same topics as before, including meetups 310 and 311, so nothing on the
  volume was lost. Afterwards B logged in and subscribed (13:45:42); A opened
  and saved 311's edit form (`open_edit` 13:46:04, `edit_meetup result=ok`
  13:46:11.446) and B's page re-fetched 0.28 s later and showed the new place.

## 4. Summary

3.1–3.6 and 3.8 behaved as expected; 3.7 was not run. Live
updates reached the right people in 0.3–0.5 s and no one else, and the
last-spot race let exactly one person in.

Reading the log closely found three things to fix:

1. **Successful `subscribe` lines were never written.** Fixed: an accepted
   stream is logged as soon as it opens
   ([`8bbd07c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/8bbd07c));
   3.8 was run after the fix, and the reconnect shows in the log.
2. **Opening the edit form was logged as an edit.** A GET of `/m/310/edit`
   read `action=edit_meetup result=ok`, so one edit looked like two. Fixed:
   the form is now `action=open_edit` (same commit).
3. **Icon requests looked like anonymous visits.** C's browser asked for
   `/favicon.ico` without the session cookie, so every page C opened added
   `actor=anon … /favicon.ico status=303` and a GET of `/login`. Fixed: the
   icon request gets an empty 204, and pages declare an empty icon (same
   commit).

Two things that look odd in the log but are by design: every open, visible
page re-fetches once a minute (`TICK` in `src/html.ts`, so "in 20 hours"
stays true), and a page that has been in the background for 30 s closes its
stream (`HIDE_GRACE`) and reopens it when shown again.
