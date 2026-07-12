import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import * as shared from "@second-brain/shared/db/search";

/**
 * Thin Next adapter over the shared search module: resolve the request's
 * client/org here, keep the query logic in @second-brain/shared/db/search.
 */

export type { SearchHit } from "@second-brain/shared/db/search";

export async function searchAll(query: string): Promise<shared.SearchHit[]> {
  return shared.searchAll(createClient(), await getCurrentOrgId(), query);
}
