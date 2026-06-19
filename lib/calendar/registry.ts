import "server-only";

import { GoogleCalendarProvider } from "./google";
import type { CalendarProvider, CalendarProviderId } from "./types";

/**
 * Provider registry. Maps a provider id to its implementation so the rest of
 * the app never references a concrete provider. v2 adds 'outlook' here + a class.
 */
const providers: Record<CalendarProviderId, CalendarProvider> = {
  google: new GoogleCalendarProvider(),
};

export function getProvider(id: CalendarProviderId): CalendarProvider {
  const provider = providers[id];
  if (!provider) throw new Error(`unknown calendar provider: ${id}`);
  return provider;
}
