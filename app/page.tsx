import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const user = await requireUser();

  // Reading your own org proves the full chain end-to-end: the session is live,
  // the signup trigger created your personal org + membership, and the RLS
  // org_member_read policy lets you (and only you) see it.
  const supabase = createClient();
  const { data: orgs } = await supabase
    .from("organizations")
    .select("name")
    .limit(1);
  const orgName = orgs?.[0]?.name ?? "—";

  return (
    <main>
      <h1>Second Brain</h1>
      <p>
        Signed in as <strong>{user.email}</strong>
      </p>
      <p>
        Your space: <strong>{orgName}</strong>
      </p>
      <form action="/auth/signout" method="post">
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
