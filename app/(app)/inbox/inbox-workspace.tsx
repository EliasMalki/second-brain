"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { projectColorVars } from "@/lib/colors";
import { fmtAgoFine } from "@/lib/dates";
import type { InboxItem } from "@/lib/db/inbox";
import { VOICE_FAILED_TAG } from "@/lib/tags";
import {
  inboxAnswerPromptAction,
  inboxArchiveNoteAction,
  inboxBatchFileSuggestedAction,
  inboxDismissPromptAction,
  inboxDismissTaskAction,
  inboxFileNoteAction,
  inboxFileTaskAction,
  inboxReclassifyDiscrepancyAction,
  inboxReopenPromptAction,
  inboxRestoreTaskAction,
  inboxRetryVoiceAction,
  inboxUnarchiveNoteAction,
  inboxUnfileNoteAction,
  inboxUnfileTaskAction,
} from "./actions";
import { batchFileTarget } from "./filing";

/**
 * The Inbox workspace (redesign): one queue, grouped by the KIND of decision
 * each item needs — filing, a look, an answer — so the user decides instead of
 * works. Every card carries the app's opinion as a one-tap action; opening an
 * item is the exception. All actions are optimistic: the card clears instantly,
 * the server call follows, and an undo toast covers the change of heart. Data
 * still comes from the one union in lib/db/inbox.
 */

export type InboxProject = { id: string; name: string; color: string | null };

type NoteItem = Extract<InboxItem, { kind: "note" }>;
type TaskItem = Extract<InboxItem, { kind: "task" }>;
type PromptItem = Extract<InboxItem, { kind: "prompt" }>;

type Toast = { message: string; undo?: () => Promise<void> };

function keyOf(item: InboxItem): string {
  if (item.kind === "note") return `n-${item.note.id}`;
  if (item.kind === "task") return `t-${item.task.id}`;
  return `p-${item.prompt.id}`;
}

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

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

function DismissX({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      className="ibx-x"
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      <i className="ti ti-x" aria-hidden="true" />
    </button>
  );
}

/** A secondary button that is really a native <select> — one tap opens the
 *  platform's own picker (comfortable on phones, keyboardable on desktop). */
function ProjectPickButton({
  label,
  primary,
  projects,
  onPick,
}: {
  label: string;
  primary?: boolean;
  projects: InboxProject[];
  onPick: (projectId: string) => void;
}) {
  return (
    <span className={`ibx-btn ibx-pickwrap ${primary ? "file" : ""}`}>
      {label}
      <i className="ti ti-chevron-down" aria-hidden="true" />
      <select
        className="ibx-pick"
        value=""
        aria-label={label}
        onChange={(e) => {
          if (e.target.value) onPick(e.target.value);
        }}
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
    </span>
  );
}

/** A voice note whose transcription failed: Retry re-transcribes the (still
 *  durable) audio; there's no real text to file yet. */
function VoiceRetryCard({
  item,
  onRetry,
  onDismiss,
}: {
  item: NoteItem;
  onRetry: (noteId: string) => void;
  onDismiss: () => void;
}) {
  const [retrying, startRetry] = useTransition();
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
        <DismissX onClick={onDismiss} title="Discard (archives the placeholder)" />
      </div>
      <div className="ibx-actions">
        <button
          type="button"
          className="ibx-btn file"
          disabled={retrying}
          onClick={() => startRetry(() => onRetry(item.note.id))}
        >
          <i className="ti ti-refresh" aria-hidden="true" />
          {retrying ? "Transcribing…" : "Retry transcription"}
        </button>
      </div>
    </div>
  );
}

function FilingCard({
  item,
  projects,
  projectById,
  onFile,
  onDismiss,
}: {
  item: NoteItem | TaskItem;
  projects: InboxProject[];
  projectById: Map<string, InboxProject>;
  onFile: (projectId: string) => void;
  onDismiss: () => void;
}) {
  const isNote = item.kind === "note";
  const id = isNote ? item.note.id : item.task.id;
  const text = isNote ? notePreview(item.note) : item.task.title;
  const href = isNote ? `/notes/${id}` : `/tasks?task=${id}`;
  const createdAt = isNote ? item.note.created_at : item.task.created_at;
  const suggested = item.suggestedProjectId
    ? (projectById.get(item.suggestedProjectId) ?? null)
    : null;

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
          onClick={onDismiss}
          title={isNote ? "Dismiss (archives the note)" : "Dismiss (cancels the task)"}
        />
      </div>
      <div className="ibx-actions">
        {suggested ? (
          <button
            type="button"
            className="ibx-btn file"
            onClick={() => onFile(suggested.id)}
          >
            <span
              className="ibx-dot"
              style={projectColorVars(suggested.color)}
              aria-hidden="true"
            />
            File under <span className="nm">{suggested.name}</span>
          </button>
        ) : null}
        <ProjectPickButton
          label={suggested ? "Other project" : "File to a project"}
          primary={!suggested}
          projects={projects}
          onPick={onFile}
        />
      </div>
    </div>
  );
}

/**
 * A flagged mismatch, resolved without opening anything: move it to the
 * detector's suggested project (one tap), pick another home, or confirm the
 * filing is right ("It's correct" — the detector never re-flags an item).
 */
function DiscrepancyCard({
  item,
  projects,
  projectById,
  onMove,
  onCorrect,
}: {
  item: PromptItem;
  projects: InboxProject[];
  projectById: Map<string, InboxProject>;
  onMove: (projectId: string) => void;
  onCorrect: () => void;
}) {
  const suggested = item.suggestedProjectId
    ? (projectById.get(item.suggestedProjectId) ?? null)
    : null;

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
        {suggested ? (
          <button
            type="button"
            className="ibx-btn file"
            onClick={() => onMove(suggested.id)}
          >
            <span
              className="ibx-dot"
              style={projectColorVars(suggested.color)}
              aria-hidden="true"
            />
            Move to <span className="nm">{suggested.name}</span>
          </button>
        ) : null}
        <ProjectPickButton
          label={suggested ? "Elsewhere…" : "Move to…"}
          primary={!suggested}
          projects={projects}
          onPick={onMove}
        />
        <button
          type="button"
          className="ibx-btn ok"
          title="The filing is right — won't be flagged again"
          onClick={onCorrect}
        >
          It&apos;s correct
        </button>
      </div>
    </div>
  );
}

function QuestionCard({
  item,
  onDismiss,
}: {
  item: PromptItem;
  onDismiss: () => void;
}) {
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
        <DismissX onClick={onDismiss} title="Not now" />
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

function NudgeCard({
  item,
  onDismiss,
}: {
  item: PromptItem;
  onDismiss: () => void;
}) {
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
        <DismissX onClick={onDismiss} title="Drop this nudge" />
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
  const router = useRouter();
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = useCallback((next: Toast | null) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(next);
    if (next) toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);

  const mark = useCallback((keys: string[], on: boolean) => {
    setRemoved((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }, []);

  /**
   * The optimistic backbone: clear the card(s) instantly, run the server
   * action, refresh, offer undo. On failure the card comes straight back.
   */
  const act = useCallback(
    async (
      keys: string[],
      run: () => Promise<void>,
      toastAfter?: { message: string; undo?: () => Promise<void> },
    ) => {
      mark(keys, true);
      try {
        await run();
      } catch {
        mark(keys, false);
        showToast({ message: "That didn't stick — try again." });
        return;
      }
      router.refresh();
      if (toastAfter) {
        showToast({
          message: toastAfter.message,
          undo: toastAfter.undo
            ? async () => {
                await toastAfter.undo!();
                mark(keys, false);
                router.refresh();
              }
            : undefined,
        });
      }
    },
    [mark, router, showToast],
  );

  const visible = useMemo(
    () => items.filter((i) => !removed.has(keyOf(i))),
    [items, removed],
  );

  const filing = visible.filter(
    (i): i is NoteItem | TaskItem => i.kind === "note" || i.kind === "task",
  );
  const prompts = visible.filter((i): i is PromptItem => i.kind === "prompt");
  const looks = prompts.filter((i) => i.prompt.type === "discrepancy");
  const questions = prompts.filter((i) => i.prompt.type === "question");
  const nudges = prompts.filter(
    (i) => i.prompt.type !== "discrepancy" && i.prompt.type !== "question",
  );

  const batchable = filing.filter((i) => batchFileTarget(i) !== null);

  /* ---- per-card handlers -------------------------------------------------- */

  const fileItem = (item: NoteItem | TaskItem, projectId: string) => {
    const isNote = item.kind === "note";
    const id = isNote ? item.note.id : item.task.id;
    const name = projectById.get(projectId)?.name ?? "project";
    void act(
      [keyOf(item)],
      () =>
        isNote
          ? inboxFileNoteAction(formData({ id, project_id: projectId }))
          : inboxFileTaskAction(formData({ id, project_id: projectId })),
      {
        message: `Filed to ${name}`,
        undo: () =>
          isNote ? inboxUnfileNoteAction(id) : inboxUnfileTaskAction(id),
      },
    );
  };

  const dismissFiling = (item: NoteItem | TaskItem) => {
    const isNote = item.kind === "note";
    const id = isNote ? item.note.id : item.task.id;
    void act(
      [keyOf(item)],
      () =>
        isNote
          ? inboxArchiveNoteAction(formData({ id }))
          : inboxDismissTaskAction(formData({ id })),
      {
        message: isNote ? "Note archived" : "Task dismissed",
        undo: () =>
          isNote ? inboxUnarchiveNoteAction(id) : inboxRestoreTaskAction(id),
      },
    );
  };

  const dismissPrompt = (item: PromptItem, message: string) => {
    const id = item.prompt.id;
    void act(
      [keyOf(item)],
      () => inboxDismissPromptAction(formData({ id })),
      { message, undo: () => inboxReopenPromptAction(id) },
    );
  };

  // Reclassify repoints the flagged item's project server-side (relates_type /
  // relates_id are read from the prompt row, never the client) and resolves
  // the prompt. Deliberate and side-effectful, so no undo — just say what moved.
  const moveDiscrepancy = (item: PromptItem, projectId: string) => {
    const name = projectById.get(projectId)?.name ?? "project";
    void act(
      [keyOf(item)],
      () =>
        inboxReclassifyDiscrepancyAction(
          formData({ id: item.prompt.id, project_id: projectId }),
        ),
      { message: `Moved to ${name}` },
    );
  };

  const retryVoice = (noteId: string) => {
    // No optimistic removal — the card heals in place after the refresh.
    void inboxRetryVoiceAction(formData({ id: noteId })).then(
      () => router.refresh(),
      () => showToast({ message: "Still couldn't transcribe it." }),
    );
  };

  const batchUndo = useRef<{ kind: "note" | "task"; id: string }[]>([]);
  const batchFile = () => {
    const keys = batchable.map(keyOf);
    const n = keys.length;
    void act(
      keys,
      async () => {
        const { filed } = await inboxBatchFileSuggestedAction();
        batchUndo.current = filed;
      },
      {
        message: `Filed ${n} to suggested project${n === 1 ? "" : "s"}`,
        undo: async () => {
          for (const t of batchUndo.current) {
            if (t.kind === "note") await inboxUnfileNoteAction(t.id);
            else await inboxUnfileTaskAction(t.id);
          }
        },
      },
    );
  };

  /* ---- render -------------------------------------------------------------- */

  const total = visible.length;

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
              <GroupHead
                label="Needs filing"
                count={filing.length}
                action={
                  batchable.length > 0 ? (
                    <button type="button" className="ibx-batch" onClick={batchFile}>
                      <i className="ti ti-sparkles" aria-hidden="true" />
                      File all to suggested
                    </button>
                  ) : null
                }
              />
              {filing.map((item) =>
                item.kind === "note" &&
                item.note.tags?.includes(VOICE_FAILED_TAG) ? (
                  <VoiceRetryCard
                    key={keyOf(item)}
                    item={item}
                    onRetry={retryVoice}
                    onDismiss={() => dismissFiling(item)}
                  />
                ) : (
                  <FilingCard
                    key={keyOf(item)}
                    item={item}
                    projects={projects}
                    projectById={projectById}
                    onFile={(projectId) => fileItem(item, projectId)}
                    onDismiss={() => dismissFiling(item)}
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
                  key={keyOf(item)}
                  item={item}
                  projects={projects}
                  projectById={projectById}
                  onMove={(projectId) => moveDiscrepancy(item, projectId)}
                  onCorrect={() => dismissPrompt(item, "Left as filed")}
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
                <QuestionCard
                  key={keyOf(item)}
                  item={item}
                  onDismiss={() => dismissPrompt(item, "Question set aside")}
                />
              ))}
            </section>
          ) : null}

          {nudges.length > 0 ? (
            <section>
              <GroupHead label="Gentle nudges" count={nudges.length} />
              {nudges.map((item) => (
                <NudgeCard
                  key={keyOf(item)}
                  item={item}
                  onDismiss={() => dismissPrompt(item, "Nudge dropped")}
                />
              ))}
            </section>
          ) : null}
        </>
      )}

      {toast ? (
        <div className="ibx-toast" role="status" aria-live="polite">
          <span>{toast.message}</span>
          {toast.undo ? (
            <button
              type="button"
              onClick={() => {
                const undo = toast.undo!;
                showToast(null);
                void undo();
              }}
            >
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
