// Shared between the server and the app. data/planner.json follows this shape.

export const PHASES = [
  { id: 'idea', label: 'Idea' },
  { id: 'packaging', label: 'Packaging' },
  { id: 'script', label: 'Script' },
  { id: 'voice', label: 'Voice' },
  { id: 'images', label: 'Images' },
  { id: 'scenes', label: 'Scenes' },
  { id: 'render', label: 'Render' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'package', label: 'Package' },
  { id: 'ready', label: 'Ready' },
  { id: 'published', label: 'Published' },
] as const;
export type Phase = (typeof PHASES)[number]['id'];

export type SlotKind = 'long' | 'shortA' | 'shortB' | 'evergreen';

export interface CadenceSlot {
  kind: SlotKind;
  label: string;
  weekday: number; // 0 = Sunday … 6 = Saturday
  time: string; // "15:00", local time
}

export interface Settings {
  cadence: CadenceSlot[];
  bufferTarget: number; // finished long videos you want banked ahead
  styleRepoPath: string; // local path to 15minhistorystyle, for project files
}

export interface Series {
  id: string;
  name: string;
  unitQuestion?: string;
}

export interface WaitingOn {
  who: 'me' | 'claude' | 'suno' | 'gemini' | 'other';
  what: string;
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
  phase: Phase;
  runtime?: string;
  chapters?: number;
  words?: number;
  projectPath?: string; // relative to the style repo
  branch?: string;
  endingLine?: string;
  seasons?: string[]; // windows this video fits, e.g. ["halloween"]
  waitingOn?: WaitingOn[];
  notes?: string;
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
  end: string; // MM-DD
}

export interface Idea {
  id: string;
  concept: string;
  hook?: string;
  titles?: string[];
  season?: string;
  notes?: string;
  createdAt: string;
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
