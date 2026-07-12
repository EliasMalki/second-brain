import { redirect } from "next/navigation";

/**
 * The task detail is now the in-page panel (mockup v4). This route just deep-
 * links into it so old links/bookmarks open the selected task in the workspace.
 */
export default function TaskDetailRedirect({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/tasks?task=${params.id}`);
}
