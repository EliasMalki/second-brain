import Link from "next/link";
import { listInbox, type InboxItem } from "@/lib/db/inbox";
import { listProjects, type Project } from "@/lib/db/projects";
import { VOICE_FAILED_TAG } from "@/lib/db/captures";
import {
  inboxAnswerPromptAction,
  inboxArchiveNoteAction,
  inboxDismissPromptAction,
  inboxFileNoteAction,
  inboxFileTaskAction,
  inboxReclassifyDiscrepancyAction,
  inboxRetryVoiceAction,
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

  // A voice note whose transcription failed: show its own Retry action instead
  // of the file-to-project controls (there's no real text to file yet). The
  // audio is safe in storage — Retry re-transcribes it.
  if (note.tags?.includes(VOICE_FAILED_TAG)) {
    return (
      <li className="feed-item">
        <span className="feed-ic warning">
          <i className="ti ti-microphone-off" aria-hidden="true" />
        </span>
        <div className="feed-body">
          <p className="feed-type">Voice note — transcription failed</p>
          <p className="feed-text">The recording is saved. Retry to transcribe it.</p>
        </div>
        <div className="feed-act">
          <form action={inboxRetryVoiceAction}>
            <input type="hidden" name="id" value={note.id} />
            <button type="submit" className="btn-pill go">
              Retry
            </button>
          </form>
          <form action={inboxArchiveNoteAction}>
            <input type="hidden" name="id" value={note.id} />
            <button type="submit" className="btn-pill" title="Archive (leaves the Inbox)">
              Discard
            </button>
          </form>
        </div>
      </li>
    );
  }

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

function PromptRow({
  item,
  projects,
}: {
  item: InboxItem & { kind: "prompt" };
  projects: Project[];
}) {
  const prompt = item.prompt;
  const meta = PROMPT_META[prompt.type] ?? PROMPT_META.nudge;
  const isQuestion = prompt.type === "question";
  const isDiscrepancy = prompt.type === "discrepancy";

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
        {isDiscrepancy ? (
          <>
            {/* Reclassify defaults to the detector's suggested project; the
                item never moves on its own — only this explicit choice moves it. */}
            <form
              action={inboxReclassifyDiscrepancyAction}
              className="inline-form"
            >
              <input type="hidden" name="id" value={prompt.id} />
              <select
                name="project_id"
                className="select select-sm"
                defaultValue={item.suggestedProjectId ?? ""}
                required
              >
                <option value="" disabled>
                  Move to…
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-pill go">
                Move
              </button>
            </form>
            <form action={inboxDismissPromptAction}>
              <input type="hidden" name="id" value={prompt.id} />
              <button
                type="submit"
                className="btn-pill"
                title="Dismiss — the filing is correct"
              >
                It&apos;s correct
              </button>
            </form>
          </>
        ) : isQuestion ? (
          <>
            <form action={inboxAnswerPromptAction} className="inline-form">
              <input type="hidden" name="id" value={prompt.id} />
              <input type="text" name="answer" placeholder="Answer…" required />
              <button type="submit" className="btn-pill go">
                Answer
              </button>
            </form>
            <form action={inboxDismissPromptAction}>
              <input type="hidden" name="id" value={prompt.id} />
              <button type="submit" className="btn-pill">
                Later
              </button>
            </form>
          </>
        ) : (
          <form action={inboxDismissPromptAction}>
            <input type="hidden" name="id" value={prompt.id} />
            <button type="submit" className="btn-pill">
              Drop
            </button>
          </form>
        )}
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
              <PromptRow
                key={`p-${item.prompt.id}`}
                item={item}
                projects={projects}
              />
            ),
          )}
        </ul>
      )}
    </>
  );
}
