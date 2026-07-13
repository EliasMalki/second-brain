import { useCallback, useEffect, useState } from "react";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { authedFetch } from "./api";

const MAX_MS = 5 * 60 * 1000; // 5-min cap, matching web

export type VoicePhase = "idle" | "recording" | "uploading";

/**
 * Native voice capture. Records m4a (RecordingPresets.HIGH_QUALITY on iOS),
 * uploads to the bearer-authenticated /api/capture/voice, and hands the
 * transcript back to the composer for review (transcribe-first, never
 * auto-files — same as web). A failed transcription is persisted server-side
 * (durable audio + retry-able Inbox note); we just tell the user.
 */
export function useVoice(onTranscript: (text: string) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setError(
        "Microphone access is off. Enable it in Settings to record a voice note.",
      );
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setPhase("recording");
  }, [recorder]);

  const upload = useCallback(async () => {
    const uri = recorder.uri;
    setPhase("uploading");
    if (!uri) {
      setError("No recording to send.");
      setPhase("idle");
      return;
    }
    try {
      const fd = new FormData();
      // React Native FormData takes a { uri, name, type } file part.
      fd.append("audio", {
        uri,
        name: "audio.m4a",
        type: "audio/m4a",
      } as unknown as Blob);
      fd.append("mimeType", "audio/m4a");
      const res = await authedFetch("/api/capture/voice", {
        method: "POST",
        body: fd,
      });
      const body = (await res.json()) as {
        transcript?: string;
        transcriptionFailed?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Transcription failed.");
      } else if (body.transcriptionFailed) {
        setError(
          "Couldn't transcribe that — the recording is saved to your Inbox to retry.",
        );
      } else {
        onTranscript(body.transcript ?? "");
      }
    } catch {
      setError("Upload failed — check your connection and try again.");
    }
    setPhase("idle");
  }, [recorder, onTranscript]);

  const stop = useCallback(async () => {
    await recorder.stop();
    await upload();
  }, [recorder, upload]);

  const cancel = useCallback(async () => {
    try {
      await recorder.stop();
    } catch {
      // already stopped
    }
    setPhase("idle");
    setError(null);
  }, [recorder]);

  // Auto-stop (and upload) at the 5-minute cap.
  useEffect(() => {
    if (phase === "recording" && state.durationMillis >= MAX_MS) {
      void stop();
    }
  }, [phase, state.durationMillis, stop]);

  return {
    phase,
    error,
    elapsedMs: state.durationMillis,
    start,
    stop,
    cancel,
    clearError: () => setError(null),
  };
}
