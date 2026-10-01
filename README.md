# Buddy Up

Find someone to do the thing with, today.

An activity buddy is someone you share one activity with, not a friend you
have to keep up. Pick running, badminton or coffee, then join a meetup or
start one: *Tuesday 6pm, Black Mountain, 4 people, easy pace*.

## What good means here

A good buddy app shortens the gap between *I'd like a running buddy* and
*I'm at the start line*. What counts is meetups that happen, not sign-ups.
Four commitments:

1. **Every meetup is concrete:** an activity, a time, a place and a head
   count. "Coffee sometime?" can't be posted, because it never happens.
2. **Everything is near:** within the next seven days, on or around the ANU
   campus.
3. **Joining is one action, and so is leaving.** No approval. Easy leaving
   means people back out instead of not turning up; the spot goes back and
   nothing records it.
4. **The head count is real.** Four never becomes five: badminton is doubles.

## Who it's for

ANU students who want company for something they'd do anyway: people new to
Canberra, whose friends don't run, or who'd rather not post "anyone?" in a
500-person group chat. Also the showcase room, full of possible buddies.

## What I chose not to build

- **Accounts.** A nickname your browser remembers; a light connection needs
  a light way in.
- **Direct messages.** The point is to meet. Group notes come in crit 9.
- **Profiles, followers, likes, ratings.** Rating a coffee turns it into an
  audition.
- **Search, maps, recommendations.** One campus; a list by time is enough.
- **Friend lists or "people you ran with".** They push toward being a social
  network.

## What persists and what doesn't

- **Your nickname** stays in your browser for a year.
- **Meetups and who joined** are kept. Finished ones move into a short log
  under each interest: *3 Oct · Black Mountain · 4 went*.
- **Leaving** removes you completely. There's no "left" or "flaked" history.

## How good is checked

These are tested in `spec/`, against the running app:

- a meetup without a time, place or head count is refused
- a meetup in the past or more than seven days ahead is refused
- joining and leaving each take one request, and leaving frees the spot
- a full meetup refuses one more person, even with simultaneous requests
- an edited meetup says exactly what changed (time, place, head count, note),
  and nothing else
- a meetup and its people are still there on a fresh visit

These can only be judged:

- *Is joining quick?* I'll time people in my pod.
- *Does it feel light?* The crit will tell me.
- *Do meetups happen?* Crit 9's check-in will make it countable.

## What I read and looked at

- Robin Sloan, [*An app can be a home-cooked meal*](https://www.robinsloan.com/notes/home-cooked-app/)
  (2020). Software for a few specific people can be good by standards that
  make no sense for a product.
- Clay Shirky, [*Situated Software*](https://gwern.net/doc/technology/2004-03-30-shirky-situatedsoftware.html)
  (2004). Software for one group in one place can lean on its context: here,
  the campus.
- Darius Kazemi, [*Run your own social*](https://runyourown.social/) (2019).
  A small, limited social space is a choice, not a failure to scale.
- Meetup, Strava clubs and rednote "buddy" posts: the median answers
  (weeks ahead, stats, the whole internet). I wanted near, numberless, local.

## Status

Crit 8: start, join, leave or edit a meetup; it's still there when you come
back. Next: real-time updates, meeting points, a notice board, check-in.
