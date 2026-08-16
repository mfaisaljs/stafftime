import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { PortalBadge } from "../components/portal/PortalShell";
import { requirePortalFeature } from "../utils/portal-auth.server";
import { getPortalTimesheet } from "../services/portal.server";
import { portalHref } from "../utils/portal-path";

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
  return (
    <>
      <h1 className="portal-kicker">Timesheet</h1>
      <p className="portal-sub">
        {timesheet.employeeName} · {timesheet.monthLabel}
      </p>
      <div className="portal-toolbar">
        <Link
          className="portal-home"
          to={portalHref("/portal/timesheet", shopDomain, {
            month: timesheet.prevMonth,
          })}
        >
          Previous
        </Link>
        <div className="portal-stat">
          <span>Total hours</span>
          <strong>{timesheet.totalHoursLabel}</strong>
        </div>
        <Link
          className="portal-home"
          to={portalHref("/portal/timesheet", shopDomain, {
            month: timesheet.nextMonth,
          })}
        >
          Next
        </Link>
      </div>
      <div className="portal-panel">
        <table className="portal-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Clock in</th>
              <th>Clock out</th>
              <th>Hours</th>
            </tr>
          </thead>
          <tbody>
            {timesheet.days.map((day) => (
              <tr key={day.dateKey}>
                <td>{day.dateLabel}</td>
                <td>{day.clockInLabel}</td>
                <td>{day.clockOutLabel}</td>
                <td>
                  {day.status === "none" ? (
                    <span className="portal-muted">—</span>
                  ) : (
                    <PortalBadge
                      tone={day.status === "open" ? "warning" : "success"}
                    >
                      {day.hoursLabel}
                    </PortalBadge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
