import { redirect } from "next/navigation";

/**
 * Legacy deep link. The full-page note view folded into the workspace
 * (Phase 2A): /notes/<id> now opens the same note inside the three-pane
 * Notes surface, so old links from Inbox / Projects / Search keep working.
 */
export default function NoteDeepLink({ params }: { params: { id: string } }) {
  redirect(`/notes?note=${params.id}`);
}
