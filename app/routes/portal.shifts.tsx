import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { PortalBadge, portalTabClass } from "../components/portal/PortalShell";
import { requirePortalFeature } from "../utils/portal-auth.server";
import { portalHref } from "../utils/portal-path";
import {
  listEmployeeShiftsForPos,
  type PosShiftRange,
} from "../services/workforce.server";

const RANGES: PosShiftRange[] = ["upcoming", "today", "week", "month"];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const context = await requirePortalFeature(request, "shifts");
  const url = new URL(request.url);
  const range = (url.searchParams.get("range") || "upcoming") as PosShiftRange;
  const payload = await listEmployeeShiftsForPos({
    shopDomain: context.shop.domain,
    employeeId: context.employee.id,
    range: RANGES.includes(range) ? range : "upcoming",
  });
  return {
    shopDomain: context.shop.domain,
    range: RANGES.includes(range) ? range : "upcoming",
    payload,
  };
};

export default function PortalShiftsPage() {
  const { shopDomain, range, payload } = useLoaderData<typeof loader>();
  return (
    <>
      <h1 className="portal-kicker">View Shifts</h1>
      <p className="portal-sub">
        {payload.employee.firstName} {payload.employee.lastName}
      </p>
      <div className="portal-tabs">
        {RANGES.map((item) => (
          <Link
            key={item}
            className={portalTabClass(range === item)}
            to={portalHref("/portal/shifts", shopDomain, { range: item })}
          >
            {item === "week"
              ? "This week"
              : item === "month"
                ? "This month"
                : item[0].toUpperCase() + item.slice(1)}
          </Link>
        ))}
      </div>
      <div className="portal-panel">
        {payload.shifts.length === 0 ? (
          <p className="portal-muted">No shifts in this range.</p>
        ) : (
          payload.shifts.map((shift) => (
            <div className="portal-row" key={shift.id}>
              <div>
                <strong
                  style={
                    shift.cancelledForLeave
                      ? { textDecoration: "line-through" }
                      : undefined
                  }
                >
                  {shift.dateLabel}
                </strong>
                <div className="portal-muted">
                  {shift.timeRangeLabel} · {shift.locationName}
                </div>
              </div>
              <PortalBadge tone={shift.tone}>{shift.statusLabel}</PortalBadge>
            </div>
          ))
        )}
      </div>
    </>
  );
}
