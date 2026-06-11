"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  archiveProject,
  createProject,
  updateProject,
  type ProjectStatus,
} from "@/lib/db/projects";

export type FormState = { error?: string };

const STATUSES: ProjectStatus[] = ["active", "paused", "archived"];

export async function createProjectAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const area_id = String(formData.get("area_id") ?? "").trim() || null;

  if (!name) return { error: "Name is required." };

  let id: string;
  try {
    const project = await createProject({ name, description, area_id });
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

  if (!id) return { error: "Missing project id." };
  if (!name) return { error: "Name is required." };
  if (!STATUSES.includes(status as ProjectStatus)) {
    return { error: "Invalid status." };
  }

  try {
    await updateProject(id, {
      name,
      description: description || null,
      status: status as ProjectStatus,
      area_id,
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
