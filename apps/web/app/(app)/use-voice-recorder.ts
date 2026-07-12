"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice recording hook (v1 feature 1). Wraps getUserMedia + MediaRecorder with
 * the bits the composer needs: a small state machine, a live elapsed timer, and
 * a stop() that resolves with the finished audio Blob.
 *
 * Format is whatever the browser produces — iOS Safari/PWA gives mp4/m4a,
 * others give webm/ogg (Opus). We feature-detect a supported container rather
 * than forcing one, because iOS only supports a subset; OpenAI accepts them all.
 *
 * The recording is never silently lost here: stop() always returns the captured
 * audio so the caller can persist it before doing anything that can fail.
 */

export type RecorderErrorKind =
  | "unsupported" // no MediaRecorder / not a secure context
  | "denied" // user blocked the mic, or the OS did
  | "failed"; // anything else (no device, hardware error)

export type RecorderError = { kind: RecorderErrorKind; message: string };

export type RecorderState = "idle" | "requesting" | "recording" | "error";

export type Recording = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
};

// Preference order: iOS-friendly mp4 first, then the Opus containers everyone
// else supports. Empty string => let the browser pick its own default.
const MIME_CANDIDATES = [
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      // isTypeSupported can throw on some engines — treat as unsupported
    }
  }
  return "";
}

function isSupportedEnv(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    // getUserMedia is only available in secure contexts (https / localhost)
    window.isSecureContext !== false
  );
}

export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<RecorderError | null>(null);
  // Resolved after mount so the server and first client render agree (no
  // `window` on the server) — avoids a hydration mismatch on the mic button.
  const [isSupported, setIsSupported] = useState(false);
  useEffect(() => setIsSupported(isSupportedEnv()), []);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeRef = useRef("");

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Always release the mic if the component unmounts mid-recording.
  useEffect(() => releaseStream, [releaseStream]);

  const start = useCallback(async (): Promise<void> => {
    setError(null);
    if (!isSupportedEnv()) {
      setError({
        kind: "unsupported",
        message: "This browser can't record audio.",
      });
      setState("error");
      return;
    }

    setState("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      const denied = name === "NotAllowedError" || name === "SecurityError";
      setError({
        kind: denied ? "denied" : "failed",
        message: denied
          ? "Microphone access is blocked. Enable it in your settings to record."
          : "Couldn't start the microphone.",
      });
      setState("error");
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    mimeRef.current = pickMimeType();

    let recorder: MediaRecorder;
    try {
      recorder = mimeRef.current
        ? new MediaRecorder(stream, { mimeType: mimeRef.current })
        : new MediaRecorder(stream);
    } catch {
      releaseStream();
      setError({ kind: "failed", message: "Couldn't start recording." });
      setState("error");
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    recorder.start();
    setState("recording");

    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 200);
  }, [releaseStream]);

  const finish = useCallback(
    (discard: boolean): Promise<Recording | null> => {
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (!recorder || recorder.state === "inactive") {
        releaseStream();
        setState("idle");
        return Promise.resolve(null);
      }

      const durationMs = Date.now() - startedAtRef.current;
      return new Promise<Recording | null>((resolve) => {
        recorder.onstop = () => {
          releaseStream();
          setState("idle");
          setElapsedMs(0);
          if (discard) return resolve(null);
          const mimeType = recorder.mimeType || mimeRef.current || "audio/webm";
          const blob = new Blob(chunksRef.current, { type: mimeType });
          chunksRef.current = [];
          resolve({ blob, mimeType, durationMs });
        };
        recorder.stop();
      });
    },
    [releaseStream],
  );

  /** Stop and return the recorded audio. */
  const stop = useCallback(() => finish(false), [finish]);

  /** Stop and throw the recording away. */
  const cancel = useCallback(() => {
    void finish(true);
  }, [finish]);

  return {
    state,
    elapsedMs,
    error,
    isSupported,
    start,
    stop,
    cancel,
  } as const;
}
