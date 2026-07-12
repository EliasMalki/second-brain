"use server";

import { revalidatePath } from "next/cache";
import { deleteReceipt } from "@/lib/db/receipts";

// Manual receipt creation moved to the /api/receipts/manual route handler so the
// optional photo can exceed the 1 MB server-action body limit (see receipt-form.tsx).

function revalidateScope(projectId: string, recordId: string) {
  if (projectId) revalidatePath(`/projects/${projectId}`);
  if (recordId) revalidatePath(`/records/${recordId}`);
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
