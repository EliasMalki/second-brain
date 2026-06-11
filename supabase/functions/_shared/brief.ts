// Daily brief content + email (BUILD_SPEC §5). Same content rules as the
// in-app Today view so the two never disagree:
//   - open tasks scheduled today or earlier (overdue included)
//   - paused/archived projects excluded
//   - A-priority first, then B/C/D
//   - quick wins (effort='quick') called out as their own section
//   - time-aware: business_hours tasks are excluded when the send moment is
//     outside Mon-Fri 9-17 (the email says how many it hid, so nothing is
//     silently lost)
//
// Callers pass a service-role client; every query here filters by org_id by
// hand (BYPASSRLS — the tenancy invariant is enforced in code).

// deno-lint-ignore-file no-explicit-any
type SupabaseClient = any;

export type TaskLite = {
  id: string;
  title: string;
  priority: "A" | "B" | "C" | "D";
  effort: string | null;
  availability: string | null;
  project_id: string | null;
  scheduled_for: string | null;
  due_date: string | null;
};

export type Brief = {
  generatedFor: string;
  taskIds: string[];
  payload: {
    by_priority: Record<"A" | "B" | "C" | "D", TaskLite[]>;
    quick_wins: TaskLite[];
    hidden_business_hours: number;
    project_names: Record<string, string>;
  };
};

function isBusinessHoursNow(now: Date = new Date()): boolean {
  // Server-local time; on Supabase edge this is UTC. v0.5 single-user: the
  // nightly cron fires early morning, so business_hours tasks are listed in
  // the hidden count rather than the action list. Per-user timezones are a
  // settings feature, deferred.
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 17;
}

export async function generateBriefForOrg(
  supabase: SupabaseClient,
  orgId: string,
  today: string,
): Promise<Brief> {
  const { data: projects, error: pErr } = await supabase
    .from("projects")
    .select("id, name, status, availability_default")
    .eq("org_id", orgId);
  if (pErr) throw new Error(`brief projects: ${pErr.message}`);

  const hidden = new Set(
    (projects ?? [])
      .filter((p: any) => p.status === "paused" || p.status === "archived")
      .map((p: any) => p.id),
  );
  const projectDefault = new Map<string, string>(
    (projects ?? []).map((p: any) => [p.id, p.availability_default]),
  );
  const projectNames: Record<string, string> = {};
  for (const p of projects ?? []) projectNames[p.id] = p.name;

  const { data: tasks, error: tErr } = await supabase
    .from("tasks")
    .select(
      "id, title, priority, effort, availability, project_id, scheduled_for, due_date",
    )
    .eq("org_id", orgId)
    .eq("status", "open")
    .lte("scheduled_for", today)
    .order("priority", { ascending: true })
    .order("scheduled_for", { ascending: true });
  if (tErr) throw new Error(`brief tasks: ${tErr.message}`);

  const visible = (tasks ?? []).filter(
    (t: TaskLite) => !t.project_id || !hidden.has(t.project_id),
  );

  const inHours = isBusinessHoursNow();
  const effective = (t: TaskLite) =>
    t.availability ??
    (t.project_id ? projectDefault.get(t.project_id) ?? "anytime" : "anytime");
  const actionable = inHours
    ? visible
    : visible.filter((t: TaskLite) => effective(t) !== "business_hours");
  const hiddenCount = visible.length - actionable.length;

  const byPriority: Brief["payload"]["by_priority"] = {
    A: [],
    B: [],
    C: [],
    D: [],
  };
  for (const t of actionable) byPriority[t.priority as "A"].push(t);

  return {
    generatedFor: today,
    taskIds: actionable.map((t: TaskLite) => t.id),
    payload: {
      by_priority: byPriority,
      quick_wins: actionable.filter((t: TaskLite) => t.effort === "quick"),
      hidden_business_hours: hiddenCount,
      project_names: projectNames,
    },
  };
}

// ---------- email ------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function taskLine(t: TaskLite, names: Record<string, string>): string {
  const project = t.project_id ? names[t.project_id] : null;
  const bits = [project, t.effort === "quick" ? "quick" : null]
    .filter(Boolean)
    .join(" · ");
  return `<li style="margin:4px 0">${esc(t.title)}${
    bits ? ` <span style="color:#888;font-size:13px">— ${esc(bits)}</span>` : ""
  }</li>`;
}

export function renderBriefHtml(brief: Brief): string {
  const { by_priority, quick_wins, hidden_business_hours, project_names } =
    brief.payload;
  const total = brief.taskIds.length;

  const sections: string[] = [];
  for (const prio of ["A", "B", "C", "D"] as const) {
    const tasks = by_priority[prio];
    if (tasks.length === 0) continue;
    sections.push(
      `<h3 style="margin:16px 0 4px">${prio}-priority</h3><ul style="margin:0;padding-left:20px">${tasks
        .map((t) => taskLine(t, project_names))
        .join("")}</ul>`,
    );
  }
  if (quick_wins.length > 0) {
    sections.push(
      `<h3 style="margin:16px 0 4px">Quick wins</h3><ul style="margin:0;padding-left:20px">${quick_wins
        .map((t) => taskLine(t, project_names))
        .join("")}</ul>`,
    );
  }

  return `<div style="font-family:system-ui,sans-serif;max-width:560px">
<h2 style="margin:0 0 4px">Your day — ${brief.generatedFor}</h2>
<p style="margin:0 0 12px;color:#555">${
    total === 0
      ? "Nothing scheduled. Enjoy the slack — or pull something forward."
      : `${total} task${total === 1 ? "" : "s"} on deck.`
  }</p>
${sections.join("\n")}
${
    hidden_business_hours > 0
      ? `<p style="color:#888;font-size:13px;margin-top:16px">${hidden_business_hours} business-hours task${
          hidden_business_hours === 1 ? "" : "s"
        } not shown (outside 9–5).</p>`
      : ""
  }
</div>`;
}

export async function sendBriefEmail(
  email: string,
  name: string,
  brief: Brief,
): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  const from = Deno.env.get("BRIEF_FROM_EMAIL") ??
    "Second Brain <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `Daily brief — ${brief.generatedFor} (${brief.taskIds.length} tasks)`,
      html: renderBriefHtml(brief),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
}
