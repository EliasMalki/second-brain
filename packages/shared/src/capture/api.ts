/**
 * The client-side capture API surface: what a UI (or the offline queue) calls
 * to POST a thought into the capture pipeline. Platform-agnostic — plain
 * fetch. Web calls it with the default relative URL; mobile will pass its
 * absolute baseUrl.
 */

/**
 * Deliver one text capture to POST {baseUrl}/api/capture. Returns res.ok;
 * false (never a throw) when offline or the server is unreachable, so a
 * queued capture simply stays queued.
 */
export async function postCapture(
  text: string,
  opts?: { baseUrl?: string },
): Promise<boolean> {
  try {
    const res = await fetch(`${opts?.baseUrl ?? ""}/api/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return res.ok;
  } catch {
    return false; // offline or server unreachable — stays queued
  }
}
