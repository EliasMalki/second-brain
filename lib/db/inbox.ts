import { listNotes, type Note } from "@/lib/db/notes";
import { listPendingPrompts, type Prompt } from "@/lib/db/prompts";

/**
 * The Inbox is ONE mechanism (BUILD_SPEC §9): exactly two sources, nothing
 * else. Unfiled notes (project_id IS NULL, not archived) + pending prompts
 * (status='pending', surface_after <= now()). captures.status is NOT an
 * inbox signal — a needs-clarification capture always creates a prompt.
 */

export type InboxItem =
  | { kind: "note"; createdAt: string; note: Note }
  | { kind: "prompt"; createdAt: string; prompt: Prompt };

export async function listInbox(): Promise<InboxItem[]> {
  const [notes, prompts] = await Promise.all([
    listNotes({ inboxOnly: true }),
    listPendingPrompts(),
  ]);

  const items: InboxItem[] = [
    ...notes.map((note): InboxItem => ({
      kind: "note",
      createdAt: note.created_at,
      note,
    })),
    ...prompts.map((prompt): InboxItem => ({
      kind: "prompt",
      createdAt: prompt.created_at,
      prompt,
    })),
  ];

  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
