"use server";

import { revalidatePath } from "next/cache";
import { createReceipt, deleteReceipt } from "@/lib/db/receipts";

export type FormState = { error?: string };

function revalidateScope(projectId: string, recordId: string) {
  if (projectId) revalidatePath(`/projects/${projectId}`);
  if (recordId) revalidatePath(`/records/${recordId}`);
}

export async function createReceiptAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const projectId = String(formData.get("project_id") ?? "");
  const recordId = String(formData.get("record_id") ?? "");
  const rawAmount = String(formData.get("amount") ?? "").trim();
  const currency = (String(formData.get("currency") ?? "").trim() || "CAD")
    .toUpperCase();
  const vendor = String(formData.get("vendor") ?? "").trim();
  const purchasedOn = String(formData.get("purchased_on") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const photoEntry = formData.get("photo");
  const photo = photoEntry instanceof File ? photoEntry : null;

  const amount = Number(rawAmount.replace(/[$,\s]/g, ""));
  if (!rawAmount || !Number.isFinite(amount)) {
    return { error: "Amount must be a number." };
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { error: "Currency must be a 3-letter code (e.g. CAD)." };
  }

  try {
    await createReceipt({
      amount,
      currency,
      vendor: vendor || null,
      purchasedOn: purchasedOn || null,
      note: note || null,
      projectId: projectId || null,
      recordId: recordId || null,
      photo,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save." };
  }

  revalidateScope(projectId, recordId);
  return {};
}

export async function deleteReceiptAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await deleteReceipt(id);
  revalidateScope(
    String(formData.get("project_id") ?? ""),
    String(formData.get("record_id") ?? ""),
  );
}
