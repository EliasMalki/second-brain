"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { enqueueCapture, flushQueue } from "@/lib/offline/queue";
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

// Safety cap so a pocket-dial recording can't grow unbounded (and stays well
// under OpenAI's 25 MB upload limit).
const MAX_REC_MS = 5 * 60 * 1000;

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
 * Voice capture rides the pure-capture path unchanged (transcribe → Inbox);
 * voice-command interpretation is a later add.
 *
 * Rendered once in the app layout as a chat-style composer docked under the
 * content pane. Enter sends, Shift+Enter adds a line.
 */
export function CaptureBox() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [pending, setPending] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [panelBusy, setPanelBusy] = useState(false);
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
    async (body: { text: string } | { undo: string }): Promise<InterpreterResult> => {
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

  // Render an InterpreterResult: toasts for terminal outcomes, a panel for
  // confirmations and reads. Refresh the views when data changed.
  const applyResult = useCallback(
    (result: InterpreterResult) => {
      if (result.kind === "confirm") {
        setToast(null);
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
        setPanel({ kind: "read", message: result.message });
        return;
      }

      setPanel(null);
      if (result.kind === "captured") {
        setStatus({ kind: "captured" });
        setToast({ tone: "ok", icon: "ti-check", text: result.message, view: true });
        router.refresh();
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
    [router],
  );

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
            text: "Saved offline — will file when you're back online",
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
        setStatus({ kind: "error", message: "Couldn't save" });
        setToast({
          tone: "err",
          icon: "ti-alert-triangle",
          text: "Couldn't save — copy your text and retry",
        });
      }
    },
    [router],
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = textRef.current?.value.trim() ?? "";
    if (!text) return;

    // A fresh line supersedes any open confirmation/read.
    setPanel(null);
    formRef.current?.reset();
    setHasText(false);
    textRef.current?.focus();

    // Online → the interactive interpreter. On any network/server failure, fall
    // through to the durable capture queue so the thought is never lost.
    if (navigator.onLine) {
      setStatus({ kind: "sending" });
      try {
        applyResult(await sendInterpret({ text }));
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

  // Upload the finished recording: it lands in the private bucket + a capture
  // row server-side, the server transcribes it (vocabulary-steered), then files
  // the transcript into the Inbox pipeline — the SAME path as a typed capture.
  //
  // If the POST never reaches the server, the recording is kept in failedUpload
  // so it can be retried from memory — it is not lost the instant the network
  // hiccups. (A transcription failure, by contrast, is recoverable server-side:
  // the audio is saved and the Inbox offers a Retry.)
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
          captureId: string;
          transcript: string | null;
          transcriptionFailed: boolean;
        };
        setFailedUpload(null); // durable server-side now

        if (data.transcriptionFailed || !data.transcript) {
          setToast({
            tone: "warn",
            icon: "ti-microphone",
            text: "Recording saved, but transcription failed — retry it from the Inbox.",
          });
          router.refresh();
          return;
        }

        // Filed like any typed capture — confirm and refresh the Inbox.
        setToast({
          tone: "ok",
          icon: "ti-microphone",
          text: "Captured — it's in your Inbox",
          view: true,
        });
        router.refresh();
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

  return (
    <div>
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
                onClick={() => setPanel(null)}
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
