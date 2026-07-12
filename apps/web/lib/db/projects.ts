import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import * as shared from "@second-brain/shared/db/projects";
import type {
  Availability,
  Project,
  ProjectStatus,
  ProjectWithStats,
} from "@second-brain/shared/db/projects";

/**
 * Thin Next adapter over the shared projects module: resolve the request's
 * client/org/user here, keep query logic in @second-brain/shared/db/projects.
 */

export type {
  Availability,
  Project,
  ProjectStats,
  ProjectStatus,
  ProjectWithStats,
} from "@second-brain/shared/db/projects";

export async function listProjects(opts?: {
  includeArchived?: boolean;
}): Promise<Project[]> {
  return shared.listProjects(createClient(), await getCurrentOrgId(), opts);
}

export async function listProjectsWithStats(opts?: {
  includeArchived?: boolean;
}): Promise<ProjectWithStats[]> {
  return shared.listProjectsWithStats(createClient(), await getCurrentOrgId(), opts);
}

export async function getProject(id: string): Promise<Project | null> {
  return shared.getProject(createClient(), await getCurrentOrgId(), id);
}

export async function createProject(input: {
  name: string;
  description?: string;
  area_id?: string | null;
  color?: string | null;
}): Promise<Project> {
  const user = await requireUser();
  return shared.createProject(createClient(), await getCurrentOrgId(), user.id, input);
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
  return shared.updateProject(createClient(), await getCurrentOrgId(), id, input);
}

export async function archiveProject(id: string): Promise<void> {
  return shared.archiveProject(createClient(), await getCurrentOrgId(), id);
}
