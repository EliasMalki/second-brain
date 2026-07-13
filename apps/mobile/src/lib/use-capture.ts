import { useCallback, useEffect, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { sendCapture } from "@second-brain/shared/capture/api";
import {
  captureOutcome,
  type CaptureOutcome,
} from "@second-brain/shared/db/captures";
import { updateNote } from "@second-brain/shared/db/notes";
import { updateTask } from "@second-brain/shared/db/tasks";
import { useAuth } from "./auth-context";
import { supabase } from "./supabase";
import { apiBaseUrl, getAccessToken } from "./api";
import { captureQueue } from "./offline-queue";

// Mirror web's startResortPoll (capture-box.tsx): ~10s of best-effort polling
// for the classifier to settle before falling back to "it's in your Inbox".
const POLL_MS = 1200;
const POLL_TRIES = 8;

export type CaptureFeedback =
  | { kind: "idle" }
  | { kind: "filing" }
  | { kind: "filed"; outcome: CaptureOutcome }
  | { kind: "inbox" }
  | { kind: "offline" }
  | { kind: "error"; message: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useCapture() {
  const { orgId } = useAuth();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<CaptureFeedback>({ kind: "idle" });
  // Guards an in-flight poll from being clobbered by / clobbering a newer send.
  const activeSend = useRef(0);

  const flush = useCallback(() => {
    void captureQueue.flush().catch(() => {});
  }, []);

  // Deliver any queued (offline) captures on mount and whenever connectivity
  // returns — re-invoking flush() IS the retry (the shared queue has no timer).
  useEffect(() => {
    flush();
    const unsub = NetInfo.addEventListener((state) => {
      if (state.isConnected) flush();
    });
    return unsub;
  }, [flush]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || !orgId) return;
      const sendId = ++activeSend.current;
      setBusy(true);
      setFeedback({ kind: "filing" });

      const token = await getAccessToken();
      const res = await sendCapture(text, {
        baseUrl: apiBaseUrl,
        accessToken: token ?? undefined,
      });
      setBusy(false);

      if (!res.ok) {
        if (res.unreachable) {
          await captureQueue.enqueue(text);
          flush();
          if (activeSend.current === sendId) setFeedback({ kind: "offline" });
        } else if (activeSend.current === sendId) {
          setFeedback({ kind: "error", message: res.error ?? "Capture failed." });
        }
        return;
      }

      // Online: poll for where the classifier filed it.
      for (let i = 0; i < POLL_TRIES; i++) {
        await sleep(POLL_MS);
        if (activeSend.current !== sendId) return; // superseded by a newer send
        try {
          const outcome = await captureOutcome(supabase, orgId, res.captureId);
          if (outcome.settled && outcome.kind && outcome.itemId) {
            setFeedback({ kind: "filed", outcome });
            return;
          }
        } catch {
          // transient read error — keep polling
        }
      }
      if (activeSend.current === sendId) setFeedback({ kind: "inbox" });
    },
    [orgId, flush],
  );

  // Re-file the just-captured item to a different project (the user overrides
  // the classifier). Optimistically reflects the pick.
  const reFile = useCallback(
    async (projectId: string) => {
      if (feedback.kind !== "filed" || !orgId) return;
      const { kind, itemId, projects } = feedback.outcome;
      if (!itemId) return;
      const picked = projects.find((p) => p.id === projectId);
      setFeedback({
        kind: "filed",
        outcome: {
          ...feedback.outcome,
          projectId,
          projectName: picked?.name ?? feedback.outcome.projectName,
        },
      });
      try {
        if (kind === "note") {
          await updateNote(supabase, orgId, itemId, { projectId });
        } else {
          await updateTask(supabase, orgId, itemId, { projectId });
        }
      } catch {
        // best-effort; the optimistic label stays. A reload reflects truth.
      }
    },
    [feedback, orgId],
  );

  const reset = useCallback(() => {
    activeSend.current++;
    setFeedback({ kind: "idle" });
  }, []);

  return { busy, feedback, send, reFile, reset };
}
