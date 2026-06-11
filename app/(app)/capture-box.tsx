"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { enqueueCapture, flushQueue, listQueued } from "@/lib/offline/queue";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "captured" }
  | { kind: "queued" }
  | { kind: "error"; message: string };

/**
 * Quick capture, offline-first (BUILD_SPEC §4 + §6). Every capture lands in
 * IndexedDB before any network is attempted, then the queue is flushed —
 * immediately when online, on the 'online' event otherwise. The user's
 * thought is never lost, connectivity or not.
 */
export function CaptureBox() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [pending, setPending] = useState(0);

  const refreshPending = useCallback(async () => {
    try {
      setPending((await listQueued()).length);
    } catch {
      // IndexedDB unavailable (private mode etc.) — capture still POSTs
    }
  }, []);

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
    textRef.current?.focus();

    // 2. then try the network
    if (queuedOk) {
      const remaining = await flushQueue().catch(() => 1);
      setPending(remaining);
      if (remaining === 0) {
        setStatus({ kind: "captured" });
        router.refresh();
      } else {
        setStatus({ kind: "queued" });
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
      router.refresh();
    } catch {
      setStatus({
        kind: "error",
        message: "Couldn't save — copy your text and retry.",
      });
    }
  }

  return (
    <div className="card capture-card">
      <form ref={formRef} onSubmit={onSubmit} className="capture-form">
        <textarea
          ref={textRef}
          name="text"
          className="textarea capture-input"
          required
          placeholder="Capture a thought, task, or note… it lands in your Inbox."
          aria-label="Capture"
        />
        <div className="capture-foot">
          <span className="capture-status" aria-live="polite">
            {status.kind === "captured" ? (
              <>
                Captured ✓ — in your <Link href="/inbox">Inbox</Link>
              </>
            ) : status.kind === "queued" ? (
              <>Saved on this device — will sync when you&apos;re back online.</>
            ) : status.kind === "error" ? (
              <span className="error">{status.message}</span>
            ) : null}
            {pending > 0 && status.kind !== "queued" ? (
              <> ({pending} queued)</>
            ) : null}
          </span>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={status.kind === "sending"}
          >
            {status.kind === "sending" ? "Capturing…" : "Capture"}
          </button>
        </div>
      </form>
    </div>
  );
}
