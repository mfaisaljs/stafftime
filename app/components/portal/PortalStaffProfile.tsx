import { Form, Link } from "react-router";
import { PortalBadge, portalTabClass } from "./PortalShell";
import { portalHref } from "../../utils/portal-path";

export const PROFILE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "shifts", label: "Shifts" },
  { id: "payroll", label: "Payroll" },
] as const;

export const DAY_PRESETS = [7, 30, 90] as const;

export type PortalProfileTab = (typeof PROFILE_TABS)[number]["id"];

type ProfileShift = {
  id: string;
  dateLabel: string;
  timeRangeLabel: string;
  locationName: string;
  badge: string;
  tone: "info" | "neutral" | "success" | "critical";
  cancelledForLeave: boolean;
};

export type PortalProfilePayload = {
  range: { start: string; end: string; days: number };
  overview: {
    totalHours: string;
    workingHours: string;
    breakTime: string;
    absentDays: number;
    baseEarnings: string;
    salaryAdjustment: string;
    totalCommission: string;
    totalEarnings: string;
    paidAmount: string;
    remainingAmount: string;
  };
  payroll: {
    baseEarnings: string;
    salaryAdjustment: string;
    commission: string;
    totalEarnings: string;
    unpaidSalary: string;
    unpaidCommission: string;
  };
  shifts: {
    upcoming: ProfileShift[];
    past: ProfileShift[];
  };
};

export function parsePortalProfileTab(value: string | null): PortalProfileTab {
  if (value === "shifts" || value === "payroll") return value;
  return "overview";
}

export function parsePortalRangeParams(url: URL) {
  const start = url.searchParams.get("start")?.trim() || undefined;
  const end = url.searchParams.get("end")?.trim() || undefined;
  const daysRaw = Number(url.searchParams.get("days") || "");
  const days = DAY_PRESETS.includes(daysRaw as (typeof DAY_PRESETS)[number])
    ? daysRaw
    : undefined;
  return { start, end, days };
}

export function rangeForDays(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  return { start: toDateKey(start), end: toDateKey(end), days };
}

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function matchingPreset(start: string, end: string) {
  return (
    DAY_PRESETS.find((preset) => {
      const range = rangeForDays(preset);
      return range.start === start && range.end === end;
    }) ?? 0
  );
}

function MetricRow(props: { label: string; value: string }) {
  return (
    <div className="portal-metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function ShiftRow(props: { shift: ProfileShift }) {
  const { shift } = props;
  const cancelled = Boolean(shift.cancelledForLeave);
  return (
    <div className={`portal-row${cancelled ? " cancelled" : ""}`}>
      <div>
        <strong>{shift.dateLabel}</strong>
        <div className="portal-muted">
          {shift.timeRangeLabel} · {shift.locationName}
        </div>
      </div>
      <PortalBadge tone={cancelled ? "critical" : shift.tone}>
        {shift.badge}
      </PortalBadge>
    </div>
  );
}

export function PortalStaffProfile(props: {
  shopDomain: string;
  pathname: string;
  tab: PortalProfileTab;
  profile: PortalProfilePayload;
  extraParams?: Record<string, string | undefined>;
}) {
  const { shopDomain, pathname, tab, profile, extraParams } = props;
  const days = profile.range.days || matchingPreset(profile.range.start, profile.range.end);
  const query = {
    ...extraParams,
    start: profile.range.start,
    end: profile.range.end,
    days: days > 0 ? String(days) : undefined,
  };

  return (
    <>
      <div className="portal-panel">
        <h2>Date range</h2>
        <Form method="get" action={pathname} className="portal-range">
          <input type="hidden" name="ShopDomain" value={shopDomain} />
          {Object.entries(extraParams ?? {}).map(([key, value]) =>
            value ? (
              <input key={key} type="hidden" name={key} value={value} />
            ) : null,
          )}
          <input type="hidden" name="tab" value={tab} />
          <div className="portal-range-dates">
            <label>
              Start date
              <input
                type="date"
                name="start"
                defaultValue={profile.range.start}
                required
              />
            </label>
            <label>
              End date
              <input
                type="date"
                name="end"
                defaultValue={profile.range.end}
                required
              />
            </label>
          </div>
          <div className="portal-tabs">
            {DAY_PRESETS.map((preset) => {
              const range = rangeForDays(preset);
              return (
                <Link
                  key={preset}
                  className={portalTabClass(days === preset)}
                  to={portalHref(pathname, shopDomain, {
                    ...extraParams,
                    tab,
                    start: range.start,
                    end: range.end,
                    days: String(preset),
                  })}
                >
                  {preset} days
                </Link>
              );
            })}
          </div>
          <button className="portal-btn" type="submit">
            Update data
          </button>
        </Form>
      </div>

      <div className="portal-tabs">
        {PROFILE_TABS.map((item) => (
          <Link
            key={item.id}
            className={portalTabClass(tab === item.id)}
            to={portalHref(pathname, shopDomain, {
              ...query,
              tab: item.id,
            })}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="portal-panel">
          <h2>Hours summary</h2>
          <MetricRow label="Total hours" value={profile.overview.totalHours} />
          <MetricRow label="Working hours" value={profile.overview.workingHours} />
          <MetricRow label="Break time" value={profile.overview.breakTime} />
          <h2>Attendance</h2>
          <MetricRow
            label="Absent days"
            value={String(profile.overview.absentDays)}
          />
          <h2>Earnings summary</h2>
          <MetricRow label="Base earnings" value={profile.overview.baseEarnings} />
          <MetricRow
            label="Salary adjustments"
            value={profile.overview.salaryAdjustment}
          />
          <MetricRow
            label="Total commission"
            value={profile.overview.totalCommission}
          />
          <MetricRow
            label="Total earnings"
            value={profile.overview.totalEarnings}
          />
          <MetricRow label="Paid amount" value={profile.overview.paidAmount} />
          <MetricRow
            label="Remaining amount"
            value={profile.overview.remainingAmount}
          />
        </div>
      ) : null}

      {tab === "shifts" ? (
        <>
          <div className="portal-panel">
            <h2>Upcoming shifts</h2>
            {profile.shifts.upcoming.length === 0 ? (
              <p className="portal-muted">No upcoming shifts.</p>
            ) : (
              profile.shifts.upcoming.map((shift) => (
                <ShiftRow key={shift.id} shift={shift} />
              ))
            )}
          </div>
          <div className="portal-panel">
            <h2>Past shifts</h2>
            {profile.shifts.past.length === 0 ? (
              <p className="portal-muted">No past shifts in this range.</p>
            ) : (
              profile.shifts.past.map((shift) => (
                <ShiftRow key={shift.id} shift={shift} />
              ))
            )}
          </div>
        </>
      ) : null}

      {tab === "payroll" ? (
        <div className="portal-panel">
          <h2>Earnings summary</h2>
          <MetricRow label="Base earnings" value={profile.payroll.baseEarnings} />
          <MetricRow
            label="Salary adjustments"
            value={profile.payroll.salaryAdjustment}
          />
          <MetricRow label="Commission" value={profile.payroll.commission} />
          <MetricRow
            label="Total earnings"
            value={profile.payroll.totalEarnings}
          />
          <h2>Unpaid details</h2>
          <MetricRow label="Unpaid salary" value={profile.payroll.unpaidSalary} />
          <MetricRow
            label="Unpaid commission"
            value={profile.payroll.unpaidCommission}
          />
        </div>
      ) : null}
    </>
  );
}
