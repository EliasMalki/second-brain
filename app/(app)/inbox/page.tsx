import Link from "next/link";
import { listInbox, type InboxItem } from "@/lib/db/inbox";
import { listProjects, type Project } from "@/lib/db/projects";
import {
  inboxAnswerPromptAction,
  inboxArchiveNoteAction,
  inboxDismissPromptAction,
  inboxFileNoteAction,
  inboxFileTaskAction,
} from "./actions";
import { EmptyState } from "../empty-state";

/**
 * The Inbox (BUILD_SPEC §9): one unified feed from exactly two sources —
 * unfiled notes + pending prompts. Each row says what it is and offers the
 * one action that resolves it. (Discrepancy/debrief prompt *types* are styled
 * here for when the engine ships in a later version; v0.5 only emits nudges.)
 */

const PROMPT_META: Record<
  string,
  { icon: string; tone: "neutral" | "info" | "warning"; label: string }
> = {
  unsorted: { icon: "ti-bulb", tone: "neutral", label: "Unsorted" },
  question: { icon: "ti-message-2", tone: "info", label: "Question" },
  discrepancy: { icon: "ti-alert-triangle", tone: "warning", label: "Looks off" },
  nudge: { icon: "ti-clock-exclamation", tone: "neutral", label: "Nudge" },
};

function NoteRow({
  item,
  projects,
}: {
  item: InboxItem & { kind: "note" };
  projects: Project[];
}) {
  const note = item.note;
  const preview =
    (note.title ? `${note.title} — ` : "") +
    note.body.replace(/\s+/g, " ").slice(0, 160);

  return (
    <li className="feed-item">
      <span className="feed-ic neutral">
        <i className="ti ti-bulb" aria-hidden="true" />
      </span>
      <div className="feed-body">
        <p className="feed-type">Unsorted note</p>
        <p className="feed-text">
          <Link href={`/notes/${note.id}`}>{preview}</Link>
        </p>
      </div>
      <div className="feed-act">
        <form action={inboxFileNoteAction} className="inline-form">
          <input type="hidden" name="id" value={note.id} />
          <select
            name="project_id"
            className="select select-sm"
            defaultValue=""
            required
          >
            <option value="" disabled>
              File to…
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-pill go">
            File
          </button>
        </form>
        <form action={inboxArchiveNoteAction}>
          <input type="hidden" name="id" value={note.id} />
          <button type="submit" className="btn-pill" title="Archive (leaves the Inbox)">
            Keep
          </button>
        </form>
      </div>
    </li>
  );
}

function TaskRow({
  item,
  projects,
}: {
  item: InboxItem & { kind: "task" };
  projects: Project[];
}) {
  const task = item.task;

  return (
    <li className="feed-item">
      <span className="feed-ic neutral">
        <i className="ti ti-checkbox" aria-hidden="true" />
      </span>
      <div className="feed-body">
        <p className="feed-type">Unfiled task</p>
        <p className="feed-text">
          <Link href={`/tasks?task=${task.id}`}>{task.title}</Link>
        </p>
      </div>
      <div className="feed-act">
        <form action={inboxFileTaskAction} className="inline-form">
          <input type="hidden" name="id" value={task.id} />
          <select
            name="project_id"
            className="select select-sm"
            defaultValue=""
            required
          >
            <option value="" disabled>
              File to…
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-pill go">
            File
          </button>
        </form>
      </div>
    </li>
  );
}

function PromptRow({ item }: { item: InboxItem & { kind: "prompt" } }) {
  const prompt = item.prompt;
  const meta = PROMPT_META[prompt.type] ?? PROMPT_META.nudge;
  const isQuestion = prompt.type === "question";

  return (
    <li className="feed-item">
      <span className={`feed-ic ${meta.tone}`}>
        <i className={`ti ${meta.icon}`} aria-hidden="true" />
      </span>
      <div className="feed-body">
        <p className="feed-type">{meta.label}</p>
        <p className="feed-text">{prompt.text}</p>
      </div>
      <div className="feed-act">
        {isQuestion ? (
          <form action={inboxAnswerPromptAction} className="inline-form">
            <input type="hidden" name="id" value={prompt.id} />
            <input type="text" name="answer" placeholder="Answer…" required />
            <button type="submit" className="btn-pill go">
              Answer
            </button>
          </form>
        ) : null}
        <form action={inboxDismissPromptAction}>
          <input type="hidden" name="id" value={prompt.id} />
          <button type="submit" className="btn-pill">
            {isQuestion ? "Later" : "Drop"}
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
      <div className="view-head">
        <span className="view-title">Inbox</span>
        {items.length > 0 ? (
          <span className="tag">{items.length} to clear</span>
        ) : null}
      </div>

      {items.length === 0 ? (
        <EmptyState icon="ti-confetti" title="You're all caught up." />
      ) : (
        <ul className="feed">
          {items.map((item) =>
            item.kind === "note" ? (
              <NoteRow key={`n-${item.note.id}`} item={item} projects={projects} />
            ) : item.kind === "task" ? (
              <TaskRow key={`t-${item.task.id}`} item={item} projects={projects} />
            ) : (
              <PromptRow key={`p-${item.prompt.id}`} item={item} />
            ),
          )}
        </ul>
      )}
    </>
  );
}
