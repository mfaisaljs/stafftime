import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { ChevronLeft, ChevronRight, FileSpreadsheet } from "lucide-react";
import { requirePortalFeature } from "../utils/portal-auth.server";
import { getPortalTimesheet } from "../services/portal.server";
import { portalHref } from "../utils/portal-path";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const context = await requirePortalFeature(request, "timesheet");
  const url = new URL(request.url);
  const timesheet = await getPortalTimesheet({
    shopDomain: context.shop.domain,
    employeeId: context.employee.id,
    month: url.searchParams.get("month") ?? undefined,
  });
  return { shopDomain: context.shop.domain, timesheet };
};

export default function PortalTimesheetPage() {
  const { shopDomain, timesheet } = useLoaderData<typeof loader>();
  const hrefFor = (month: string) =>
    portalHref("/portal/timesheet", shopDomain, { month });

  return (
    <div className="ts-page">
      <div className="ts-top">
        <div>
          <h1 className="portal-kicker">Timesheet</h1>
          <p className="ts-name">{timesheet.employeeName}</p>
        </div>
        <span className="ts-monthly">
          <FileSpreadsheet size={16} />
          Monthly Timesheets
        </span>
      </div>

      <div className="ts-month-nav">
        <Link
          className="ts-nav-btn"
          to={hrefFor(timesheet.prevMonth)}
          aria-label="Previous month"
        >
          <ChevronLeft size={18} />
        </Link>
        <h2 className="ts-month-label">{timesheet.monthLabel}</h2>
        <Link
          className="ts-nav-btn"
          to={hrefFor(timesheet.nextMonth)}
          aria-label="Next month"
        >
          <ChevronRight size={18} />
        </Link>
      </div>

      <div className="ts-total-bar">
        <span>Month total</span>
        <strong>{timesheet.totalHoursLabel}</strong>
      </div>

      <div className="ts-cal">
        <div className="ts-cal-head">
          {WEEKDAYS.map((label, index) => (
            <div key={`${label}-${index}`}>{label}</div>
          ))}
          <div>Total</div>
        </div>
        {timesheet.weeks.map((week) => (
          <div className="ts-cal-row" key={week.days[0]?.dateKey}>
            {week.days.map((day) => (
              <div
                key={day.dateKey}
                className={`ts-cell${day.inMonth ? "" : " outside"}${day.isToday ? " today" : ""}${day.paidSeconds > 0 ? " has-time" : ""}`}
              >
                <span className="ts-daynum">{day.day}</span>
                <span className="ts-hours">{day.hoursLabel}</span>
              </div>
            ))}
            <div className="ts-cell ts-week-total">
              <span className="ts-hours">{week.totalLabel}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
