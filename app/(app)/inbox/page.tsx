import Link from "next/link";
import { listInbox, type InboxItem } from "@/lib/db/inbox";
import { listProjects, type Project } from "@/lib/db/projects";
import { fmtShort } from "@/lib/dates";
import {
  inboxAnswerPromptAction,
  inboxArchiveNoteAction,
  inboxDismissPromptAction,
  inboxFileNoteAction,
} from "./actions";

/**
 * The Inbox (BUILD_SPEC §9): one unified feed from exactly two sources —
 * unfiled notes + pending prompts. Each row says what it is and offers the
 * one action that resolves it.
 */

const PROMPT_LABEL: Record<string, string> = {
  unsorted: "unsorted",
  question: "question",
  discrepancy: "discrepancy",
  nudge: "nudge",
};

function NoteRow({ item, projects }: { item: InboxItem & { kind: "note" }; projects: Project[] }) {
  const note = item.note;
  const preview =
    (note.title ? `${note.title} — ` : "") +
    note.body.replace(/\s+/g, " ").slice(0, 140);

  return (
    <li className="card inbox-row">
      <div className="inbox-row-main">
        <span className="badge">unsorted note</span>
        <Link href={`/notes/${note.id}`} className="inbox-text">
          {preview}
        </Link>
        <span className="meta">{fmtShort(note.created_at.slice(0, 10))}</span>
      </div>
      <div className="inbox-row-actions">
        <form action={inboxFileNoteAction} className="inline-form">
          <input type="hidden" name="id" value={note.id} />
          <select name="project_id" defaultValue="" required>
            <option value="" disabled>
              File to project…
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn">
            File
          </button>
        </form>
        <form action={inboxArchiveNoteAction}>
          <input type="hidden" name="id" value={note.id} />
          <button type="submit" className="btn" title="Archive (leaves the Inbox)">
            Dismiss
          </button>
        </form>
      </div>
    </li>
  );
}

function PromptRow({ item }: { item: InboxItem & { kind: "prompt" } }) {
  const prompt = item.prompt;
  const isQuestion = prompt.type === "question";

  return (
    <li className="card inbox-row">
      <div className="inbox-row-main">
        <span className="badge">{PROMPT_LABEL[prompt.type] ?? prompt.type}</span>
        <span className="inbox-text">{prompt.text}</span>
        <span className="meta">{fmtShort(prompt.created_at.slice(0, 10))}</span>
      </div>
      <div className="inbox-row-actions">
        {isQuestion ? (
          <form action={inboxAnswerPromptAction} className="inline-form">
            <input type="hidden" name="id" value={prompt.id} />
            <input
              type="text"
              name="answer"
              placeholder="Answer…"
              required
            />
            <button type="submit" className="btn">
              Answer
            </button>
          </form>
        ) : null}
        <form action={inboxDismissPromptAction}>
          <input type="hidden" name="id" value={prompt.id} />
          <button type="submit" className="btn">
            Dismiss
          </button>
        </form>
      </div>
    </li>
  );
}

export default async function InboxPage() {
  const [items, projects] = await Promise.all([listInbox(), listProjects()]);

  return (
    <>
      <div className="page-head">
        <h1>Inbox</h1>
        <span className="help">
          Unfiled notes + things the secretary needs from you
        </span>
      </div>

      {items.length === 0 ? (
        <div className="card empty">Inbox zero. Nothing needs filing. ✨</div>
      ) : (
        <ul className="item-list stack">
          {items.map((item) =>
            item.kind === "note" ? (
              <NoteRow key={`n-${item.note.id}`} item={item} projects={projects} />
            ) : (
              <PromptRow key={`p-${item.prompt.id}`} item={item} />
            ),
          )}
        </ul>
      )}
    </>
  );
}
