import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { Link, useRevalidator, useSearchParams } from "react-router";
import { Clock, Coffee, UserMinus, UserX } from "lucide-react";
import {
  DateRangeSelector,
  defaultDateRangeValue,
  rangeFromPreset,
  type DateRangeValue,
} from "../DateRangeSelector";
import type { AttendanceStatus } from "../../services/workforce.server";

type StatusFilter =
  | "all"
  | "working"
  | "on_break"
  | "on_leave"
  | "absent"
  | "late";

export type AttendanceBoardRow = {
  id: string;
  name: string;
  initials: string;
  position: string;
  location: string;
  status: AttendanceStatus;
  isLate: boolean;
  clockInAt: string | null;
  shiftStartsAt: string | null;
  entryStatus: string | null;
};

export type AttendanceBoardMetrics = {
  working: number;
  onBreak: number;
  onLeave: number;
  absent: number;
  late: number;
  totalStaff: number;
  pendingApprovals: number;
};

type AttendanceBoardProps = {
  basePath: string;
  dateRange: DateRangeValue;
  live: boolean;
  timeFormat?: "24H" | "12H";
  metrics: AttendanceBoardMetrics;
  rows: AttendanceBoardRow[];
};

export function AttendanceBoard({
  basePath,
  dateRange,
  live,
  timeFormat = "12H",
  metrics,
  rows,
}: AttendanceBoardProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const revalidator = useRevalidator();
  const statusFilter = statusFromParam(searchParams.get("status"));

  useEffect(() => {
    if (!live) return;
    const interval = setInterval(() => {
      if (revalidator.state === "idle") {
        revalidator.revalidate();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [live, revalidator]);

  const filteredRows = useMemo(() => {
    if (statusFilter === "all") return rows;
    if (statusFilter === "late") {
      return rows.filter((row) => row.status === "late" || row.isLate);
    }
    return rows.filter((row) => row.status === statusFilter);
  }, [rows, statusFilter]);

  const applyRange = (next: DateRangeValue) => {
    const params = new URLSearchParams(searchParams);
    if (next.custom) {
      params.set("start", next.start);
      params.set("end", next.end);
      params.delete("days");
    } else {
      params.set("days", String(next.days));
      params.delete("start");
      params.delete("end");
    }
    setSearchParams(params);
  };

  return (
    <div className="attendance-page">
      <div className="attendance-toolbar">
        <DateRangeSelector
          value={dateRange}
          onChange={applyRange}
          includeHiddenInputs={false}
        />
      </div>

      <nav className="attendance-tabs" aria-label="Attendance status filters">
        <StatusTabLink
          basePath={basePath}
          status="all"
          active={statusFilter}
          searchParams={searchParams}
          count={metrics.totalStaff}
        >
          All
        </StatusTabLink>
        <StatusTabLink
          basePath={basePath}
          status="working"
          active={statusFilter}
          searchParams={searchParams}
          count={metrics.working}
        >
          Working
        </StatusTabLink>
        <StatusTabLink
          basePath={basePath}
          status="on_break"
          active={statusFilter}
          searchParams={searchParams}
          count={metrics.onBreak}
        >
          On Break
        </StatusTabLink>
        <StatusTabLink
          basePath={basePath}
          status="on_leave"
          active={statusFilter}
          searchParams={searchParams}
          count={metrics.onLeave}
        >
          On Leave
        </StatusTabLink>
        <StatusTabLink
          basePath={basePath}
          status="absent"
          active={statusFilter}
          searchParams={searchParams}
          count={metrics.absent}
        >
          Absent
        </StatusTabLink>
        <StatusTabLink
          basePath={basePath}
          status="late"
          active={statusFilter}
          searchParams={searchParams}
          count={metrics.late}
        >
          Late
        </StatusTabLink>
      </nav>

      <div className="attendance-metrics">
        <MetricCard
          icon={<Clock size={18} />}
          tone="green"
          label="Working"
          value={String(metrics.working)}
        />
        <MetricCard
          icon={<Coffee size={18} />}
          tone="yellow"
          label="On Break"
          value={String(metrics.onBreak)}
        />
        <MetricCard
          icon={<UserMinus size={18} />}
          tone="blue"
          label="On Leave"
          value={String(metrics.onLeave)}
        />
        <MetricCard
          icon={<UserX size={18} />}
          tone="red"
          label="Absent"
          value={String(metrics.absent)}
        />
        <MetricCard
          icon={<Clock size={18} />}
          tone="blue"
          label="Late"
          value={String(metrics.late)}
        />
      </div>

      <section className="attendance-card table-card">
        <div className="table-scroll">
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Position</th>
                <th>Location</th>
                <th>Status</th>
                <th>Shift start</th>
                <th>Clock in</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className="staff-cell">
                      <span className="avatar">{row.initials}</span>
                      {row.name}
                    </span>
                  </td>
                  <td>{row.position}</td>
                  <td>{row.location}</td>
                  <td>
                    <span className="status-cell">
                      <span className={`status-pill ${row.status}`}>
                        {statusLabel(row.status)}
                      </span>
                      {row.isLate && row.status !== "late" && (
                        <span className="status-pill late">Late</span>
                      )}
                    </span>
                  </td>
                  <td>{formatTime(row.shiftStartsAt, timeFormat)}</td>
                  <td>{formatTime(row.clockInAt, timeFormat)}</td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    No staff match this status for the selected range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <style>{ATTENDANCE_STYLES}</style>
    </div>
  );
}

export function resolveAttendanceDateRange(
  searchParams: URLSearchParams,
): DateRangeValue {
  const start = normalizeDateKey(searchParams.get("start"));
  const end = normalizeDateKey(searchParams.get("end"));
  if (start && end && start <= end) {
    return {
      start,
      end,
      custom: true,
      days: 0,
      label: `${formatShortDate(start)} - ${formatShortDate(end)}`,
    };
  }

  const days = Number(searchParams.get("days"));
  if ([1, 2, 7, 30, 90, 365].includes(days)) {
    return rangeFromPreset(days);
  }

  return defaultDateRangeValue(1);
}

function MetricCard({
  icon,
  tone,
  label,
  value,
}: {
  icon: ReactNode;
  tone: "blue" | "green" | "yellow" | "red";
  label: string;
  value: string;
}) {
  return (
    <div className="metric-card">
      <div className={`metric-icon ${tone}`}>{icon}</div>
      <div className="metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function StatusTabLink({
  basePath,
  status,
  active,
  searchParams,
  count,
  children,
}: {
  basePath: string;
  status: StatusFilter;
  active: StatusFilter;
  searchParams: URLSearchParams;
  count: number;
  children: ReactNode;
}) {
  const next = new URLSearchParams(searchParams);
  if (status === "all") {
    next.delete("status");
  } else {
    next.set("status", status);
  }
  const query = next.toString();
  const href = query ? `${basePath}?${query}` : basePath;
  return (
    <Link
      className={`attendance-tab${status === active ? " active" : ""}`}
      to={href}
    >
      {children}
      <span className="tab-count">{count}</span>
    </Link>
  );
}

function statusFromParam(value: string | null): StatusFilter {
  if (
    value === "working" ||
    value === "on_break" ||
    value === "on_leave" ||
    value === "absent" ||
    value === "late"
  ) {
    return value;
  }
  return "all";
}

function statusLabel(status: AttendanceStatus) {
  switch (status) {
    case "working":
      return "Working";
    case "on_break":
      return "On Break";
    case "on_leave":
      return "On Leave";
    case "absent":
      return "Absent";
    case "late":
      return "Late";
    default:
      return "Off";
  }
}

function formatTime(value: string | null, timeFormat: "24H" | "12H" = "12H") {
  if (!value) return "—";
  const date = new Date(value);
  if (timeFormat === "24H") {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function normalizeDateKey(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function formatShortDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const ATTENDANCE_STYLES = `
  .attendance-page {
    display: grid;
    gap: 18px;
    min-width: 0;
  }

  .attendance-toolbar {
    justify-self: start;
  }

  .attendance-tabs {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .attendance-tab {
    align-items: center;
    border-radius: 8px;
    color: #303030;
    display: inline-flex;
    gap: 8px;
    padding: 8px 14px;
    text-decoration: none;
  }

  .attendance-tab.active {
    background: #e3e3e3;
    font-weight: 650;
  }

  .tab-count {
    background: #f1f1f1;
    border-radius: 999px;
    color: #616161;
    font-size: 12px;
    font-weight: 650;
    min-width: 22px;
    padding: 2px 7px;
    text-align: center;
  }

  .attendance-tab.active .tab-count {
    background: #fff;
  }

  .attendance-metrics {
    display: grid;
    gap: 14px;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .metric-card,
  .attendance-card {
    background: #fff;
    border: 1px solid #e3e3e3;
    border-radius: 12px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    min-width: 0;
  }

  .metric-card {
    align-items: center;
    display: flex;
    min-height: 96px;
    padding: 20px 22px;
    position: relative;
  }

  .metric-icon {
    align-items: center;
    border-radius: 8px;
    display: inline-flex;
    height: 36px;
    justify-content: center;
    position: absolute;
    right: 20px;
    top: 20px;
    width: 36px;
  }

  .metric-icon.blue {
    background: #e8f1ff;
    color: #2c6ecb;
  }

  .metric-icon.green {
    background: #e3f8e8;
    color: #0b6b32;
  }

  .metric-icon.yellow {
    background: #fff4d6;
    color: #8a5700;
  }

  .metric-icon.red {
    background: #fde8e8;
    color: #b91c1c;
  }

  .metric-copy {
    display: grid;
    gap: 6px;
  }

  .metric-copy span {
    color: #616161;
    font-size: 13px;
  }

  .metric-copy strong {
    color: #303030;
    font-size: 28px;
    font-weight: 700;
    line-height: 1.1;
  }

  .table-card {
    overflow: hidden;
  }

  .table-scroll {
    overflow-x: auto;
  }

  .attendance-table {
    border-collapse: collapse;
    min-width: 720px;
    width: 100%;
  }

  .attendance-table th,
  .attendance-table td {
    border-bottom: 1px solid #ebebeb;
    color: #303030;
    padding: 14px 16px;
    text-align: left;
    white-space: nowrap;
  }

  .attendance-table th {
    background: #fafafa;
    color: #616161;
    font-size: 12px;
    font-weight: 650;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .staff-cell {
    align-items: center;
    display: inline-flex;
    gap: 10px;
  }

  .avatar {
    align-items: center;
    background: #e8f1ff;
    border-radius: 999px;
    color: #2c6ecb;
    display: inline-flex;
    font-size: 12px;
    font-weight: 700;
    height: 28px;
    justify-content: center;
    width: 28px;
  }

  .status-cell {
    align-items: center;
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .status-pill {
    border-radius: 999px;
    display: inline-flex;
    font-size: 12px;
    font-weight: 650;
    padding: 4px 10px;
  }

  .status-pill.working {
    background: #e3f8e8;
    color: #0b6b32;
  }

  .status-pill.on_break {
    background: #fff4d6;
    color: #8a5700;
  }

  .status-pill.on_leave {
    background: #e8f0ff;
    color: #1d4ed8;
  }

  .status-pill.absent {
    background: #fde8e8;
    color: #b91c1c;
  }

  .status-pill.late {
    background: #e8f1ff;
    color: #2c6ecb;
  }

  .status-pill.off {
    background: #f1f1f1;
    color: #616161;
  }

  .empty-cell {
    color: #616161;
    text-align: center !important;
  }

  @media (max-width: 900px) {
    .attendance-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 560px) {
    .attendance-metrics {
      grid-template-columns: 1fr;
    }
  }
`;
