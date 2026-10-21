/**
 * What the browser knows about the signed-in buyer: which cars they saved, which searches
 * they saved and how many alerts are unread. Served by /api/me and shared by every heart,
 * save-search button and the header badge.
 */
export type BuyerState =
  | { signedIn: false }
  | {
      signedIn: true;
      userId: string;
      favourites: string[];
      savedSearches: { id: string; key: string }[];
      /** Unread saved-search alerts. */
      unread: number;
      /** Unread chat messages from other people. */
      unreadMessages: number;
    };

/** A stable key for a filter object, independent of key order. */
export function filtersKey(filters: unknown): string {
  return JSON.stringify(sortKeys(filters));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}
