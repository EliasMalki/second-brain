"use client";

import Link from "next/link";
import { projectColorVars } from "@/lib/colors";
import { fmtAgoFine } from "@/lib/dates";
import type { InboxItem } from "@/lib/db/inbox";
import { VOICE_FAILED_TAG } from "@/lib/tags";
import {
  inboxAnswerPromptAction,
  inboxArchiveNoteAction,
  inboxDismissPromptAction,
  inboxDismissTaskAction,
  inboxFileNoteAction,
  inboxFileTaskAction,
  inboxReclassifyDiscrepancyAction,
  inboxRetryVoiceAction,
} from "./actions";

/**
 * The Inbox workspace (redesign): one queue, grouped by the KIND of decision
 * each item needs — filing, a look, an answer — so the user decides instead of
 * works. Every card carries the app's opinion as a one-tap action; opening an
 * item is the exception. Data still comes from the one union in lib/db/inbox.
 */

export type InboxProject = { id: string; name: string; color: string | null };

type NoteItem = Extract<InboxItem, { kind: "note" }>;
type TaskItem = Extract<InboxItem, { kind: "task" }>;
type PromptItem = Extract<InboxItem, { kind: "prompt" }>;

function notePreview(note: NoteItem["note"]): string {
  return (
    (note.title ? `${note.title} — ` : "") +
    note.body.replace(/\s+/g, " ").slice(0, 160)
  );
}

/** "note · captured 2h ago" — client-rendered relative time, so suppress the
 *  (harmless, minute-level) SSR/hydration difference. */
function Meta({ label, at }: { label: string; at?: string }) {
  return (
    <p className="ibx-meta" suppressHydrationWarning>
      {label}
      {at ? <> &middot; captured {fmtAgoFine(at)}</> : null}
    </p>
  );
}

function DismissX({
  action,
  id,
  title,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  title: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="ibx-x" title={title} aria-label={title}>
        <i className="ti ti-x" aria-hidden="true" />
      </button>
    </form>
  );
}

/** A voice note whose transcription failed: Retry re-transcribes the (still
 *  durable) audio; there's no real text to file yet. */
function VoiceRetryCard({ item }: { item: NoteItem }) {
  return (
    <div className="ibx-card">
      <div className="ibx-row">
        <span className="ibx-ic voice">
          <i className="ti ti-microphone-off" aria-hidden="true" />
        </span>
        <div className="ibx-body">
          <p className="ibx-txt">Voice note — transcription failed</p>
          <Meta label="the recording is saved" at={item.note.created_at} />
        </div>
        <DismissX
          action={inboxArchiveNoteAction}
          id={item.note.id}
          title="Discard (archives the placeholder)"
        />
      </div>
      <div className="ibx-actions">
        <form action={inboxRetryVoiceAction}>
          <input type="hidden" name="id" value={item.note.id} />
          <button type="submit" className="ibx-btn file">
            <i className="ti ti-refresh" aria-hidden="true" />
            Retry transcription
          </button>
        </form>
      </div>
    </div>
  );
}

function FilingCard({
  item,
  projects,
}: {
  item: NoteItem | TaskItem;
  projects: InboxProject[];
}) {
  const isNote = item.kind === "note";
  const id = isNote ? item.note.id : item.task.id;
  const text = isNote ? notePreview(item.note) : item.task.title;
  const href = isNote ? `/notes/${id}` : `/tasks?task=${id}`;
  const createdAt = isNote ? item.note.created_at : item.task.created_at;
  const fileAction = isNote ? inboxFileNoteAction : inboxFileTaskAction;

  return (
    <div className="ibx-card">
      <div className="ibx-row">
        <span className={`ibx-ic ${isNote ? "note" : "task"}`}>
          <i
            className={`ti ${isNote ? "ti-file-text" : "ti-check"}`}
            aria-hidden="true"
          />
        </span>
        <div className="ibx-body">
          <p className="ibx-txt">
            <Link href={href}>{text}</Link>
          </p>
          <Meta label={isNote ? "note" : "task"} at={createdAt} />
        </div>
        <DismissX
          action={isNote ? inboxArchiveNoteAction : inboxDismissTaskAction}
          id={id}
          title={isNote ? "Dismiss (archives the note)" : "Dismiss (cancels the task)"}
        />
      </div>
      <div className="ibx-actions">
        <form action={fileAction} className="ibx-inline">
          <input type="hidden" name="id" value={id} />
          <select name="project_id" className="select select-sm" defaultValue="" required>
            <option value="" disabled>
              File to…
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="submit" className="ibx-btn file">
            File
          </button>
        </form>
      </div>
    </div>
  );
}

function DiscrepancyCard({
  item,
  projects,
}: {
  item: PromptItem;
  projects: InboxProject[];
}) {
  return (
    <div className="ibx-card">
      <div className="ibx-row">
        <span className="ibx-ic disc">
          <i className="ti ti-alert-triangle" aria-hidden="true" />
        </span>
        <div className="ibx-body">
          <p className="ibx-txt">{item.prompt.text}</p>
          <Meta label="possible mismatch" />
        </div>
      </div>
      <div className="ibx-actions">
        <form action={inboxReclassifyDiscrepancyAction} className="ibx-inline">
          <input type="hidden" name="id" value={item.prompt.id} />
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
          <button type="submit" className="ibx-btn file">
            Move
          </button>
        </form>
        <form action={inboxDismissPromptAction}>
          <input type="hidden" name="id" value={item.prompt.id} />
          <button
            type="submit"
            className="ibx-btn"
            title="Dismiss — the filing is correct"
          >
            It&apos;s correct
          </button>
        </form>
      </div>
    </div>
  );
}

function QuestionCard({ item }: { item: PromptItem }) {
  return (
    <div className="ibx-card">
      <div className="ibx-row">
        <span className="ibx-ic q">
          <i className="ti ti-help" aria-hidden="true" />
        </span>
        <div className="ibx-body">
          <p className="ibx-txt">{item.prompt.text}</p>
          <Meta
            label={
              item.whyProjectName
                ? `debrief · adds to your ${item.whyProjectName} workflow`
                : "debrief"
            }
          />
        </div>
        <DismissX
          action={inboxDismissPromptAction}
          id={item.prompt.id}
          title="Not now"
        />
      </div>
      <form action={inboxAnswerPromptAction} className="ibx-answer-form">
        <input type="hidden" name="id" value={item.prompt.id} />
        <input
          type="text"
          name="answer"
          className="ibx-answer"
          placeholder="Type a quick answer…"
          required
        />
        <button type="submit" className="ibx-btn file">
          Answer
        </button>
      </form>
    </div>
  );
}

function NudgeCard({ item }: { item: PromptItem }) {
  return (
    <div className="ibx-card">
      <div className="ibx-row">
        <span className="ibx-ic note">
          <i className="ti ti-clock-exclamation" aria-hidden="true" />
        </span>
        <div className="ibx-body">
          <p className="ibx-txt">{item.prompt.text}</p>
          <Meta label="nudge" at={item.prompt.created_at} />
        </div>
        <DismissX
          action={inboxDismissPromptAction}
          id={item.prompt.id}
          title="Drop this nudge"
        />
      </div>
    </div>
  );
}

function GroupHead({
  label,
  count,
  action,
}: {
  label: string;
  count: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="ibx-grp">
      {label} <span className="ct">{count}</span>
      {action}
    </div>
  );
}

export function InboxWorkspace({
  items,
  projects,
}: {
  items: InboxItem[];
  projects: InboxProject[];
}) {
  const filing = items.filter(
    (i): i is NoteItem | TaskItem => i.kind === "note" || i.kind === "task",
  );
  const prompts = items.filter((i): i is PromptItem => i.kind === "prompt");
  const looks = prompts.filter((i) => i.prompt.type === "discrepancy");
  const questions = prompts.filter((i) => i.prompt.type === "question");
  const nudges = prompts.filter(
    (i) => i.prompt.type !== "discrepancy" && i.prompt.type !== "question",
  );

  const total = items.length;

  return (
    <div className="inbox2">
      <div className="view-head">
        <span className="view-title">Inbox</span>
        {total > 0 ? <span className="tag">{total} to clear</span> : null}
      </div>

      {total === 0 ? (
        <div className="ibx-empty">
          <span className="big">
            <i className="ti ti-check" aria-hidden="true" />
          </span>
          <div className="ibx-empty-title">All caught up</div>
          <div className="ibx-empty-sub">Nothing to sort. Nice work.</div>
        </div>
      ) : (
        <>
          <p className="ibx-sub">Quick decisions. File it, answer it, or dismiss it.</p>

          {filing.length > 0 ? (
            <section>
              <GroupHead label="Needs filing" count={filing.length} />
              {filing.map((item) =>
                item.kind === "note" &&
                item.note.tags?.includes(VOICE_FAILED_TAG) ? (
                  <VoiceRetryCard key={`n-${item.note.id}`} item={item} />
                ) : (
                  <FilingCard
                    key={
                      item.kind === "note"
                        ? `n-${item.note.id}`
                        : `t-${item.task.id}`
                    }
                    item={item}
                    projects={projects}
                  />
                ),
              )}
            </section>
          ) : null}

          {looks.length > 0 ? (
            <section>
              <GroupHead label="Worth a look" count={looks.length} />
              {looks.map((item) => (
                <DiscrepancyCard
                  key={`p-${item.prompt.id}`}
                  item={item}
                  projects={projects}
                />
              ))}
            </section>
          ) : null}

          {questions.length > 0 ? (
            <section>
              <GroupHead
                label={questions.length === 1 ? "A question" : "A couple of questions"}
                count={questions.length}
              />
              {questions.map((item) => (
                <QuestionCard key={`p-${item.prompt.id}`} item={item} />
              ))}
            </section>
          ) : null}

          {nudges.length > 0 ? (
            <section>
              <GroupHead label="Gentle nudges" count={nudges.length} />
              {nudges.map((item) => (
                <NudgeCard key={`p-${item.prompt.id}`} item={item} />
              ))}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
