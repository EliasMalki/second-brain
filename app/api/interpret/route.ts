import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { handle, applyUndo } from "@/lib/commands/handle";

/**
 * Capture command interpreter — the in-app, interactive entry point (v1).
 *
 * Unlike /api/capture (the offline-queue target, which is fire-and-forget and
 * stays pure capture), this route is the SYNCHRONOUS path the capture box uses
 * when online: it runs the three-way intent split and returns a rich
 * InterpreterResult the client renders (a toast, a confirmation with buttons, a
 * read, or an undo). It delegates entirely to the channel-agnostic handle() /
 * applyUndo(), so a future Telegram webhook reuses the exact same logic.
 *
 * Two POST shapes:
 *   { text }        -> interpret a captured line (capture / command / read)
 *   { undo: token } -> reverse a previously-acted command
 */
export async function POST(request: Request): Promise<Response> {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { text?: unknown; undo?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    if (typeof body.undo === "string" && body.undo) {
      const result = await applyUndo(body.undo);
      return NextResponse.json({ result });
    }

    const text = String(body.text ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "Nothing to capture" }, { status: 400 });
    }

    const result = await handle(text, { source: "app" });
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Interpret failed" },
      { status: 500 },
    );
  }
}
