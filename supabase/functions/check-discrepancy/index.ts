// check-discrepancy — Part A entry point for items filed OUTSIDE the classifier
// (BUILD_SPEC §4 / v1 feature 4). The classifier runs the check inline; this
// function is the fire-and-forget target for receipt saves (which happen in the
// Next app, not Deno) and the bounded "scan recent" sweep used during tuning.
//
// Two invocation shapes:
//   { item_type: 'receipt'|'note'|'task', item_id }  -> check one filed item
//   { sweep: true, org_id, limit? }                  -> re-check recent filed
//                                                       items in one org (testing)
//
// Runs with the service role (BYPASSRLS). org_id is read from the item row (or
// passed for sweep) and every query is scoped to it by hand — same tenancy
// discipline as classify-capture. The shared detector is idempotent and
// high-precision; this function only loads context and hands off.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  detectDiscrepancy,
  type DiscrepancyItem,
  type ProjectLite,
} from "../_shared/discrepancy.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SWEEP_LIMIT = 25;

type ItemType = "receipt" | "note" | "task";

type Loaded = {
  orgId: string;
  ownerId: string | null;
  projectId: string | null;
  summary: string;
};

async function loadItem(type: ItemType, id: string): Promise<Loaded | null> {
  if (type === "receipt") {
    const { data, error } = await supabase
      .from("receipts")
      .select("id, org_id, owner_id, project_id, amount, currency, vendor, category, note, purchased_on")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`load receipt: ${error.message}`);
    if (!data) return null;
    const summary = [
      data.amount != null ? `${data.amount} ${data.currency}` : null,
      data.vendor ? `at ${data.vendor}` : null,
      data.category ? `(${data.category})` : null,
      data.note ? `— ${data.note}` : null,
      data.purchased_on ? `on ${data.purchased_on}` : null,
    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 600);
    return {
      orgId: data.org_id,
      ownerId: data.owner_id,
      projectId: data.project_id,
      summary: summary || "a receipt",
    };
  }

  // note | task share title + body
  const { data, error } = await supabase
    .from(type === "note" ? "notes" : "tasks")
    .select("id, org_id, owner_id, project_id, title, body")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`load ${type}: ${error.message}`);
  if (!data) return null;
  const summary = [data.title, data.body]
    .filter(Boolean)
    .join(" — ")
    .slice(0, 600);
  return {
    orgId: data.org_id,
    ownerId: data.owner_id,
    projectId: data.project_id,
    summary: summary || `a ${type}`,
  };
}

async function processOne(type: ItemType, id: string): Promise<string> {
  const item = await loadItem(type, id);
  if (!item) return "skipped: not found";
  if (!item.projectId) return "skipped: no project";

  const { data: project, error: pErr } = await supabase
    .from("projects")
    .select("id, name, description")
    .eq("org_id", item.orgId)
    .eq("id", item.projectId)
    .maybeSingle();
  if (pErr) throw new Error(`load project: ${pErr.message}`);
  if (!project) return "skipped: project gone";

  // Suggestions only point at the org's OTHER active projects.
  const { data: others, error: oErr } = await supabase
    .from("projects")
    .select("id, name, description")
    .eq("org_id", item.orgId)
    .eq("status", "active")
    .neq("id", item.projectId);
  if (oErr) throw new Error(`load other projects: ${oErr.message}`);

  const discItem: DiscrepancyItem = { type, id, summary: item.summary };
  return await detectDiscrepancy(supabase, {
    orgId: item.orgId,
    ownerId: item.ownerId,
    item: discItem,
    project: project as ProjectLite,
    otherProjects: (others ?? []) as ProjectLite[],
  });
}

async function sweep(orgId: string, limit: number): Promise<Record<string, string>> {
  // Gather recent filed items across types, then run the (idempotent) checks in
  // parallel — the Inbox "Scan recent" button awaits this, so keep it snappy.
  const jobs: { key: string; type: ItemType; id: string }[] = [];
  for (const type of ["receipt", "note", "task"] as ItemType[]) {
    const table = type === "receipt" ? "receipts" : type === "note" ? "notes" : "tasks";
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .eq("org_id", orgId)
      .not("project_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`sweep ${type}: ${error.message}`);
    for (const row of data ?? []) {
      jobs.push({ key: `${type}:${row.id}`, type, id: row.id });
    }
  }

  const settled = await Promise.all(
    jobs.map(async (j) => {
      try {
        return [j.key, await processOne(j.type, j.id)] as const;
      } catch (e) {
        return [j.key, `error: ${e instanceof Error ? e.message : e}`] as const;
      }
    }),
  );
  return Object.fromEntries(settled);
}

Deno.serve(async (req) => {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // empty body is not a valid invocation here
  }

  try {
    if (body.sweep === true) {
      const orgId = typeof body.org_id === "string" ? body.org_id : null;
      if (!orgId) {
        return Response.json({ error: "sweep requires org_id" }, { status: 400 });
      }
      const limit = typeof body.limit === "number" ? body.limit : SWEEP_LIMIT;
      const results = await sweep(orgId, limit);
      return Response.json({ swept: Object.keys(results).length, results });
    }

    const type = body.item_type;
    const id = body.item_id;
    if (
      (type !== "receipt" && type !== "note" && type !== "task") ||
      typeof id !== "string"
    ) {
      return Response.json(
        { error: "expected { item_type, item_id } or { sweep, org_id }" },
        { status: 400 },
      );
    }

    const result = await processOne(type, id);
    return Response.json({ result });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
});
