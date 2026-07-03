/** Parse a comma-separated tag input into a clean, de-duplicated list. */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const tag = part.trim().toLowerCase();
    if (tag) seen.add(tag);
  }
  return [...seen];
}

/** Render a tag list back into the comma-separated form input value. */
export function tagsToInput(tags: string[]): string {
  return tags.join(", ");
}

/**
 * Marks the placeholder note a failed voice transcription leaves in the Inbox,
 * so the Inbox can offer a Retry action. Namespaced to avoid colliding with
 * user tags. Lives here (not lib/db/captures) so client components can read it
 * without pulling in server-only code.
 */
export const VOICE_FAILED_TAG = "__voice_retry__";
