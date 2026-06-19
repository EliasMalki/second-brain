import { listProjects } from "@/lib/db/projects";
import {
  listBacklogTasks,
  listOverdueTasks,
  listTasksScheduledBetween,
  partitionByAvailability,
  type Task,
} from "@/lib/db/tasks";
import { TaskRow } from "./tasks/task-row";
import { ProjectTag } from "./project-tag";
import { QuickWins, type FocusItem } from "./quick-wins";
import { BacklogPool } from "./backlog-pool";
import { BriefCard } from "./brief-card";
import { CalendarToday } from "./calendar-today";
import { EmptyState } from "./empty-state";
import { SaveViewSnapshot } from "./view-snapshot";
import { getFirstOpenBrief } from "@/lib/db/brief";
import { getTodayEvents, type TodayCalendar } from "@/lib/db/calendar";
import { addDaysISO, isBusinessHoursNow, todayISO } from "@/lib/dates";

/**
 * Home hub — the landing page after login. One scrolling column: greeting,
 * first-open daily brief, the "Got time?" control over the Today focus block,
 * a This-week peek, and the backlog pool. Consolidates the former Today and
 * This-week pages; Tasks stays its own page. Reuses the existing queries.
 */
export default async function HomePage() {
  const today = todayISO();
  const [allOverdue, allTodays, upcoming, backlog, projects, brief, calendar] =
    await Promise.all([
      listOverdueTasks(),
      listTasksScheduledBetween(today, today),
      listTasksScheduledBetween(addDaysISO(today, 1), addDaysISO(today, 7)),
      listBacklogTasks(),
      listProjects({ includeArchived: true }),
      getFirstOpenBrief(),
      // getTodayEvents never throws, but guard anyway so a calendar hiccup can
      // never reject this Promise.all and crash the whole Today page.
      getTodayEvents().catch((): TodayCalendar => ({ status: "error" })),
    ]);

  // Availability-aware (BUILD_SPEC §5): outside 9–5, business-hours tasks move
  // to their own hidden section instead of cluttering the actionable list.
  const now = new Date();
  const inHours = isBusinessHoursNow(now);
  const [overdueSplit, todaySplit] = await Promise.all([
    partitionByAvailability(allOverdue, inHours),
    partitionByAvailability(allTodays, inHours),
  ]);
  const overdue = overdueSplit.available;
  const todays = todaySplit.available;
  const offHours = [...overdueSplit.offHours, ...todaySplit.offHours];
  const projectName = (id: string | null) =>
    projects.find((p) => p.id === id)?.name ?? null;
  const projectColor = (id: string | null) =>
    projects.find((p) => p.id === id)?.color ?? null;

  // "Start here" = the urgent stuff (overdue + today's A/B); "Also today" = the
  // rest. Identical to the former Today view — just relocated.
  const isAB = (t: Task) => t.priority === "A" || t.priority === "B";
  const focus = [...overdue, ...todays.filter(isAB)];
  const also = todays.filter((t) => !isAB(t));

  // Everything in focus/also already passed the availability split, so each is
  // doable right now — carry that to the quick-wins filter explicitly.
  const focusItems: FocusItem[] = [
    ...focus.map((t) => ({
      id: t.id,
      section: "focus" as const,
      effort: t.effort,
      doableNow: true,
      node: (
        <TaskRow
          task={t}
          projectName={projectName(t.project_id)}
          projectColor={projectColor(t.project_id)}
        />
      ),
    })),
    ...also.map((t) => ({
      id: t.id,
      section: "also" as const,
      effort: t.effort,
      doableNow: true,
      node: (
        <TaskRow
          task={t}
          projectName={projectName(t.project_id)}
          projectColor={projectColor(t.project_id)}
          showScheduled={false}
        />
      ),
    })),
  ];

  const partOfDay =
    now.getHours() < 12
      ? "morning"
      : now.getHours() < 17
        ? "afternoon"
        : "evening";
  const fullDate = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const weekdayShort = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
      weekday: "short",
    });

  return (
    <>
      <div className="view-head">
        <span className="view-title">Good {partOfDay}</span>
        <span className="view-sub">{fullDate}</span>
        {!inHours ? (
          <span className="tag spacer">
            <i className="ti ti-moon" aria-hidden="true" /> after-hours
          </span>
        ) : null}
      </div>

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

      <CalendarToday data={calendar} />

      <div className="stack" style={{ marginTop: "var(--space-6)" }}>
        {/* Today focus block, fronted by the "Got time?" quick-wins control */}
        {focusItems.length > 0 ? (
          <QuickWins items={focusItems} />
        ) : offHours.length === 0 ? (
          <EmptyState
            icon="ti-sunset-2"
            title="Nothing scheduled — enjoy the quiet, or add something."
          />
        ) : null}

        {offHours.length > 0 ? (
          <section>
            <div className="muted-note">
              <i className="ti ti-eye-off" aria-hidden="true" />
              {offHours.length} task{offHours.length === 1 ? "" : "s"} hidden
              until business hours
            </div>
            <ul className="tasks" style={{ opacity: 0.6 }}>
              {offHours.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  projectName={projectName(t.project_id)}
                  projectColor={projectColor(t.project_id)}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {/* This week — a glance, not the full manager (that's Tasks) */}
        {upcoming.length > 0 ? (
          <section className="peek">
            <p className="section-label">
              <i className="ti ti-calendar-week" aria-hidden="true" /> This week
            </p>
            {upcoming.map((t, i) => {
              const iso = t.scheduled_for ?? today;
              const prev = upcoming[i - 1]?.scheduled_for ?? null;
              const showDay = i === 0 || iso !== prev;
              return (
                <div className="peek-row" key={t.id}>
                  <span className="day">{showDay ? weekdayShort(iso) : ""}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>{t.title}</span>
                  {projectName(t.project_id) ? (
                    <ProjectTag
                      name={projectName(t.project_id)!}
                      color={projectColor(t.project_id)}
                    />
                  ) : null}
                </div>
              );
            })}
          </section>
        ) : null}

        {/* Backlog pool — undated, no due date: stuff to pull from */}
        {backlog.length > 0 ? (
          <section className="peek">
            <p className="section-label">
              <i className="ti ti-stack-2" aria-hidden="true" /> Backlog
            </p>
            <BacklogPool
              items={backlog.map((t) => ({
                id: t.id,
                title: t.title,
                project: projectName(t.project_id),
              }))}
            />
          </section>
        ) : null}
      </div>
    </>
  );
}
