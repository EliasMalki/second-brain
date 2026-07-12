import type { Db } from "../supabase";
import { listFilingSuggestions, type FilingSuggestion } from "./captures";
import { listNotes, type Note } from "./notes";
import { listProjects } from "./projects";
import {
  listDiscrepancySuggestions,
  listPendingPrompts,
  resolveProjectForPrompt,
  type Prompt,
} from "./prompts";
import { listUnfiledTasks, type Task } from "./tasks";

/**
 * The Inbox is ONE mechanism (BUILD_SPEC §9): unfiled notes (project_id IS NULL,
 * not archived) + unfiled tasks (project_id IS NULL, open) + pending prompts
 * (status='pending', surface_after <= now()). captures.status is NOT an inbox
 * signal — a needs-clarification capture always creates a prompt.
 *
 * Each item also carries the app's opinion so the UI can offer it as one tap:
 *  - notes/tasks: the classifier's suggested project + confidence (read back
 *    from captures.interpretation — see listFilingSuggestions)
 *  - discrepancy prompts: the detector's suggested reclassify target (links row)
 *  - question prompts: the project the answer will enrich (the "why" line)
 * A suggested project id is only surfaced if it's in the org's project list —
 * the same never-trust-the-model rule the classifier applies on write.
 */

export type InboxItem =
  | {
      kind: "note";
      createdAt: string;
      note: Note;
      suggestedProjectId?: string | null;
      suggestedConfidence?: number | null;
    }
  | {
      kind: "task";
      createdAt: string;
      task: Task;
      suggestedProjectId?: string | null;
      suggestedConfidence?: number | null;
    }
  | {
      kind: "prompt";
      createdAt: string;
      prompt: Prompt;
      // discrepancy: the project the detector suggested moving the item to
      suggestedProjectId?: string | null;
      // question: name of the project whose workflow note the answer feeds
      whyProjectName?: string | null;
    };

export async function listInbox(db: Db, orgId: string): Promise<InboxItem[]> {
  const [notes, tasks, prompts, projects] = await Promise.all([
    listNotes(db, orgId, { inboxOnly: true }),
    listUnfiledTasks(db, orgId),
    listPendingPrompts(db, orgId),
    listProjects(db, orgId),
  ]);
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));

  const discrepancyIds = prompts
    .filter((p) => p.type === "discrepancy")
    .map((p) => p.id);
  const questionPrompts = prompts.filter((p) => p.type === "question");

  const [filing, discSuggestions, whyEntries] = await Promise.all([
    listFilingSuggestions(db, orgId, {
      noteIds: notes.map((n) => n.id),
      taskIds: tasks.map((t) => t.id),
    }),
    listDiscrepancySuggestions(db, orgId, discrepancyIds),
    Promise.all(
      questionPrompts.map(
        async (p) => [p.id, await resolveProjectForPrompt(db, orgId, p)] as const,
      ),
    ),
  ]);
  const whyProjectId = new Map(whyEntries);

  // Drop any suggestion pointing outside the org's current projects.
  const valid = (s: FilingSuggestion | undefined): FilingSuggestion | null =>
    s && projectNames.has(s.projectId) ? s : null;

  const items: InboxItem[] = [
    ...notes.map((note): InboxItem => {
      const s = valid(filing.notes[note.id]);
      return {
        kind: "note",
        createdAt: note.created_at,
        note,
        suggestedProjectId: s?.projectId ?? null,
        suggestedConfidence: s ? s.confidence : null,
      };
    }),
    ...tasks.map((task): InboxItem => {
      const s = valid(filing.tasks[task.id]);
      return {
        kind: "task",
        createdAt: task.created_at,
        task,
        suggestedProjectId: s?.projectId ?? null,
        suggestedConfidence: s ? s.confidence : null,
      };
    }),
    ...prompts.map((prompt): InboxItem => {
      const why = whyProjectId.get(prompt.id);
      return {
        kind: "prompt",
        createdAt: prompt.created_at,
        prompt,
        suggestedProjectId:
          prompt.type === "discrepancy"
            ? (discSuggestions[prompt.id] ?? null)
            : null,
        whyProjectName:
          prompt.type === "question" && why
            ? (projectNames.get(why) ?? null)
            : null,
      };
    }),
  ];

  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
