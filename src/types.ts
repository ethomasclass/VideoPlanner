// Shared between the server and the app. data/planner.json follows this shape.

export const STATUSES = [
  { id: 'idea', label: 'Idea' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'ready', label: 'Ready' },
  { id: 'published', label: 'Published' },
] as const;
export type Status = (typeof STATUSES)[number]['id'];

export type SlotKind = 'long' | 'shortA' | 'shortB' | 'evergreen';

export interface CadenceSlot {
  kind: SlotKind;
  label: string;
  weekday: number; // 0 = Sunday … 6 = Saturday
  time: string; // "15:00", local time
}

export interface Settings {
  cadence: CadenceSlot[];
}

export interface Series {
  id: string;
  name: string;
  unitQuestion?: string;
}

/** A thumbnail: a concept (headline + what's in the picture), optionally with an uploaded image. */
export interface Thumb {
  id: string;
  headline?: string; // 2–4 words on the orange tape
  setup?: string; // optional small handwritten line above it
  picture?: string; // what's in the frame
  title?: string; // the video title it pairs with
  image?: string; // id of an uploaded image (served from /api/images/<id>)
  chosen?: boolean; // the one you're going with
}

export interface Video {
  id: string;
  kind: 'long' | 'short';
  number?: number; // the catalog number for long videos
  title: string; // the YouTube title (or working title)
  subtitle?: string;
  seriesId?: string;
  episode?: number;
  parentId?: string; // Shorts: the long video it comes from
  status: Status;
  runtime?: string;
  projectPath?: string; // folder in the style repo, e.g. projects/Diamond_Hoax
  seasons?: string[]; // release windows this video fits, e.g. ["halloween"]
  notes?: string;
  thumbs?: Thumb[];
  publishedAt?: string; // YYYY-MM-DD, when known
}

export interface Release {
  id: string;
  date: string; // YYYY-MM-DD
  slot: SlotKind;
  time?: string;
  videoId?: string; // what goes out
  promotesId?: string; // evergreen Shorts: the older long video it points to
  label?: string; // free text when nothing is linked yet
  status: 'planned' | 'scheduled' | 'published';
}

export interface ReleaseWindow {
  id: string;
  name: string;
  start: string; // MM-DD, repeats yearly
  end: string; // MM-DD; earlier than start means it runs over New Year (e.g. 12-20 → 01-05)
  hidden?: boolean; // not shown on the calendar (still used for suggestions and ideas)
}

export interface Idea {
  id: string;
  kind: 'long' | 'short';
  concept: string; // the idea in one line
  hook?: string; // the cold open's first line
  titles?: string[];
  thumbs?: Thumb[]; // thumbnail concepts, thumbnail first
  thumbnail?: string; // (older ideas) a thumbnail headline
  whyNow?: string; // season, anniversary, or why it fits the channel now
  archival?: string; // what real images/documents likely exist
  notes?: string;
  starred?: boolean;
  source: 'me' | 'claude' | 'gemini';
  videoId?: string; // set once the idea becomes a video
  createdAt: string; // YYYY-MM-DD
}

/** A thumbnail concept as the AI returns it. */
export interface ThumbDraft {
  picture: string;
  headline: string;
  setup: string;
  title: string;
}

/** An idea as the AI returns it, before it's saved. Thumbnail first. */
export interface IdeaDraft {
  thumbnail: ThumbDraft;
  kind: Idea['kind'];
  concept: string;
  hook: string;
  titles: string[];
  whyNow: string;
  archival: string;
}

export interface Planner {
  version: 1;
  settings: Settings;
  series: Series[];
  videos: Video[];
  releases: Release[];
  windows: ReleaseWindow[];
  ideas: Idea[];
}
