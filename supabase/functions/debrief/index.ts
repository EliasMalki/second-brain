// debrief — on-demand entry point for the gap-miner (v1 feature 4, Part B).
//
// The nightly job runs the same mineAndGenerate() per user on a cadence. This
// function exists so the user can run it on demand — primarily the "Run debrief
// now" button used during tuning. It ignores the cadence gate and surfaces the
// questions IMMEDIATELY (surface_after = now) so results are visible in the
// Inbox right away, instead of at the next midday.
//
// Invoked with the service-role bearer by a trusted Next server action that
// passes the caller's own org_id + user_id (derived server-side from session).

import { createClient } from "npm:@supabase/supabase-js@2";
import { mineAndGenerate } from "../_shared/debrief.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // empty body is not a valid invocation here
  }

  const orgId = typeof body.org_id === "string" ? body.org_id : null;
  const userId = typeof body.user_id === "string" ? body.user_id : null;
  if (!orgId || !userId) {
    return Response.json(
      { error: "expected { org_id, user_id }" },
      { status: 400 },
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  try {
    const result = await mineAndGenerate(supabase, {
      orgId,
      ownerId: userId,
      today,
      surfaceAfter: new Date().toISOString(), // immediate, for on-demand runs
    });
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
});
