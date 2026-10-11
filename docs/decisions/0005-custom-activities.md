# 5. Activities beyond running, badminton and coffee

Date: 2026-10-11 · Status: accepted, built

## Context

Since crit 8 the interests have been fixed in code: running, badminton and
coffee, each with its own colour, blurb and form hints. That kept every
page concrete, but people do more than three things together. A circle
that plays board games, or climbs on Thursdays, had nowhere to post.

The catch is commitment 5, only people you know. A global list of
activities that anyone can add to would show everyone what every circle is
up to, and would fill with duplicates and junk names.

## Decision

- **An activity is made with its first meetup.** Activities → "+ Something
  else" (or the card on home) opens `/i/new`: the usual host form plus
  "What?". Posting creates the activity and the meetup together, so an
  activity never exists with nothing in it. It gets its own page,
  `/i/<slug>`, and works like the built-in three: live updates, called-off
  rows, the past log.
- **Names are shared, not owned.** The slug ignores case and punctuation,
  so "Board games" and "board GAMES" are one activity; the first spelling
  is the one shown. Typing "running" posts to Running. Names are 2–24
  letters, numbers, spaces, ' or -.
- **Its name follows the meetups' visibility.** The menu and home list an
  activity only if you can see one of its meetups that's still on, using
  the same VISIBLE rule as everything else. Once all it has is called off,
  it drops out at once, live; whoever had joined still sees the
  "Called off by ..." row on home. The built-in three are always listed. Its page opens only if you can see any of its meetups, past ones
  included; otherwise it's a 404. So a circle's "Climbing" is the circle's
  business.
- **The three stay built in**, always listed first, with their own colours
  and hints. Others get a colour from a fixed palette and plain hints.

## Alternatives considered

- **Activities owned by a circle.** Clean privacy, but a meetup for "my
  friends" couldn't use them, and two circles would make two "Climbing"s.
- **A global, public list.** Simplest, and the one this decision exists to
  avoid: it leaks what groups do and needs moderation.
- **A free-text label on each meetup, no pages.** Lighter, but then there is
  no page to watch for the next climb, which is the point of an interest.

## Consequences

- Two strangers who both name "Climbing" share a slug, but each still sees
  only meetups they're allowed to; the activity row holds just a name and a
  colour.
- The menu lists at most 8 others, alphabetically; more than that and the
  rest are reached through their meetups.
- A brand-new activity shows up in someone's menu on their next page load,
  not live: the live topic for it didn't exist when their page was drawn.
- SQLite 3.51 mis-evaluated the first version of the "listed for you" query
  (`WHERE EXISTS` with the VISIBLE rule inside), dropping an activity when
  someone else's meetup of it came first. It's a join now, and the spec
  covers that case.
