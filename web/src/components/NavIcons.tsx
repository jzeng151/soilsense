import type { JSX } from "react";

/** One icon set for every navigation surface (planner sidebar and the Explore/Demo rail). Decorative: pair with a text label. */
export type NavIconKind =
  | "explore" | "demo" | "planner" | "sprout" | "live" | "sources" | "how-it-works" | "settings" | "layers" | "signin";

export function NavIcon({ kind }: { kind: NavIconKind }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[kind]}</svg>;
}

const ICONS: Record<NavIconKind, JSX.Element> = {
  explore: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c6 5 6 13 0 18-6-5-6-13 0-18" /></>,
  demo: <path d="M12 21V11M12 14C4 14 3 9 3 5c7 0 9 4 9 9zM12 10c0-6 5-7 9-7 0 7-4 9-9 9" />,
  planner: <><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" /><path d="M9 3v15M15 6v15" /></>,
  sprout: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 10h.01M12 10h.01M16 10h.01" /></>,
  live: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  sources: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  "how-it-works": <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  layers: <path d="m3 8 9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5" />,
  signin: <path d="M5 21v-2c0-6 14-6 14 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0" />,
};
