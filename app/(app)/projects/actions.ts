"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  archiveProject,
  createProject,
  getProject,
  updateProject,
  type Availability,
  type ProjectStatus,
} from "@/lib/db/projects";
import { createNote, getNote } from "@/lib/db/notes";
import { normalizeStoredColor } from "@/lib/colors";

export type FormState = { error?: string };

const STATUSES: ProjectStatus[] = ["active", "paused", "archived"];
const AVAILABILITIES: Availability[] = ["anytime", "business_hours"];

export async function createProjectAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const area_id = String(formData.get("area_id") ?? "").trim() || null;
  const color = normalizeStoredColor(String(formData.get("color") ?? "").trim());

  if (!name) return { error: "Name is required." };

  let id: string;
  try {
    const project = await createProject({ name, description, area_id, color });
    id = project.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create." };
  }

  revalidatePath("/projects");
  redirect(`/projects/${id}`);
}

export async function updateProjectAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const status = String(formData.get("status") ?? "");
  const area_id = String(formData.get("area_id") ?? "").trim() || null;
  const color = normalizeStoredColor(String(formData.get("color") ?? "").trim());
  const availabilityRaw = String(formData.get("availability_default") ?? "").trim();

  if (!id) return { error: "Missing project id." };
  if (!name) return { error: "Name is required." };
  if (!STATUSES.includes(status as ProjectStatus)) {
    return { error: "Invalid status." };
  }
  const availability_default = AVAILABILITIES.includes(
    availabilityRaw as Availability,
  )
    ? (availabilityRaw as Availability)
    : undefined;

  try {
    await updateProject(id, {
      name,
      description: description || null,
      status: status as ProjectStatus,
      area_id,
      color,
      availability_default,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save." };
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return {};
}

export async function archiveProjectAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await archiveProject(id);
  revalidatePath("/projects");
  redirect("/projects");
}

/** Optimistic status flip (pause/resume/archive/reactivate) from the header
 *  cluster. Revalidates the project pages + the sidebar (root layout). */
export async function setProjectStatusAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !STATUSES.includes(status as ProjectStatus)) return;

  await updateProject(id, { status: status as ProjectStatus });
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  revalidatePath("/", "layout");
}

/**
 * "Start a project from this" (workflow card): create a fresh project seeded
 * with the source project's workflow playbook (and its color/area/description),
 * then open it. Reuses the existing create-project + create-note write paths.
 */
export async function cloneProjectFromWorkflowAction(
  formData: FormData,
): Promise<void> {
  const sourceId = String(formData.get("source_id") ?? "");
  const workflowId = String(formData.get("workflow_id") ?? "");
  if (!sourceId || !workflowId) return;

  const [source, workflow] = await Promise.all([
    getProject(sourceId),
    getNote(workflowId),
  ]);
  if (!source || !workflow) return;

  const project = await createProject({
    name: `${source.name} (copy)`,
    description: source.description ?? undefined,
    area_id: source.area_id,
    color: source.color,
  });
  await createNote({
    body: workflow.body,
    title: workflow.title,
    projectId: project.id,
    kind: "workflow",
    pinned: true,
  });

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}
