import { NextResponse } from "next/server";
import { resolveApiAuth } from "@/lib/api-auth";
import { captureText } from "@/lib/db/captures";

/**
 * Capture over HTTP — the delivery target of the offline queue (§6) and of the
 * mobile app. Same org-scoped write path as the server action (captures row
 * first, unsorted note, async classify). Authenticates by cookie (web) or a
 * Supabase bearer token (mobile) via resolveApiAuth.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await resolveApiAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let text = "";
  try {
    const body = await request.json();
    text = String(body?.text ?? "").trim();
  } catch {
    // fall through to the empty-text check
  }
  if (!text) {
    return NextResponse.json({ error: "Nothing to capture" }, { status: 400 });
  }

  try {
    const { noteId, captureId } = await captureText(text, auth);
    return NextResponse.json({ noteId, captureId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Capture failed" },
      { status: 500 },
    );
  }
}
