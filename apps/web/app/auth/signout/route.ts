import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Sign out, then redirect to /login. POST-only so a link can't trigger it. */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  await supabase.auth.signOut();
  // 303 forces the browser to GET /login after the POST.
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
