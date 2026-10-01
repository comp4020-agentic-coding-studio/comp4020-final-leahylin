// The interests are fixed in code, not user-created: a few things people on
// campus actually do together. Adding one is a deliberate change, not a feature.
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
    colour: "#d9542b",
    placeHint: "Black Mountain summit track, bottom gate",
    noteHint: "easy 5k, ~6:00/km",
  },
  {
    slug: "badminton",
    name: "Badminton",
    blurb: "Enough people for doubles.",
    colour: "#2b7a5b",
    placeHint: "ANU Sport hall, court 3",
    noteHint: "court booked, bring a racquet",
  },
  {
    slug: "coffee",
    name: "Coffee",
    blurb: "A table and a reason to leave the library.",
    colour: "#7a4b2b",
    placeHint: "Coffee Grounds, Union Court",
    noteHint: "study break, 30 min",
  },
];

export function findInterest(slug: string): Interest | undefined {
  return INTERESTS.find((i) => i.slug === slug);
}
