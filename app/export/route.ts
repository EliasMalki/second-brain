import JSZip from "jszip";
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import { todayISO } from "@/lib/dates";

/**
 * One-click export (BUILD_SPEC §7) — the user's trust & portability answer.
 * Authenticated, scoped to the caller's org. Produces a zip:
 *   notes/*.md   — every note (incl. archived) as markdown
 *   data.json    — projects, tasks, records, receipts as structured JSON
 */

export const dynamic = "force-dynamic";

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "untitled"
  );
}

function noteMarkdown(note: {
  title: string | null;
  body: string;
  tags: string[];
  created_at: string;
  kind: string;
}): string {
  const header = note.title ? `# ${note.title}\n\n` : "";
  const footer = [
    "",
    "---",
    `created: ${note.created_at}`,
    `kind: ${note.kind}`,
    note.tags.length > 0 ? `tags: ${note.tags.join(", ")}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");
  return `${header}${note.body}\n${footer}\n`;
}

export async function GET(): Promise<Response> {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const fetchAll = async (table: string) => {
    const { data, error } = await supabase
      .from(table as "notes")
      .select("*")
      .eq("org_id", orgId);
    if (error) throw new Error(`export ${table}: ${error.message}`);
    return data as Record<string, unknown>[];
  };

  const [notes, projects, tasks, records, receipts] = await Promise.all([
    fetchAll("notes"),
    fetchAll("projects"),
    fetchAll("tasks"),
    fetchAll("records"),
    fetchAll("receipts"),
  ]);

  const zip = new JSZip();
  const folder = zip.folder("notes")!;
  for (const note of notes) {
    const n = note as unknown as {
      id: string;
      title: string | null;
      body: string;
      tags: string[];
      created_at: string;
      kind: string;
    };
    const name = `${n.created_at.slice(0, 10)}-${slug(
      n.title ?? n.body.slice(0, 40),
    )}-${n.id.slice(0, 8)}.md`;
    folder.file(name, noteMarkdown(n));
  }

  zip.file(
    "data.json",
    JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        org_id: orgId,
        projects,
        tasks,
        records,
        receipts,
      },
      null,
      2,
    ),
  );

  const bytes = await zip.generateAsync({ type: "uint8array" });

  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="second-brain-export-${todayISO()}.zip"`,
    },
  });
}
