/**
 * One-time backfill: populate notes.body_text (the plaintext search/preview
 * shadow) for rows written before the shadow existed. From this point on,
 * every write path derives body_text (shared createNote/updateNote + the
 * capture-pipeline sites), so this only touches rows where it is still NULL —
 * idempotent, safe to re-run. Data-only: no schema change, RLS untouched
 * (service role, same as the other ops scripts).
 *
 * Run (repo root):  node --env-file=apps/web/.env.local scripts/backfill-body-text.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const HERE = dirname(fileURLToPath(import.meta.url));

/** Same in-memory TS loader the token generator uses (import-free modules). */
async function loadTsModule(path) {
  const src = readFileSync(path, "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import("data:text/javascript;charset=utf-8," + encodeURIComponent(js));
}

const { stripMarkdownToText } = await loadTsModule(
  join(HERE, "..", "packages", "shared", "src", "domain", "markdown.ts"),
);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing env. Run with: node --env-file=apps/web/.env.local scripts/backfill-body-text.mjs",
  );
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const BATCH = 200;
let updated = 0;
let failed = 0;

for (;;) {
  const { data: rows, error } = await db
    .from("notes")
    .select("id, body")
    .is("body_text", null)
    .limit(BATCH);
  if (error) {
    console.error("select failed:", error.message);
    process.exit(1);
  }
  if (!rows || rows.length === 0) break;

  for (const row of rows) {
    const { error: upErr } = await db
      .from("notes")
      .update({ body_text: stripMarkdownToText(row.body ?? "") })
      .eq("id", row.id);
    if (upErr) {
      failed += 1;
      console.error(`  ${row.id}: ${upErr.message}`);
    } else {
      updated += 1;
    }
  }
  // A body that strips to empty ("") is not NULL, so progress is guaranteed.
  if (rows.length < BATCH) break;
}

console.log(`backfill done: ${updated} notes updated, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
