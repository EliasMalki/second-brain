import { getUser } from "@/lib/auth";
import { listProjects } from "@/lib/db/projects";
import { getDisplayName } from "@/lib/db/settings";
import { listCompletedTasks, listTasks, type Task } from "@/lib/db/tasks";
import { bucketOf, byPriority } from "@second-brain/shared/domain/buckets";
import { isOverdue, overdueDate } from "@second-brain/shared/domain/buckets";
import { addDaysISO, fmtLate, fmtShort, todayISO } from "@second-brain/shared/domain/dates";
import { getTodayEventsForUser, type TodayCalendar } from "@/lib/db/calendar";
import { getFirstOpenBrief } from "@/lib/db/brief";
import { CaptureBox } from "./capture-box";
import { CalendarToday } from "./calendar-today";
import { LiveClock } from "./live-clock";
import { HomeBrief, type AgendaItem } from "./home-brief";
import { GotTime, type FitItem } from "./got-time";
import { HomeBoard, type BoardCardData, type BoardColumn, type BoardWhen } from "./home-board";
import { SaveViewSnapshot } from "./view-snapshot";

const pad2 = (n: number) => String(n).padStart(2, "0");

function firstName(name: string | undefined, email: string | undefined): string {
  const full = (name ?? "").trim();
  if (full) return full.split(/\s+/)[0];
  const local = (email ?? "").split("@")[0] ?? "";
  const word = local.replace(/[._-]+/g, " ").replace(/\d+/g, "").trim().split(/\s+/)[0];
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : "there";
}

function fmtClock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function weekday(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" });
}

/**
 * Home — the command center. One scrolling column: greeting + metrics pulse,
 * the capture hero (the app's floating dock is suppressed here), a daily-brief
 * card with progress ring + agenda timeline, the "Got time?" fit picker, and the
 * Now / This week / Backlog board. Reuses the existing task queries.
 */
export default async function HomePage() {
  const today = todayISO();
  const [user, displayName, allOpen, projects, completed] = await Promise.all([
    getUser(),
    getDisplayName(),
    listTasks({ status: "open" }),
    listProjects({ includeArchived: true }),
    listCompletedTasks(),
  ]);

  // Today's Google Calendar for the home block (fail-soft), plus restore the
  // first-open-of-day brief logging (stamps briefs_log.shown_at). Both are
  // best-effort: a calendar/brief hiccup must never break the home screen.
  const todayCal: TodayCalendar = user?.id
    ? await getTodayEventsForUser(user.id).catch(
        () => ({ status: "error" }) as TodayCalendar,
      )
    : { status: "error" };
  try {
    await getFirstOpenBrief();
  } catch {
    /* brief logging is best-effort */
  }

  const projectName = (id: string | null) =>
    (id ? projects.find((p) => p.id === id)?.name : null) ?? null;
  const projectColor = (id: string | null) =>
    (id ? projects.find((p) => p.id === id)?.color : null) ?? null;

  // Shared time-buckets (same engine as the Tasks page).
  const byBucket: Record<"overdue" | "today" | "week" | "backlog", Task[]> = {
    overdue: [],
    today: [],
    week: [],
    backlog: [],
  };
  for (const t of allOpen) byBucket[bucketOf(t, today)].push(t);
  const now = [...byBucket.overdue, ...byBucket.today].sort(byPriority); // "Now" column
  const week = [...byBucket.week].sort(byPriority);
  const backlog = [...byBucket.backlog].sort(byPriority);

  // Completed today → drives the ring + the "Done today" metric.
  const doneToday = completed.filter(
    (t) => t.completed_at && new Date(t.completed_at).toLocaleDateString("en-CA") === today,
  );
  const remaining = now.length;
  const donePct =
    doneToday.length + remaining > 0 ? doneToday.length / (doneToday.length + remaining) : 0;

  // ---- metrics ----
  const openCount = allOpen.length;
  const overdueCount = byBucket.overdue.length;
  const quickWins = now.filter((t) => t.effort === "quick").length;

  // ---- greeting ----
  const d = new Date();
  const partOfDay = d.getHours() < 12 ? "morning" : d.getHours() < 17 ? "afternoon" : "evening";
  // Greeting name: the user-set display name (account menu) wins; fall back to
  // auth metadata, then the email local-part.
  const name = firstName(
    displayName ??
      (user?.user_metadata?.name as string | undefined) ??
      (user?.user_metadata?.full_name as string | undefined),
    user?.email ?? undefined,
  );
  const fullDate = d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // ---- agenda (today's plan) ----
  const agendaOpen = [...now].sort((a, b) => {
    const at = a.start_at ? 0 : 1;
    const bt = b.start_at ? 0 : 1;
    if (at !== bt) return at - bt;
    if (a.start_at && b.start_at) return a.start_at.localeCompare(b.start_at);
    return byPriority(a, b);
  });
  const agendaSub = (t: Task): string =>
    isOverdue(t, today) ? "late" : t.effort === "quick" ? "quick" : t.start_at ? "now" : "today";
  const agenda: AgendaItem[] = [
    ...agendaOpen.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      projectName: projectName(t.project_id),
      projectColor: projectColor(t.project_id),
      time: t.start_at ? fmtClock(t.start_at) : "—",
      sub: agendaSub(t),
      done: false,
    })),
    ...doneToday.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      projectName: projectName(t.project_id),
      projectColor: projectColor(t.project_id),
      time: t.start_at ? fmtClock(t.start_at) : "—",
      sub: "done",
      done: true,
    })),
  ].slice(0, 6);

  const headline =
    now.length === 0
      ? "Your day is clear."
      : doneToday.length > 0
        ? "Good momentum — keep it rolling."
        : "You're set up for a strong day.";
  const projSet = Array.from(
    new Set(now.map((t) => projectName(t.project_id)).filter(Boolean)),
  ) as string[];
  const summary =
    now.length === 0
      ? "Nothing on deck. A good moment to pull something from the backlog — or rest."
      : `${now.length} task${now.length === 1 ? "" : "s"} on deck${
          projSet.length > 0 ? ` across ${projSet.slice(0, 2).join(" and ")}` : ""
        }. Start with the top one and the rest opens up.`;
  const momentum =
    doneToday.length > 0
      ? `${doneToday.length} done today${
          doneToday.length >= 3 ? " — best kind of morning" : ""
        }`
      : null;

  // ---- Got time? ----
  const fitItems: FitItem[] = now.map((t) => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    projectName: projectName(t.project_id),
    projectColor: projectColor(t.project_id),
    effort: t.effort,
    overdue: isOverdue(t, today),
  }));

  // ---- board ----
  const boardWhen = (t: Task): BoardWhen | null => {
    if (isOverdue(t, today)) {
      const od = overdueDate(t);
      return { text: od ? fmtLate(od, today) : "late", over: true, icon: "ti-calendar-x" };
    }
    if (t.effort === "quick") return { text: "quick win", over: false, icon: "ti-bolt" };
    if (t.scheduled_for === today || t.due_date === today)
      return { text: "due today", over: true, icon: "ti-calendar-event" };
    if (t.scheduled_for) {
      const within = t.scheduled_for <= addDaysISO(today, 7);
      return {
        text: within ? weekday(t.scheduled_for) : fmtShort(t.scheduled_for),
        over: false,
        icon: "ti-calendar",
      };
    }
    if (t.availability === "business_hours")
      return { text: "9–5", over: false, icon: "ti-briefcase" };
    if (t.due_date) return { text: `due ${fmtShort(t.due_date)}`, over: false, icon: "ti-calendar" };
    return null;
  };
  const toCard = (t: Task): BoardCardData => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    projectName: projectName(t.project_id),
    projectColor: projectColor(t.project_id),
    when: boardWhen(t),
  });

  const BACKLOG_SHOWN = 4;
  const columns: BoardColumn[] = [
    {
      key: "now",
      name: "Now",
      dot: "var(--color-text-danger)",
      count: now.length,
      cards: now.slice(0, 6).map(toCard),
      footer: { label: "Add to Now", href: "/tasks?view=today", icon: "ti-plus" },
    },
    {
      key: "week",
      name: "This week",
      dot: "var(--tech)",
      count: week.length,
      cards: week.slice(0, 6).map(toCard),
      footer: { label: "Plan this week", href: "/tasks?view=week", icon: "ti-calendar-plus" },
    },
    {
      key: "backlog",
      name: "Backlog",
      dot: "var(--color-text-tertiary)",
      count: backlog.length,
      cards: backlog.slice(0, BACKLOG_SHOWN).map(toCard),
      footer:
        backlog.length > BACKLOG_SHOWN
          ? {
              label: `${backlog.length - BACKLOG_SHOWN} more in backlog`,
              href: "/tasks?view=backlog",
              icon: "ti-dots",
            }
          : { label: "Add to Backlog", href: "/tasks?view=backlog", icon: "ti-plus" },
    },
  ];

  return (
    <div className="home2">
      <SaveViewSnapshot
        view="today"
        tasks={now.map((t) => ({
          title: t.title,
          priority: t.priority,
          section: isOverdue(t, today) ? "overdue" : "today",
          project: projectName(t.project_id),
        }))}
      />

      {/* greeting */}
      <div className="h-top">
        <div>
          <h1 className="h-greet">
            Good {partOfDay}, <span className="accentName">{name}</span>
          </h1>
          <p className="h-sub">
            <span>{fullDate}</span>
            <span className="dotsep" />
            <span>{now.length} on deck</span>
            <span className="dotsep" />
            <span>
              {quickWins} quick win{quickWins === 1 ? "" : "s"}
            </span>
          </p>
        </div>
        <div className="h-toprail">
          <LiveClock />
        </div>
      </div>

      {/* metrics pulse */}
      <div className="h-metrics">
        <div className="h-metric tech">
          <div className="mlabel">
            <i className="ti ti-target-arrow" aria-hidden="true" /> Open
          </div>
          <div className="mval">{pad2(openCount)}</div>
        </div>
        <div className="h-metric alert">
          <div className="mlabel">
            <i className="ti ti-alert-triangle" aria-hidden="true" /> Overdue
          </div>
          <div className="mval">{pad2(overdueCount)}</div>
        </div>
        <div className="h-metric">
          <div className="mlabel">
            <i className="ti ti-bolt" aria-hidden="true" /> Quick wins
          </div>
          <div className="mval">{pad2(quickWins)}</div>
        </div>
        <div className="h-metric">
          <div className="mlabel">
            <i className="ti ti-circle-check" aria-hidden="true" /> Done today
          </div>
          <div className="mval">{Math.round(donePct * 100)}%</div>
        </div>
      </div>

      {/* capture hero (the floating dock is suppressed on Home) */}
      <CaptureBox variant="hero" />

      {/* bento: brief + got time */}
      <div className="h-bento">
        <HomeBrief
          pct={donePct}
          headline={headline}
          summary={summary}
          momentum={momentum}
          agenda={agenda}
        />
        <GotTime items={fitItems} />
      </div>

      {/* today's calendar (read-only Google events + connect/reconnect CTA) */}
      <CalendarToday data={todayCal} />

      {/* board */}
      <HomeBoard columns={columns} />
    </div>
  );
}
