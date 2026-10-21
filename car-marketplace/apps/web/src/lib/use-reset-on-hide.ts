"use client";

import { useEffectEvent, useLayoutEffect } from "react";

/**
 * Next.js (Cache Components) keeps recently visited pages alive but hidden, so form
 * results like "Profile saved." or a half-finished sign-in would still be there when
 * the user comes back. Call `reset` as the page is hidden so it returns fresh.
 * See node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md
 */
export function useResetOnHide(reset: () => void) {
  const onHide = useEffectEvent(reset);
  useLayoutEffect(() => () => onHide(), []);
}
