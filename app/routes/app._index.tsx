import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link, useLoaderData } from "react-router";
import {
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Headphones,
  MessageCircle,
  X,
} from "lucide-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  AttendanceBoard,
  resolveAttendanceDateRange,
} from "../components/attendance/AttendanceBoard";
import {
  ensureShop,
  getAttendanceBoard,
} from "../services/workforce.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const dateRange = resolveAttendanceDateRange(url.searchParams);
  const shop = await ensureShop(session.shop);
  const [board, recentEntries] = await Promise.all([
    getAttendanceBoard(session.shop, {
      start: dateRange.start,
      end: dateRange.end,
    }),
    prisma.timeEntry.findMany({
      where: { shopId: shop.id },
      include: {
        employee: { select: { firstName: true, lastName: true } },
        location: { select: { name: true } },
      },
      orderBy: { clockInAt: "desc" },
      take: 12,
    }),
  ]);

  const recentActivity = recentEntries.map((entry) => {
    const clockedOut = Boolean(entry.clockOutAt);
    const activityAt = entry.clockOutAt ?? entry.clockInAt;
    return {
      id: entry.id,
      employeeId: entry.employeeId,
      staffName: `${entry.employee.firstName} ${entry.employee.lastName}`.trim(),
      initials:
        `${entry.employee.firstName.charAt(0)}${entry.employee.lastName.charAt(0)}`.toUpperCase(),
      location: entry.location.name,
      status: clockedOut ? "CLOCKED_OUT" : "CLOCKED_IN",
      statusLabel: clockedOut ? "Clocked Out" : "Clocked In",
      activityAt: activityAt.toISOString(),
      activityLabel: activityAt.toLocaleString(undefined, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
      message: entry.notes?.trim() || null,
    };
  });

  return { dateRange, recentActivity, ...board };
};

export default function DashboardPage() {
  const { dateRange, live, timeFormat, metrics, rows, recentActivity } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="Dashboard" inlineSize="large">
      <div className="dashboard-page">
        <SetupGuide />

        <AttendanceBoard
          basePath="/app"
          dateRange={dateRange}
          live={live}
          timeFormat={timeFormat}
          metrics={metrics}
          rows={rows}
        />

        <RecentActivity rows={recentActivity} />

        <div className="support-cards">
          <SupportCard
            icon={<BookOpen size={22} />}
            title="Documentation"
            description="Guides for staff, scheduling, payroll, and POS clock workflows."
            href="https://shopify.dev/docs/apps"
            actionLabel="Read More"
          />
          <SupportCard
            icon={<CalendarDays size={22} />}
            title="Book Consultation"
            description="Talk with our team about rollout, payroll, and workforce setup."
            href="mailto:support@example.com?subject=StaffTime%20consultation"
            actionLabel="Book Now"
          />
          <SupportCard
            icon={<Headphones size={22} />}
            title="Live Support"
            description="Get help with clock-in issues, settings, and day-to-day questions."
            href="mailto:support@example.com?subject=StaffTime%20support"
            actionLabel="Chat Now"
          />
        </div>
      </div>

      <style>{DASHBOARD_STYLES}</style>
    </s-page>
  );
}

function SetupGuide() {
  const storageKey = "stafftime.setupGuide.v1";
  const [ready, setReady] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [done, setDone] = useState<Record<SetupStepId, boolean>>({
    portal: false,
    enroll: false,
    pos: false,
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          collapsed?: boolean;
          dismissed?: boolean;
          done?: Partial<Record<SetupStepId, boolean>>;
        };
        setCollapsed(Boolean(parsed.collapsed));
        setDismissed(Boolean(parsed.dismissed));
        setDone({
          portal: Boolean(parsed.done?.portal),
          enroll: Boolean(parsed.done?.enroll),
          pos: Boolean(parsed.done?.pos),
        });
      }
    } catch {
      // ignore storage errors
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ collapsed, dismissed, done }),
      );
    } catch {
      // ignore storage errors
    }
  }, [collapsed, dismissed, done, ready]);

  const steps = SETUP_STEPS;
  const completedCount = steps.filter((step) => done[step.id]).length;
  const total = steps.length;
  const percent = Math.round((completedCount / total) * 100);
  const allDone = completedCount === total;

  if (dismissed) return null;

  return (
    <section className="setup-guide">
      <div className="setup-guide-hero">
        <div className="setup-guide-hero-copy">
          <div className="setup-guide-title-row">
            <strong>Setup Guide</strong>
            <span className={`setup-guide-badge${allDone ? " complete" : ""}`}>
              {allDone ? "COMPLETE" : "ALMOST THERE"}
            </span>
          </div>
          <p>Finish these steps to get started</p>
        </div>
        <div className="setup-guide-hero-actions">
          <a
            className="setup-learn-more"
            href="https://shopify.dev/docs/apps"
            target="_blank"
            rel="noreferrer"
          >
            Learn More
          </a>
          <button
            type="button"
            className="setup-icon-btn"
            aria-label={collapsed ? "Expand setup guide" : "Collapse setup guide"}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
          <button
            type="button"
            className="setup-icon-btn"
            aria-label="Dismiss setup guide"
            onClick={() => setDismissed(true)}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!collapsed ? (
        <div className="setup-guide-body">
          <div className="setup-progress-row">
            <span>
              Your progress: {completedCount} / {total} Completed
            </span>
            <span>{percent}%</span>
          </div>
          <div
            className="setup-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div
              className="setup-progress-fill"
              style={{ width: `${Math.max(percent, percent > 0 ? 2 : 0)}%` }}
            />
          </div>

          <ul className="setup-steps">
            {steps.map((step) => {
              const isDone = done[step.id];
              return (
                <li
                  key={step.id}
                  className={`setup-step${isDone ? " done" : ""}`}
                >
                  <span
                    className={`setup-step-icon${isDone ? " done" : ""}`}
                    aria-hidden="true"
                  >
                    {isDone ? <Check size={14} /> : <CircleAlert size={14} />}
                  </span>
                  <div className="setup-step-body">
                    <strong>{step.title}</strong>
                    <p>{step.description}</p>
                    <div className="setup-step-actions">
                      {step.actions.map((action) =>
                        action.external ? (
                          <a
                            key={action.label}
                            className="setup-secondary-link"
                            href={action.href}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {action.label}
                          </a>
                        ) : (
                          <s-button
                            key={action.label}
                            href={action.href}
                            variant="secondary"
                          >
                            {action.label}
                          </s-button>
                        ),
                      )}
                      <s-button
                        variant="primary"
                        onClick={() =>
                          setDone((prev) => ({
                            ...prev,
                            [step.id]: !prev[step.id],
                          }))
                        }
                      >
                        {isDone ? "Undo" : "Mark as Done"}
                      </s-button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

type SetupStepId = "portal" | "enroll" | "pos";

const SETUP_STEPS: Array<{
  id: SetupStepId;
  title: string;
  description: string;
  actions: Array<{ label: string; href: string; external?: boolean }>;
}> = [
  {
    id: "portal",
    title: "View Web Portal",
    description: "Access the staff web portal to manage your team.",
    actions: [
      { label: "View Portal", href: "/app/staff" },
      {
        label: "Help Guide",
        href: "https://shopify.dev/docs/apps",
        external: true,
      },
    ],
  },
  {
    id: "enroll",
    title: "Enroll your staff in the app",
    description: "Enroll staff to clock in.",
    actions: [{ label: "Setup", href: "/app/staff/new" }],
  },
  {
    id: "pos",
    title: "Add app to Shopify POS",
    description: "Add block to your POS system.",
    actions: [{ label: "Add App", href: "/app/settings" }],
  },
];

function RecentActivity({
  rows,
}: {
  rows: Array<{
    id: string;
    employeeId: string;
    staffName: string;
    initials: string;
    location: string;
    status: string;
    statusLabel: string;
    activityAt: string;
    activityLabel: string;
    message: string | null;
  }>;
}) {
  return (
    <section className="recent-activity">
      <div className="recent-activity-banner">Staff Portal Features</div>
      <div className="recent-activity-card">
        <div className="recent-activity-header">
          <strong>Recent Activity</strong>
        </div>
        <div className="recent-activity-table-wrap">
          <table className="recent-activity-table">
            <thead>
              <tr>
                <th>Staff</th>
                <th>Location</th>
                <th>Status</th>
                <th>Recent Activity</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link
                      className="recent-staff"
                      to={`/app/staff/${row.employeeId}`}
                    >
                      <span className="recent-avatar" aria-hidden="true">
                        {row.initials}
                      </span>
                      <span>{row.staffName}</span>
                    </Link>
                  </td>
                  <td>{row.location}</td>
                  <td>
                    <span
                      className={`recent-status ${
                        row.status === "CLOCKED_IN" ? "in" : "out"
                      }`}
                    >
                      {row.statusLabel}
                    </span>
                  </td>
                  <td>{row.activityLabel}</td>
                  <td>
                    <span
                      className="recent-message"
                      title={row.message ?? "No message"}
                    >
                      <MessageCircle size={16} aria-hidden="true" />
                      <span className="visually-hidden">
                        {row.message ?? "No message"}
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="recent-empty">
                    No recent clock activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function SupportCard({
  icon,
  title,
  description,
  href,
  actionLabel,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
}) {
  return (
    <article className="support-card">
      <div className="support-card-icon" aria-hidden="true">
        {icon}
      </div>
      <strong>{title}</strong>
      <p>{description}</p>
      <a className="support-card-link" href={href} target="_blank" rel="noreferrer">
        {actionLabel}
      </a>
    </article>
  );
}

const DASHBOARD_STYLES = `
  .dashboard-page {
    display: grid;
    gap: 20px;
  }

  .setup-guide,
  .recent-activity-card,
  .support-card {
    background: #fff;
    border: 1px solid #e3e3e3;
    border-radius: 12px;
  }

  .setup-guide {
    overflow: hidden;
    padding: 0;
  }

  .setup-guide-hero {
    align-items: start;
    background:
      radial-gradient(circle at 1px 1px, rgba(13, 122, 61, 0.12) 1px, transparent 0)
        0 0 / 14px 14px,
      linear-gradient(180deg, #eaf7f0 0%, #f4fbf6 100%);
    display: flex;
    gap: 16px;
    justify-content: space-between;
    padding: 18px 18px 16px;
  }

  .setup-guide-hero-copy {
    display: grid;
    gap: 4px;
  }

  .setup-guide-title-row {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .setup-guide-badge {
    background: #111;
    border-radius: 999px;
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 4px 8px;
  }

  .setup-guide-badge.complete {
    background: #0d7a3d;
  }

  .setup-guide-hero-copy p,
  .setup-step-body p,
  .support-card p {
    color: #616161;
    font-size: 13px;
    margin: 0;
  }

  .setup-guide-hero-actions {
    align-items: center;
    display: flex;
    gap: 8px;
  }

  .setup-learn-more {
    color: #2c6ecb;
    font-size: 13px;
    font-weight: 650;
    text-decoration: none;
    white-space: nowrap;
  }

  .setup-icon-btn {
    align-items: center;
    background: #fff;
    border: 1px solid #dcdcdc;
    border-radius: 8px;
    color: #303030;
    cursor: pointer;
    display: inline-flex;
    height: 32px;
    justify-content: center;
    width: 32px;
  }

  .setup-guide-body {
    display: grid;
    gap: 12px;
    padding: 16px 18px 18px;
  }

  .setup-progress-row {
    color: #616161;
    display: flex;
    font-size: 13px;
    justify-content: space-between;
  }

  .setup-progress-track {
    background: #ececec;
    border-radius: 999px;
    height: 6px;
    overflow: hidden;
  }

  .setup-progress-fill {
    background: #0d7a3d;
    height: 100%;
    min-width: 0;
    transition: width 160ms ease;
  }

  .setup-steps {
    display: grid;
    gap: 12px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .setup-step {
    align-items: start;
    background: #fff;
    border: 1px solid #e3e3e3;
    border-radius: 12px;
    display: grid;
    gap: 12px;
    grid-template-columns: auto 1fr;
    padding: 14px;
  }

  .setup-step.done {
    background: #fafafa;
  }

  .setup-step-icon {
    align-items: center;
    background: #fff4e5;
    border-radius: 999px;
    color: #c05700;
    display: inline-flex;
    flex-shrink: 0;
    height: 28px;
    justify-content: center;
    margin-top: 2px;
    width: 28px;
  }

  .setup-step-icon.done {
    background: #eaf7ee;
    color: #0d7a3d;
  }

  .setup-step-body {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .setup-step-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .setup-secondary-link {
    align-items: center;
    background: #fff;
    border: 1px solid #c9cccf;
    border-radius: 8px;
    color: #202223;
    display: inline-flex;
    font-size: 13px;
    font-weight: 550;
    padding: 7px 12px;
    text-decoration: none;
  }

  .recent-activity {
    display: grid;
    gap: 0;
  }

  .recent-activity-banner {
    background: #1f1f1f;
    border-radius: 12px 12px 0 0;
    color: #fff;
    font-size: 14px;
    font-weight: 650;
    padding: 12px 16px;
  }

  .recent-activity-card {
    border-radius: 0 0 12px 12px;
    overflow: hidden;
  }

  .recent-activity-header {
    border-bottom: 1px solid #ececec;
    padding: 14px 16px;
  }

  .recent-activity-table-wrap {
    overflow-x: auto;
  }

  .recent-activity-table {
    border-collapse: collapse;
    min-width: 720px;
    width: 100%;
  }

  .recent-activity-table th,
  .recent-activity-table td {
    border-top: 1px solid #ececec;
    color: #303030;
    font-size: 13px;
    padding: 12px 16px;
    text-align: left;
  }

  .recent-activity-table th {
    background: #fafafa;
    color: #616161;
    font-weight: 600;
  }

  .recent-staff {
    align-items: center;
    color: inherit;
    display: inline-flex;
    gap: 10px;
    text-decoration: none;
  }

  .recent-avatar {
    align-items: center;
    background: #eef0f2;
    border-radius: 999px;
    color: #4a4a4a;
    display: inline-flex;
    font-size: 11px;
    font-weight: 700;
    height: 28px;
    justify-content: center;
    width: 28px;
  }

  .recent-status {
    border-radius: 999px;
    display: inline-flex;
    font-size: 12px;
    font-weight: 650;
    padding: 4px 10px;
  }

  .recent-status.in {
    background: #eaf7ee;
    color: #0d7a3d;
  }

  .recent-status.out {
    background: #fcebea;
    color: #b42318;
  }

  .recent-message {
    color: #616161;
    display: inline-flex;
  }

  .recent-empty {
    color: #616161;
    text-align: center;
  }

  .support-cards {
    display: grid;
    gap: 14px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .support-card {
    display: grid;
    gap: 10px;
    padding: 18px;
  }

  .support-card-icon {
    align-items: center;
    background: #f6f6f7;
    border-radius: 10px;
    color: #303030;
    display: inline-flex;
    height: 40px;
    justify-content: center;
    width: 40px;
  }

  .support-card-link {
    color: #2c6ecb;
    font-size: 13px;
    font-weight: 650;
    text-decoration: none;
  }

  .visually-hidden {
    border: 0;
    clip: rect(0 0 0 0);
    height: 1px;
    margin: -1px;
    overflow: hidden;
    padding: 0;
    position: absolute;
    width: 1px;
  }

  @media (max-width: 900px) {
    .support-cards {
      grid-template-columns: 1fr;
    }
  }
`;

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
