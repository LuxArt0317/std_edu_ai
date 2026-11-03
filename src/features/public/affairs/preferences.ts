import { portalPrograms, portalNews } from "./model";
export interface PortalPreferences {
  collapsed: boolean;
  theme: "blue" | "dark" | "pink" | "light";
  fontSize: number;
  fixedNavbar: boolean;
  fixedSidebar: boolean;
  fixedBreadcrumbs: boolean;
  contained: boolean;
  hoverMenus: boolean;
  alternateActive: boolean;
  favorites: string[];
  bookmarks: string[];
}
export const preferenceKey = "stu.affairs.preview.v1";
export const defaultPreferences: PortalPreferences = {
  collapsed: false,
  theme: "blue",
  fontSize: 14,
  fixedNavbar: false,
  fixedSidebar: false,
  fixedBreadcrumbs: false,
  contained: false,
  hoverMenus: false,
  alternateActive: false,
  favorites: [],
  bookmarks: [],
};
export function sanitizePreferences(value: unknown): PortalPreferences {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const result = {
    ...defaultPreferences,
    favorites: [] as string[],
    bookmarks: [] as string[],
  };
  for (const name of [
    "collapsed",
    "fixedNavbar",
    "fixedSidebar",
    "fixedBreadcrumbs",
    "contained",
    "hoverMenus",
    "alternateActive",
  ] as const)
    if (typeof source[name] === "boolean") result[name] = source[name];
  if (["blue", "dark", "pink", "light"].includes(String(source.theme)))
    result.theme = source.theme as PortalPreferences["theme"];
  if (typeof source.fontSize === "number" && Number.isFinite(source.fontSize))
    result.fontSize = Math.max(12, Math.min(20, Math.round(source.fontSize)));
  result.favorites = Array.isArray(source.favorites)
    ? [
        ...new Set(
          source.favorites.filter(
            (id): id is string =>
              typeof id === "string" && portalPrograms.some((p) => p.id === id),
          ),
        ),
      ]
    : [];
  result.bookmarks = Array.isArray(source.bookmarks)
    ? [
        ...new Set(
          source.bookmarks.filter(
            (id): id is string =>
              typeof id === "string" && portalNews.some((p) => p.id === id),
          ),
        ),
      ]
    : [];
  return result;
}
export function loadPreferences(accountId?: string): {
  value: PortalPreferences;
  storageAvailable: boolean;
} {
  try {
    const raw = localStorage.getItem(accountId ? `${preferenceKey}:${accountId}` : preferenceKey);
    let value: unknown = null;
    try {
      value = JSON.parse(raw || "null");
    } catch {
      /* Recover invalid local preview settings. */
    }
    return { value: sanitizePreferences(value), storageAvailable: true };
  } catch {
    return { value: sanitizePreferences(null), storageAvailable: false };
  }
}
export function readPreferences(): PortalPreferences {
  return loadPreferences().value;
}
export function savePreferences(value: PortalPreferences, accountId?: string): boolean {
  try {
    localStorage.setItem(
      accountId ? `${preferenceKey}:${accountId}` : preferenceKey,
      JSON.stringify(sanitizePreferences(value)),
    );
    return true;
  } catch {
    return false;
  }
}
