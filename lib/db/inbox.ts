import { listNotes, type Note } from "@/lib/db/notes";
import { listPendingPrompts, type Prompt } from "@/lib/db/prompts";
import { listUnfiledTasks, type Task } from "@/lib/db/tasks";

/**
 * The Inbox is ONE mechanism (BUILD_SPEC §9): unfiled notes (project_id IS NULL,
 * not archived) + unfiled tasks (project_id IS NULL, open) + pending prompts
 * (status='pending', surface_after <= now()). captures.status is NOT an inbox
 * signal — a needs-clarification capture always creates a prompt.
 *
 * Unfiled tasks were previously missing: a task captured without a project never
 * surfaced anywhere actionable. Filing one from here sets its project_id.
 */

export type InboxItem =
  | { kind: "note"; createdAt: string; note: Note }
  | { kind: "task"; createdAt: string; task: Task }
  | { kind: "prompt"; createdAt: string; prompt: Prompt };

export async function listInbox(): Promise<InboxItem[]> {
  const [notes, tasks, prompts] = await Promise.all([
    listNotes({ inboxOnly: true }),
    listUnfiledTasks(),
    listPendingPrompts(),
  ]);

  const items: InboxItem[] = [
    ...notes.map((note): InboxItem => ({
      kind: "note",
      createdAt: note.created_at,
      note,
    })),
    ...tasks.map((task): InboxItem => ({
      kind: "task",
      createdAt: task.created_at,
      task,
    })),
    ...prompts.map((prompt): InboxItem => ({
      kind: "prompt",
      createdAt: prompt.created_at,
      prompt,
    })),
  ];

  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
