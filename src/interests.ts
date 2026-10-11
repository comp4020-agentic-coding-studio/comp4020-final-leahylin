import * as db from "./db.ts";

// Three activities are built in: things people on campus actually do
// together, each with its own colour and hints. Anything else is made by
// whoever first starts a meetup for it (decision 5), and its name is only
// shown to people who can see one of its meetups.
export interface Interest {
  slug: string;
  name: string;
  blurb: string;
  colour: string;
  placeHint: string;
  noteHint: string;
}

export const INTERESTS: Interest[] = [
  {
    slug: "running",
    name: "Running",
    blurb: "Someone to keep pace with.",
    colour: "#C2410C",
    placeHint: "Black Mountain summit track, bottom gate",
    noteHint: "easy 5k, ~6:00/km",
  },
  {
    slug: "badminton",
    name: "Badminton",
    blurb: "Enough people for doubles.",
    colour: "#15803D",
    placeHint: "ANU Sport hall, court 3",
    noteHint: "court booked, bring a racquet",
  },
  {
    slug: "coffee",
    name: "Coffee",
    blurb: "A table and a reason to leave the library.",
    colour: "#7C4A24",
    placeHint: "Coffee Grounds, Union Court",
    noteHint: "study break, 30 min",
  },
];

// The page for starting something not listed. Not a real activity.
export const NEW_SLUG = "new";
export const NEW_INTEREST: Interest = {
  slug: NEW_SLUG,
  name: "Something else",
  blurb: "Name it, then say when and where.",
  colour: "#1F1B16",
  placeHint: "e.g. Chifley Library, level 2",
  noteHint: "what to bring, how long",
};

function fromActivity(a: db.Activity): Interest {
  return {
    ...a,
    blurb: "Started by people you know.",
    placeHint: "Where exactly?",
    noteHint: "what to bring, how long",
  };
}

// Built-in or made by someone. Only call for a slug the viewer may know:
// a meetup they can see, or a page canOpen() allowed.
export function findInterest(slug: string): Interest | undefined {
  const built = INTERESTS.find((i) => i.slug === slug);
  if (built) return built;
  const a = db.activityBySlug(slug);
  return a ? fromActivity(a) : undefined;
}

// What this person's menu and home page list: the three, then any others
// with something on that they can see.
export function interestsFor(viewerId: number, now: number): Interest[] {
  return [...INTERESTS, ...db.liveActivities(viewerId, now).map(fromActivity)];
}

// A made-up activity's page opens only for someone who can see one of its
// meetups; to anyone else it doesn't exist.
export function canOpen(slug: string, viewerId: number): boolean {
  return INTERESTS.some((i) => i.slug === slug) || db.activitySeenBy(slug, viewerId);
}

export const ACTIVITY_NAME_MAX = 24;
const NAME = /^[A-Za-z0-9][A-Za-z0-9 '-]*$/;

// "Board games" -> "board-games". Same letters, any case, same activity.
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
}

// What someone typed as the activity's name, checked: the name to keep and
// its slug, or why not.
export function readActivityName(raw: string | null):
  | { name: string; slug: string; error?: undefined }
  | { error: string } {
  const name = (raw ?? "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > ACTIVITY_NAME_MAX)
    return { error: `Name the activity in 2 to ${ACTIVITY_NAME_MAX} characters.` };
  if (!NAME.test(name) || !/[A-Za-z]/.test(name))
    return { error: "Use letters, numbers, spaces, ' or - in the activity's name." };
  const slug = slugify(name);
  if (!slug || slug === NEW_SLUG) return { error: "Pick another name for the activity." };
  return { name, slug };
}
