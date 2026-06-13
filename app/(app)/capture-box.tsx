"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { enqueueCapture, flushQueue } from "@/lib/offline/queue";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "captured" }
  | { kind: "queued" }
  | { kind: "error"; message: string };

type Toast = { tone: "ok" | "warn" | "err"; icon: string; text: string };

/**
 * Quick capture, offline-first (BUILD_SPEC §4 + §6). Every capture lands in
 * IndexedDB before any network is attempted, then the queue is flushed —
 * immediately when online, on the 'online' event otherwise. The user's
 * thought is never lost, connectivity or not.
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

  // Toasts auto-dismiss after 4s; a new toast resets the timer.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

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
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

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

      {pending > 0 ? (
        <p className="composer-status" aria-live="polite">
          {pending} waiting to sync
        </p>
      ) : null}

      <form
        ref={formRef}
        onSubmit={(e) => {
          onSubmit(e);
          if (textRef.current) textRef.current.style.height = "auto";
        }}
        className="composer"
      >
        <textarea
          ref={textRef}
          name="text"
          rows={1}
          required
          placeholder="Capture a thought, task, or note…"
          aria-label="Capture"
          onInput={autoGrow}
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          className="send"
          disabled={status.kind === "sending"}
          title="Capture (Enter)"
          aria-label="Capture"
        >
          <i className="ti ti-arrow-up" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
