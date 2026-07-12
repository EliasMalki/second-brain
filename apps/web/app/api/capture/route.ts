import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { captureText } from "@/lib/db/captures";

/**
 * Capture over HTTP — the delivery target of the offline queue (§6). Same
 * org-scoped write path as the server action (captures row first, unsorted
 * note, async classify).
 */
export async function POST(request: Request): Promise<Response> {
  const user = await getUser();
  if (!user) {
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
    const { noteId } = await captureText(text);
    return NextResponse.json({ noteId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Capture failed" },
      { status: 500 },
    );
  }
}
