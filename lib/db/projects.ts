import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import type { Database } from "@/lib/database.types";

export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type ProjectStatus = Database["public"]["Enums"]["project_status"];

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
