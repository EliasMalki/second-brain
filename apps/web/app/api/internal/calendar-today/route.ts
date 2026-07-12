import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { getTodayEventsForUser } from "@/lib/db/calendar";

/**
 * Internal endpoint: today's calendar events for a given user, formatted for
 * the daily email brief. Called server-to-server by the Deno nightly function
 * (which shares no code with lib/), so token handling stays in ONE place.
 *
 * Auth is the Supabase service-role key as a bearer (constant-time compare) —
 * the same shared secret the nightly already holds. NOT a session route, so it
 * is allow-listed in middleware but hard-gated here.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

function authorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  let expected: string;
  try {
    expected = serverEnv.supabaseServiceRoleKey();
  } catch {
    return false;
  }
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function formatTime(dateTime: string | null, allDay: boolean, tz: string): string {
  if (allDay) return "All day";
  if (!dateTime) return "";
  return new Date(dateTime).toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let userId = "";
  try {
    const body = await request.json();
    userId = String(body?.userId ?? "");
  } catch {
    // fall through to the empty check
  }
  if (!userId) {
    return NextResponse.json({ error: "missing userId" }, { status: 400 });
  }

  const result = await getTodayEventsForUser(userId);
  if (result.status !== "ok") {
    return NextResponse.json({ status: result.status, events: [] });
  }
  return NextResponse.json({
    status: "ok",
    events: result.events.map((e) => ({
      time: formatTime(e.start.dateTime, e.allDay, result.timezone),
      title: e.title,
      location: e.location,
    })),
  });
}
