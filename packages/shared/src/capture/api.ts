/**
 * The client-side capture API surface: what a UI (or the offline queue) calls
 * to POST a thought into the capture pipeline. Platform-agnostic — plain
 * fetch. Web calls it with the default relative URL + cookie session; mobile
 * passes its absolute baseUrl + a Supabase access token (Bearer).
 */

function authHeaders(accessToken?: string): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

/**
 * Deliver one text capture to POST {baseUrl}/api/capture. Returns res.ok;
 * false (never a throw) when offline or the server is unreachable, so a
 * queued capture simply stays queued. This is the offline-queue's poster —
 * it only needs delivered/not-delivered.
 */
export async function postCapture(
  text: string,
  opts?: { baseUrl?: string; accessToken?: string },
): Promise<boolean> {
  try {
    const res = await fetch(`${opts?.baseUrl ?? ""}/api/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(opts?.accessToken),
      },
      body: JSON.stringify({ text }),
    });
    return res.ok;
  } catch {
    return false; // offline or server unreachable — stays queued
  }
}

export type SendCaptureResult =
  | { ok: true; noteId: string; captureId: string }
  | { ok: false; unreachable: boolean; error?: string };

/**
 * Interactive send: POST one text capture and return the ids so the caller can
 * poll captureOutcome to show where it filed. Distinguishes a network failure
 * (`unreachable: true` — the caller should enqueue for retry) from a server
 * rejection (`unreachable: false` with an error — surface it, don't silently
 * queue a capture the server refused).
 */
export async function sendCapture(
  text: string,
  opts: { baseUrl?: string; accessToken?: string },
): Promise<SendCaptureResult> {
  let res: Response;
  try {
    res = await fetch(`${opts.baseUrl ?? ""}/api/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(opts.accessToken),
      },
      body: JSON.stringify({ text }),
    });
  } catch {
    return { ok: false, unreachable: true };
  }
  if (!res.ok) {
    let error: string | undefined;
    try {
      error = ((await res.json()) as { error?: string }).error;
    } catch {
      // non-JSON error body
    }
    return { ok: false, unreachable: false, error };
  }
  const body = (await res.json()) as { noteId: string; captureId: string };
  return { ok: true, noteId: body.noteId, captureId: body.captureId };
}
