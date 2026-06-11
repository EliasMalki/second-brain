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
