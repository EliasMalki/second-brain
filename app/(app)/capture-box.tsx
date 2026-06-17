"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { enqueueCapture, flushQueue } from "@/lib/offline/queue";
import { useVoiceRecorder, type Recording } from "./use-voice-recorder";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "captured" }
  | { kind: "queued" }
  | { kind: "error"; message: string };

type Toast = { tone: "ok" | "warn" | "err"; icon: string; text: string };

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
 * Quick capture, offline-first (BUILD_SPEC §4 + §6). Every typed capture lands
 * in IndexedDB before any network is attempted, then the queue is flushed —
 * immediately when online, on the 'online' event otherwise. The user's thought
 * is never lost, connectivity or not.
 *
 * Voice capture (v1 feature 1) rides alongside: the trailing button is a mic
 * when the box is empty and the send arrow once you type. Recording swaps the
 * input row for a recording strip (timer + pulsing dot + cancel/stop).
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

  // Toasts auto-dismiss after 4s; a new toast resets the timer.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = textRef.current?.value.trim() ?? "";
    if (!text) return;

    setStatus({ kind: "sending" });

    // 1. durable on-device FIRST
    let queuedOk = true;
    try {
      await enqueueCapture(text);
    } catch {
      queuedOk = false; // no IndexedDB — fall back to direct POST below
    }

    formRef.current?.reset();
    setHasText(false);
    textRef.current?.focus();

    // 2. then try the network
    if (queuedOk) {
      const remaining = await flushQueue().catch(() => 1);
      setPending(remaining);
      if (remaining === 0) {
        setStatus({ kind: "captured" });
        setToast({ tone: "ok", icon: "ti-check", text: "Captured — it's in your Inbox" });
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
      setToast({ tone: "ok", icon: "ti-check", text: "Captured — it's in your Inbox" });
      router.refresh();
    } catch {
      setStatus({ kind: "error", message: "Couldn't save" });
      setToast({
        tone: "err",
        icon: "ti-alert-triangle",
        text: "Couldn't save — copy your text and retry",
      });
    }
  }

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
            {toast.tone === "ok" ? (
              <>
                {" "}
                <Link href="/inbox">View</Link>
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
