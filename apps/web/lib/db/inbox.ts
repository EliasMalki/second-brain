import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import * as shared from "@second-brain/shared/db/inbox";
import type { InboxItem } from "@second-brain/shared/db/inbox";

/**
 * Thin Next adapter over the shared inbox module: resolve the request's
 * client/org here, keep the union logic in @second-brain/shared/db/inbox.
 */

export type { InboxItem } from "@second-brain/shared/db/inbox";

export async function listInbox(): Promise<InboxItem[]> {
  return shared.listInbox(createClient(), await getCurrentOrgId());
}
