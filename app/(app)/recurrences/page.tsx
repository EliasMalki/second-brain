import { redirect } from "next/navigation";

/**
 * The standalone Recurrences page was folded into Tasks (recurrence is now a
 * task option; rule management lives behind the Tasks "Recurring" filter).
 * This redirect keeps old links/bookmarks working.
 */
export default function RecurrencesPage() {
  redirect("/tasks?view=recurring");
}
