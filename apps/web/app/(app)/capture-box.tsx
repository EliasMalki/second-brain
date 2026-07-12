"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { enqueueCapture, flushQueue } from "@/lib/offline/queue";
import { getCaptureOutcome, refileCaptureItem } from "./capture-box-actions";
import { useVoiceRecorder, type Recording } from "./use-voice-recorder";
import type { InterpreterResult } from "@/lib/commands/types";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "captured" }
  | { kind: "queued" }
  | { kind: "error"; message: string };

type Toast = {
  tone: "ok" | "warn" | "err" | "info";
  icon: string;
  text: string;
  /** show a "View" link to the Inbox (a fresh capture landed there). */
  view?: boolean;
  /** show an "Undo" affordance (a command was applied). */
  undoToken?: string;
};

/** The interactive surface for a confirmation or a read result. */
type Panel =
  | {
      kind: "confirm";
      message: string;
      mode: "yesno" | "choose";
      choices: { index: number; label: string }[];
      token: string;
    }
  | { kind: "read"; message: string };

/**
 * "Where it landed" surface: shown after a single capture once the async
 * classifier settles, with a picker to re-file the item to the right project
 * (or back to Inbox) in one tap.
 */
type Resort = {
  kind: "task" | "note";
  itemId: string;
  projectId: string | null;
  projectName: string | null;
  projects: { id: string; name: string }[];
};

/**
 * Editable multi-item split: each proposed task with a project picker, fixed in
 * place before Create. The raw line is already a note in the Inbox, so cancelling
 * or abandoning loses nothing.
 */
type Split = {
  message: string;
  token: string;
  projects: { id: string; name: string }[];
  items: { title: string; projectId: string | null; scheduledFor: string | null }[];
};

// Safety cap so a pocket-dial recording can't grow unbounded (and stays well
// under OpenAI's 25 MB upload limit).
const MAX_REC_MS = 5 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Poll cadence for the classifier outcome (~10s total before giving up).
const RESORT_POLL_MS = 1200;
const RESORT_POLL_TRIES = 8;

function fmtTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Quick capture, offline-first (BUILD_SPEC §4 + §6), now with the command
 * interpreter (v1). When online, a typed line goes to /api/interpret, which may
 * file a capture, act on a task (with undo), ask a confirmation, or answer a
 * read — rendered here as a toast, a panel, or buttons. When offline (or that
 * call fails), it falls back to the durable IndexedDB capture queue, so a
 * thought is never lost and commands simply require connectivity.
 *
 * Voice capture is transcribe-first: the recording is transcribed to the
 * composer for review, then sent through this same interpreter path as typed
 * text — so a voice note can become a task, note, or command, not just an
 * Inbox note.
 *
 * Rendered once in the app layout as a chat-style composer docked under the
 * content pane. Enter sends, Shift+Enter adds a line.
 */
export function CaptureBox({ variant }: { variant?: "hero" } = {}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [pending, setPending] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [panelBusy, setPanelBusy] = useState(false);
  const [resort, setResort] = useState<Resort | null>(null);
  const [split, setSplit] = useState<Split | null>(null);
  const [splitBusy, setSplitBusy] = useState(false);
  // The capture currently being polled; a newer capture supersedes an older poll.
  const activeCapture = useRef<string | null>(null);
  const [hasText, setHasText] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  // Holds a recording whose upload failed, so it can be retried from memory
  // (voice needs the network — there's no IndexedDB queue for audio in v1).
  const [failedUpload, setFailedUpload] = useState<Recording | null>(null);
  const [online, setOnline] = useState(true);
  const recorder = useVoiceRecorder();

  // Track connectivity so the mic can be disabled offline (voice can't be
  // transcribed without a connection). Updated post-mount → no hydration drift.
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Toasts auto-dismiss; one carrying an Undo affordance lingers longer so it's
  // tappable. A new toast resets the timer.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undoToken ? 10000 : 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Surface recorder errors (permission denied, unsupported) as a toast rather
  // than failing silently.
  useEffect(() => {
    if (recorder.state === "error" && recorder.error) {
      setToast({
        tone: "err",
        icon:
          recorder.error.kind === "denied"
            ? "ti-microphone-off"
            : "ti-alert-triangle",
        text: recorder.error.message,
      });
    }
  }, [recorder.state, recorder.error]);

  const flush = useCallback(async () => {
    try {
      const remaining = await flushQueue();
      setPending(remaining);
      if (remaining === 0) router.refresh();
    } catch {
      // stays queued; next reconnect retries
    }
  }, [router]);

  // Retry on reconnect + deliver anything left over from a previous visit.
  useEffect(() => {
    void flush();
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flush]);

  // POST to the interpreter and return the result. Throws on a network/server
  // failure so the caller can fall back to the durable capture path.
  const sendInterpret = useCallback(
    async (
      body:
        | { text: string }
        | { undo: string }
        | {
            splitCreate: {
              token: string;
              items: { title: string; projectId: string | null; scheduledFor: string | null }[];
            };
          },
    ): Promise<InterpreterResult> => {
      const res = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { result: InterpreterResult };
      return data.result;
    },
    [],
  );

  // After a single capture, wait for the async classifier to route it, then show
  // a "Filed to X" panel with a re-sort picker. A newer capture supersedes this
  // poll (activeCapture guards every write).
  const startResortPoll = useCallback(async (captureId: string, noteId?: string) => {
    activeCapture.current = captureId;
    for (let i = 0; i < RESORT_POLL_TRIES; i++) {
      await sleep(RESORT_POLL_MS);
      if (activeCapture.current !== captureId) return;
      let out;
      try {
        out = await getCaptureOutcome(captureId);
      } catch {
        continue;
      }
      if (activeCapture.current !== captureId) return;
      if (out.settled) {
        if (out.kind && out.itemId) {
          setToast(null);
          setResort({
            kind: out.kind,
            itemId: out.itemId,
            projectId: out.projectId,
            projectName: out.projectName,
            projects: out.projects,
          });
        }
        return;
      }
    }
    // Timed out (classifier slow/down): still offer to file the unsorted note.
    if (activeCapture.current === captureId && noteId) {
      try {
        const out = await getCaptureOutcome(captureId);
        if (activeCapture.current !== captureId) return;
        if (out.settled && out.kind && out.itemId) {
          setToast(null);
          setResort({
            kind: out.kind,
            itemId: out.itemId,
            projectId: out.projectId,
            projectName: out.projectName,
            projects: out.projects,
          });
        } else {
          setResort({ kind: "note", itemId: noteId, projectId: null, projectName: null, projects: out.projects });
        }
      } catch {
        // leave it; the capture is safe in the Inbox regardless
      }
    }
  }, []);

  // Render an InterpreterResult: toasts for terminal outcomes, a panel for
  // confirmations and reads. Refresh the views when data changed.
  const applyResult = useCallback(
    (result: InterpreterResult) => {
      setStatus({ kind: "idle" });
      // Reset any prior re-sort poll/panel; the captured branch starts a fresh one.
      setResort(null);
      activeCapture.current = null;
      if (result.kind === "confirm") {
        setToast(null);
        setSplit(null);
        setPanel({
          kind: "confirm",
          message: result.message,
          mode: result.mode,
          choices: result.choices,
          token: result.pendingToken,
        });
        return;
      }
      if (result.kind === "read") {
        setToast(null);
        setSplit(null);
        setPanel({ kind: "read", message: result.message });
        return;
      }
      if (result.kind === "split") {
        setToast(null);
        setPanel(null);
        setSplit({
          message: result.message,
          token: result.pendingToken,
          projects: result.projects,
          items: result.items.map((it) => ({
            title: it.title,
            projectId: it.projectId,
            scheduledFor: it.scheduledFor,
          })),
        });
        return;
      }

      setPanel(null);
      setSplit(null);
      if (result.kind === "captured") {
        setStatus({ kind: "captured" });
        setToast({ tone: "ok", icon: "ti-check", text: result.message, view: true });
        router.refresh();
        if (result.captureId) void startResortPoll(result.captureId, result.noteId);
      } else if (result.kind === "acted") {
        setStatus({ kind: "idle" });
        setToast({ tone: "ok", icon: "ti-check", text: result.message, undoToken: result.undoToken });
        router.refresh();
      } else if (result.kind === "undone") {
        setStatus({ kind: "idle" });
        setToast({ tone: "ok", icon: "ti-arrow-back-up", text: result.message });
        router.refresh();
      } else {
        setStatus({ kind: "idle" });
        setToast({ tone: "info", icon: "ti-info-circle", text: result.message });
      }
    },
    [router, startResortPoll],
  );

  // Re-file the just-captured item to a project (or back to Inbox). The user's
  // pick wins over the classifier; the panel label updates in place.
  async function onResortPick(projectId: string) {
    if (!resort) return;
    const res = await refileCaptureItem({
      kind: resort.kind,
      id: resort.itemId,
      projectId: projectId || null,
    });
    if (res.ok) {
      setResort({ ...resort, projectId: projectId || null, projectName: res.projectName });
      router.refresh();
    }
  }

  // --- multi-item split: edit each item's project, then create ---
  function onSplitPick(index: number, projectId: string) {
    setSplit((cur) =>
      cur
        ? {
            ...cur,
            items: cur.items.map((it, i) =>
              i === index ? { ...it, projectId: projectId || null } : it,
            ),
          }
        : cur,
    );
  }

  async function onSplitCreate() {
    if (!split) return;
    setSplitBusy(true);
    try {
      applyResult(await sendInterpret({ splitCreate: { token: split.token, items: split.items } }));
    } catch {
      setToast({ tone: "err", icon: "ti-alert-triangle", text: "Couldn't create — try again." });
    } finally {
      setSplitBusy(false);
    }
  }

  async function onSplitCancel() {
    if (!split) return;
    setSplitBusy(true);
    try {
      // "no" cancels the pending server-side; the raw line stays as one Inbox note.
      applyResult(await sendInterpret({ text: "no" }));
    } catch {
      setSplit(null);
    } finally {
      setSplitBusy(false);
    }
  }

  // Durable fallback: land the thought in IndexedDB, then deliver (online) or
  // hold for reconnect (offline). This is the offline/never-lose path; commands
  // only run on the live interpreter path above.
  const offlineCapture = useCallback(
    async (text: string) => {
      setStatus({ kind: "sending" });
      let queuedOk = true;
      try {
        await enqueueCapture(text);
      } catch {
        queuedOk = false; // no IndexedDB — fall back to a direct POST below
      }

      if (queuedOk) {
        const remaining = await flushQueue().catch(() => 1);
        setPending(remaining);
        if (remaining === 0) {
          setStatus({ kind: "captured" });
          setToast({ tone: "ok", icon: "ti-check", text: "Captured — it's in your Inbox", view: true });
          router.refresh();
        } else {
          setStatus({ kind: "queued" });
          setToast({
            tone: "warn",
            icon: "ti-wifi-off",
            // it's durably queued either way; only claim "offline" when we are
            text: navigator.onLine
              ? "Saved — couldn't file just now, will retry"
              : "Saved offline — will file when you're back online",
          });
        }
        return;
      }

      try {
        const res = await fetch("/api/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setStatus({ kind: "captured" });
        setToast({ tone: "ok", icon: "ti-check", text: "Captured — it's in your Inbox", view: true });
        router.refresh();
      } catch {
        // Total failure: no IndexedDB AND the POST failed. Put the words back in
        // the box so the capture is never silently lost (the invariant).
        if (textRef.current) {
          textRef.current.value = text;
          setHasText(true);
        }
        setStatus({ kind: "error", message: "Couldn't save" });
        setToast({
          tone: "err",
          icon: "ti-alert-triangle",
          text: "Couldn't save — your text is still here, retry",
        });
      }
    },
    [router],
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = textRef.current?.value.trim() ?? "";
    if (!text) return;

    // A fresh line supersedes any open confirmation/read/split and re-sort poll.
    setPanel(null);
    setResort(null);
    setSplit(null);
    activeCapture.current = null;
    formRef.current?.reset();
    setHasText(false);
    textRef.current?.focus();

    // Online → the interactive interpreter. On any network/server failure, fall
    // through to the durable capture queue so the thought is never lost.
    if (navigator.onLine) {
      setStatus({ kind: "sending" });
      try {
        const result = await sendInterpret({ text });
        applyResult(result);
        // Never lose the words: a non-actionable result (deflected read,
        // unmatched command, missing slot) puts the text back so the user can
        // edit/resend instead of retyping.
        if (result.kind === "info" && textRef.current) {
          textRef.current.value = text;
          setHasText(true);
        }
        return;
      } catch {
        // fall through to offline capture
      }
    }
    await offlineCapture(text);
  }

  // Answer a pending confirmation (tappable buttons). The reply rides the same
  // interpreter path a typed "yes"/"1" would, so it's channel-agnostic.
  const answer = useCallback(
    async (reply: string) => {
      setPanelBusy(true);
      try {
        applyResult(await sendInterpret({ text: reply }));
      } catch {
        setToast({ tone: "err", icon: "ti-alert-triangle", text: "Couldn't reach the server — try again." });
      } finally {
        setPanelBusy(false);
      }
    },
    [applyResult, sendInterpret],
  );

  const undo = useCallback(
    async (token: string) => {
      setToast(null);
      try {
        applyResult(await sendInterpret({ undo: token }));
      } catch {
        setToast({ tone: "err", icon: "ti-alert-triangle", text: "Couldn't undo — try again." });
      }
    },
    [applyResult, sendInterpret],
  );

  // Auto-grow the textarea with content (capped by CSS max-height).
  function autoGrow() {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    setHasText(el.value.trim().length > 0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  // --- voice ---------------------------------------------------------------

  // Upload the finished recording to be transcribed (transcribe-first): the
  // server returns the text and the transcript lands in the composer for the
  // user to review/edit, then send through the normal path — it is NOT
  // auto-filed. Only a failed transcription is persisted server-side (durable
  // audio + a retry-able Inbox note), so a voice note is never lost.
  //
  // If the POST never reaches the server, the recording is kept in failedUpload
  // so it can be retried from memory — it is not lost the instant the network
  // hiccups.
  const uploadRecording = useCallback(
    async (rec: Recording) => {
      setVoiceBusy(true);
      setToast(null);
      const ext = rec.mimeType.split(";")[0]?.split("/")[1]?.trim() || "webm";
      const fd = new FormData();
      fd.append("audio", rec.blob, `audio.${ext}`);
      fd.append("mimeType", rec.mimeType);
      try {
        const res = await fetch("/api/capture/voice", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          captureId: string | null;
          transcript: string | null;
          transcriptionFailed: boolean;
        };
        setFailedUpload(null); // reached the server

        if (data.transcriptionFailed || !data.transcript) {
          // The recording was saved server-side as a retry-able Inbox note
          // (never lost) — point the user there.
          setToast({
            tone: "warn",
            icon: "ti-microphone",
            text: "Couldn't transcribe — saved to your Inbox, retry it there.",
          });
          router.refresh();
          return;
        }

        // Success: drop the transcript into the composer for review/edit.
        // Appended if there's already text so nothing typed is clobbered.
        // Sending it rides the same interpreter path as typing — nothing is
        // filed yet.
        const el = textRef.current;
        if (el) {
          const existing = el.value.trim();
          el.value = existing ? `${existing} ${data.transcript}` : data.transcript;
          el.style.height = "auto";
          el.style.height = `${el.scrollHeight}px`;
          setHasText(true);
          el.focus();
        }
        setToast({
          tone: "ok",
          icon: "ti-microphone",
          text: "Transcribed — review and send",
        });
      } catch {
        // The recording never reached the server — keep it for retry.
        setFailedUpload(rec);
        setToast({
          tone: "err",
          icon: "ti-alert-triangle",
          text: "Couldn't send your voice note — tap Retry.",
        });
      } finally {
        setVoiceBusy(false);
      }
    },
    [router],
  );

  const stopRecording = useCallback(async () => {
    const rec = await recorder.stop();
    if (rec && rec.blob.size > 0) void uploadRecording(rec);
  }, [recorder, uploadRecording]);

  // Auto-stop at the safety cap.
  useEffect(() => {
    if (recorder.state === "recording" && recorder.elapsedMs >= MAX_REC_MS) {
      void stopRecording();
    }
  }, [recorder.state, recorder.elapsedMs, stopRecording]);

  const isRecording = recorder.state === "recording";
  const micTitle = !recorder.isSupported
    ? "Voice recording isn’t supported here"
    : !online
      ? "Voice notes need a connection"
      : "Record a voice note";

  // Shared surfaces (toast / confirm / split / resort / status / retry) render
  // identically in both shells; only the composer form + framing differ.
  const extras = (
    <>
      {toast ? (
        <div className={`capture-toast ${toast.tone}`} role="status">
          <i className={`ti ${toast.icon}`} aria-hidden="true" />
          <span className="capture-toast-text">
            {toast.text}
            {toast.view ? (
              <>
                {" "}
                <Link href="/inbox">View</Link>
              </>
            ) : null}
            {toast.undoToken ? (
              <>
                {" "}
                <button
                  type="button"
                  className="capture-toast-action"
                  onClick={() => void undo(toast.undoToken!)}
                >
                  Undo
                </button>
              </>
            ) : null}
          </span>
          <button
            type="button"
            className="capture-toast-x"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {panel ? (
        <div className="cmd-panel" role="group" aria-label="Assistant">
          <p className="cmd-panel-msg">{panel.message}</p>
          {panel.kind === "confirm" ? (
            <div className="cmd-panel-actions">
              {panel.mode === "choose" ? (
                panel.choices.map((c) => (
                  <button
                    key={c.index}
                    type="button"
                    className="btn-pill go"
                    disabled={panelBusy}
                    onClick={() => void answer(String(c.index))}
                  >
                    {c.index}. {c.label}
                  </button>
                ))
              ) : (
                <>
                  <button
                    type="button"
                    className="btn-pill go"
                    disabled={panelBusy}
                    onClick={() => void answer("yes")}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    className="btn-pill"
                    disabled={panelBusy}
                    onClick={() => void answer("no")}
                  >
                    No
                  </button>
                </>
              )}
              <button
                type="button"
                className="cmd-panel-x"
                disabled={panelBusy}
                onClick={() => void answer("no")}
                aria-label="Dismiss"
              >
                <i className="ti ti-x" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="cmd-panel-actions">
              <button type="button" className="btn-pill" onClick={() => setPanel(null)}>
                Done
              </button>
            </div>
          )}
        </div>
      ) : null}

      {split ? (
        <div className="cmd-panel" role="group" aria-label="Split into tasks">
          <p className="cmd-panel-msg">{split.message}</p>
          <ul className="split-list">
            {split.items.map((it, i) => (
              <li key={i} className="split-row">
                <span className="split-title">{it.title}</span>
                <select
                  className="select select-sm"
                  value={it.projectId ?? ""}
                  aria-label={`Project for ${it.title}`}
                  disabled={splitBusy}
                  onChange={(e) => onSplitPick(i, e.target.value)}
                >
                  <option value="">Inbox</option>
                  {split.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <div className="cmd-panel-actions">
            <button
              type="button"
              className="btn-pill go"
              disabled={splitBusy}
              onClick={() => void onSplitCreate()}
            >
              Create {split.items.length}
            </button>
            <button
              type="button"
              className="btn-pill"
              disabled={splitBusy}
              onClick={() => void onSplitCancel()}
            >
              Keep as note
            </button>
          </div>
        </div>
      ) : null}

      {resort ? (
        <div className="cmd-panel" role="group" aria-label="Where it filed">
          <p className="cmd-panel-msg">
            {resort.projectName ? `Filed to ${resort.projectName} — change?` : "In your Inbox — file it?"}
          </p>
          <div className="cmd-panel-actions">
            <select
              className="select select-sm"
              value={resort.projectId ?? ""}
              aria-label="Move to a project"
              onChange={(e) => void onResortPick(e.target.value)}
            >
              <option value="">Inbox (no project)</option>
              {resort.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="cmd-panel-x"
              onClick={() => setResort(null)}
              aria-label="Dismiss"
            >
              <i className="ti ti-x" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      {voiceBusy ? (
        <p className="composer-status" aria-live="polite">
          Saving voice note…
        </p>
      ) : pending > 0 ? (
        <p className="composer-status" aria-live="polite">
          {pending} waiting to sync
        </p>
      ) : null}

      {failedUpload && !voiceBusy ? (
        <div className="voice-retry" role="alert">
          <i className="ti ti-alert-triangle" aria-hidden="true" />
          <span className="voice-retry-text">Voice note didn’t send.</span>
          <button
            type="button"
            className="btn-pill go"
            onClick={() => void uploadRecording(failedUpload)}
          >
            Retry
          </button>
          <button
            type="button"
            className="btn-pill"
            onClick={() => setFailedUpload(null)}
          >
            Discard
          </button>
        </div>
      ) : null}
    </>
  );

  // Home hero: the signature capture surface, inline under the metrics. Same
  // engine (offline queue, voice, interpreter) — only the shell is dressed up.
  if (variant === "hero") {
    return (
      <div className="h-hero">
        <span className="h-eyebrow">
          <span className="pulse" aria-hidden="true" />
          Capture · auto-sorted by AI
        </span>
        {extras}
        <form
          ref={formRef}
          onSubmit={(e) => {
            onSubmit(e);
            if (textRef.current) textRef.current.style.height = "auto";
          }}
          className="h-composer"
          data-recording={isRecording ? "" : undefined}
        >
          {isRecording ? (
            <div
              className="recording-bar"
              role="group"
              aria-label="Recording a voice note"
            >
              <span className="rec-dot" aria-hidden="true" />
              <span className="rec-time" aria-live="off">
                {fmtTime(recorder.elapsedMs)}
              </span>
              <span className="rec-label">Recording…</span>
              <button
                type="button"
                className="rec-cancel"
                onClick={recorder.cancel}
                title="Cancel"
                aria-label="Cancel recording"
              >
                <i className="ti ti-x" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="h-send"
                onClick={stopRecording}
                title="Stop"
                aria-label="Stop recording"
              >
                <i className="ti ti-check" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <>
              <span className="h-ai" aria-hidden="true">
                <i className="ti ti-sparkles" />
              </span>
              <textarea
                ref={textRef}
                name="text"
                rows={1}
                className="h-input"
                placeholder="What's on your mind? A task, a note, an idea — just type it."
                aria-label="Capture"
                onInput={autoGrow}
                onKeyDown={onKeyDown}
              />
              <button
                type="button"
                className="h-mic"
                onClick={() => {
                  textRef.current?.blur();
                  void recorder.start();
                }}
                disabled={
                  !recorder.isSupported ||
                  recorder.state === "requesting" ||
                  voiceBusy ||
                  !online
                }
                title={micTitle}
                aria-label="Record a voice note"
              >
                <i className="ti ti-microphone" aria-hidden="true" />
              </button>
              <button
                type="submit"
                className="h-send"
                disabled={status.kind === "sending" || !hasText}
                title="Capture (Enter)"
                aria-label="Capture"
              >
                <i className="ti ti-arrow-up" aria-hidden="true" />
              </button>
            </>
          )}
        </form>
        <div className="h-chips" aria-hidden="true">
          <span className="h-chip on">
            <i className="ti ti-wand" />
            Auto
          </span>
          <span className="h-chip">
            <i className="ti ti-checkbox" />
            Task
          </span>
          <span className="h-chip">
            <i className="ti ti-note" />
            Note
          </span>
          <span className="h-chip">
            <i className="ti ti-bulb" />
            Idea
          </span>
          <span className="h-chip">
            <i className="ti ti-calendar-plus" />
            Event
          </span>
          <span className="h-hint">
            <kbd>⏎</kbd> capture
          </span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {extras}
      <form
        ref={formRef}
        onSubmit={(e) => {
          onSubmit(e);
          if (textRef.current) textRef.current.style.height = "auto";
        }}
        className="composer"
        data-recording={isRecording ? "" : undefined}
      >
        {isRecording ? (
          <div className="recording-bar" role="group" aria-label="Recording a voice note">
            <span className="rec-dot" aria-hidden="true" />
            <span className="rec-time" aria-live="off">
              {fmtTime(recorder.elapsedMs)}
            </span>
            <span className="rec-label">Recording…</span>
            <button
              type="button"
              className="rec-cancel"
              onClick={recorder.cancel}
              title="Cancel"
              aria-label="Cancel recording"
            >
              <i className="ti ti-x" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="send"
              onClick={stopRecording}
              title="Stop"
              aria-label="Stop recording"
            >
              <i className="ti ti-check" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <>
            <textarea
              ref={textRef}
              name="text"
              rows={1}
              placeholder="Capture a thought, task, or note…"
              aria-label="Capture"
              onInput={autoGrow}
              onKeyDown={onKeyDown}
            />
            {hasText ? (
              <button
                type="submit"
                className="send"
                disabled={status.kind === "sending"}
                title="Capture (Enter)"
                aria-label="Capture"
              >
                <i className="ti ti-arrow-up" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                className="mic"
                onClick={() => {
                  textRef.current?.blur(); // drop the iOS keyboard before recording
                  void recorder.start();
                }}
                disabled={
                  !recorder.isSupported ||
                  recorder.state === "requesting" ||
                  voiceBusy ||
                  !online
                }
                title={micTitle}
                aria-label="Record a voice note"
              >
                <i className="ti ti-microphone" aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </form>
    </div>
  );
}
