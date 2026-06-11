"use server";

import { revalidatePath } from "next/cache";
import { captureText } from "@/lib/db/captures";

export type CaptureState = { error?: string; noteId?: string };

export async function captureAction(
  _prev: CaptureState,
  formData: FormData,
): Promise<CaptureState> {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: "Nothing to capture." };

  try {
    const { noteId } = await captureText(text);
    revalidatePath("/notes");
    return { noteId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Capture failed." };
  }
}
