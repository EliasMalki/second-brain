import Link from "next/link";
import { listProjects } from "@/lib/db/projects";
import {
  listOverdueTasks,
  listTasksScheduledBetween,
  partitionByAvailability,
  type Task,
} from "@/lib/db/tasks";
import { TaskRow } from "./tasks/task-row";
import { CaptureBox } from "./capture-box";
import { BriefCard } from "./brief-card";
import { SaveViewSnapshot } from "./view-snapshot";
import { getFirstOpenBrief } from "@/lib/db/brief";
import { addDaysISO, isBusinessHoursNow, todayISO } from "@/lib/dates";

export default async function TodayPage() {
  const today = todayISO();
  const [allOverdue, allTodays, upcoming, projects, brief] = await Promise.all([
    listOverdueTasks(),
    listTasksScheduledBetween(today, today),
    listTasksScheduledBetween(addDaysISO(today, 1), addDaysISO(today, 7)),
    listProjects({ includeArchived: true }),
    getFirstOpenBrief(),
  ]);

  // Availability-aware (BUILD_SPEC §5): outside 9–5, business-hours tasks
  // move to their own section instead of cluttering the actionable list.
  const inHours = isBusinessHoursNow();
  const [overdueSplit, todaySplit] = await Promise.all([
    partitionByAvailability(allOverdue, inHours),
    partitionByAvailability(allTodays, inHours),
  ]);
  const overdue = overdueSplit.available;
  const todays = todaySplit.available;
  const offHours = [...overdueSplit.offHours, ...todaySplit.offHours];
  const projectName = (id: string | null) =>
    projects.find((p) => p.id === id)?.name ?? null;

  // "Start here" = the urgent stuff (overdue + today's A/B); "Also today" = the rest.
  const isAB = (t: Task) => t.priority === "A" || t.priority === "B";
  const focus = [...overdue, ...todays.filter(isAB)];
  const also = todays.filter((t) => !isAB(t));

  const now = new Date();
  const weekday = now.toLocaleDateString(undefined, { weekday: "long" });
  const partOfDay =
    now.getHours() < 12 ? "morning" : now.getHours() < 17 ? "afternoon" : "evening";
  const weekdayShort = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" });

  const nothing =
    overdue.length === 0 && todays.length === 0 && offHours.length === 0;
  const peek = upcoming.slice(0, 5);

  return (
    <>
      <div className="view-head">
        <span className="view-title">Today</span>
        <span className="view-sub">
          {weekday} · {partOfDay}
        </span>
        {offHours.length > 0 ? (
          <span className="tag spacer">
            <i className="ti ti-moon" aria-hidden="true" /> after-hours view
          </span>
        ) : null}
      </div>

      <CaptureBox />

      <SaveViewSnapshot
        view="today"
        tasks={[
          ...overdue.map((t) => ({
            title: t.title,
            priority: t.priority,
            section: "overdue",
            project: projectName(t.project_id),
          })),
          ...todays.map((t) => ({
            title: t.title,
            priority: t.priority,
            section: "today",
            project: projectName(t.project_id),
          })),
        ]}
      />

      {brief ? <BriefCard brief={brief} /> : null}

      <div className="stack" style={{ marginTop: "var(--space-6)" }}>
        {nothing ? (
          <div className="card empty">
            Nothing scheduled for today — you&apos;re clear. ✨
            <div style={{ marginTop: "var(--space-3)" }}>
              <Link href="/tasks" className="btn">
                Go to tasks
              </Link>
            </div>
          </div>
        ) : null}

        {focus.length > 0 ? (
          <section>
            <p className="section-label">Start here</p>
            <div className="focus">
              <ul className="tasks">
                {focus.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    projectName={projectName(t.project_id)}
                  />
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {also.length > 0 ? (
          <section>
            <p className="section-label">Also today</p>
            <ul className="tasks">
              {also.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  projectName={projectName(t.project_id)}
                  showScheduled={false}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {offHours.length > 0 ? (
          <section>
            <div className="muted-note">
              <i className="ti ti-eye-off" aria-hidden="true" />
              {offHours.length} task{offHours.length === 1 ? "" : "s"} hidden until
              business hours
            </div>
            <ul className="tasks" style={{ opacity: 0.6 }}>
              {offHours.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  projectName={projectName(t.project_id)}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {peek.length > 0 ? (
          <section className="peek">
            <p className="section-label">
              <i className="ti ti-calendar-week" aria-hidden="true" /> This week
            </p>
            {peek.map((t) => (
              <div className="peek-row" key={t.id}>
                <span className="day">{weekdayShort(t.scheduled_for ?? today)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{t.title}</span>
                {projectName(t.project_id) ? (
                  <span className="tag">{projectName(t.project_id)}</span>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </>
  );
}
