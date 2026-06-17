import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import type { Database } from "@/lib/database.types";

export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type ProjectStatus = Database["public"]["Enums"]["project_status"];
export type Availability = Database["public"]["Enums"]["availability"];

/**
 * Projects data access. All reads filter by org_id; all writes set org_id +
 * owner_id. RLS is the backstop, the explicit scope here is the rule.
 *
 * v0.5 surface: name, description (markdown), status. aliases / area_id /
 * availability_default stay at their schema defaults until the classifier
 * (Week 2) and areas UI need them.
 */

export async function listProjects(opts?: {
  includeArchived?: boolean;
}): Promise<Project[]> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  let query = supabase
    .from("projects")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (!opts?.includeArchived) {
    query = query.neq("status", "archived");
  }

  const { data, error } = await query;
  if (error) throw new Error(`listProjects: ${error.message}`);
  return data;
}

export type ProjectStats = {
  openTasks: number;
  notes: number;
  records: number;
  /** ISO timestamp of the most recent touch (project edit or note update). */
  lastActivity: string;
};

export type ProjectWithStats = Project & { stats: ProjectStats };

/**
 * Projects + the counts the index grid shows (open tasks, notes, active
 * records) and a last-activity timestamp. One extra cheap select per child
 * table (org-scoped, ids-filtered), reduced in JS — fine at personal scale and
 * avoids an N+1 per card.
 */
export async function listProjectsWithStats(opts?: {
  includeArchived?: boolean;
}): Promise<ProjectWithStats[]> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();
  const projects = await listProjects(opts);
  if (projects.length === 0) return [];

  const ids = projects.map((p) => p.id);
  const [tasksRes, notesRes, recordsRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("project_id")
      .eq("org_id", orgId)
      .eq("status", "open")
      .in("project_id", ids),
    supabase
      .from("notes")
      .select("project_id, updated_at")
      .eq("org_id", orgId)
      .eq("archived", false)
      .in("project_id", ids),
    supabase
      .from("records")
      .select("project_id")
      .eq("org_id", orgId)
      .eq("status", "active")
      .in("project_id", ids),
  ]);
  if (tasksRes.error) throw new Error(`listProjectsWithStats tasks: ${tasksRes.error.message}`);
  if (notesRes.error) throw new Error(`listProjectsWithStats notes: ${notesRes.error.message}`);
  if (recordsRes.error) throw new Error(`listProjectsWithStats records: ${recordsRes.error.message}`);

  const tally = (rows: { project_id: string | null }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (!r.project_id) continue;
      m.set(r.project_id, (m.get(r.project_id) ?? 0) + 1);
    }
    return m;
  };

  const openTasks = tally(tasksRes.data);
  const records = tally(recordsRes.data);
  const notes = tally(notesRes.data);
  const noteTouch = new Map<string, string>();
  for (const r of notesRes.data) {
    if (!r.project_id) continue;
    const cur = noteTouch.get(r.project_id);
    if (!cur || r.updated_at > cur) noteTouch.set(r.project_id, r.updated_at);
  }

  return projects.map((p) => {
    const nt = noteTouch.get(p.id);
    return {
      ...p,
      stats: {
        openTasks: openTasks.get(p.id) ?? 0,
        notes: notes.get(p.id) ?? 0,
        records: records.get(p.id) ?? 0,
        lastActivity: nt && nt > p.updated_at ? nt : p.updated_at,
      },
    };
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getProject(id: string): Promise<Project | null> {
  // Malformed ids (hand-edited URLs) should 404, not throw a Postgres error.
  if (!UUID_RE.test(id)) return null;

  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getProject: ${error.message}`);
  return data;
}

export async function createProject(input: {
  name: string;
  description?: string;
  area_id?: string | null;
  color?: string | null;
}): Promise<Project> {
  const user = await requireUser();
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("projects")
    .insert({
      org_id: orgId,
      owner_id: user.id,
      name: input.name,
      description: input.description || null,
      area_id: input.area_id ?? null,
      color: input.color ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`createProject: ${error.message}`);
  return data;
}

export async function updateProject(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    status?: ProjectStatus;
    area_id?: string | null;
    color?: string | null;
    availability_default?: Availability;
  },
): Promise<Project> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("projects")
    .update(input)
    .eq("org_id", orgId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`updateProject: ${error.message}`);
  return data;
}

/** Archive = status change. No hard delete: notes/tasks may point here. */
export async function archiveProject(id: string): Promise<void> {
  await updateProject(id, { status: "archived" });
}
