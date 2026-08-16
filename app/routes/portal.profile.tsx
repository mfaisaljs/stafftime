import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { PortalBadge } from "../components/portal/PortalShell";
import { requirePortalFeature } from "../utils/portal-auth.server";
import { getStaffProfileForPos } from "../services/staff-profile.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const context = await requirePortalFeature(request, "profile");
  const profile = await getStaffProfileForPos({
    shopDomain: context.shop.domain,
    employeeId: context.employee.id,
    days: 30,
  });
  return { profile };
};

export default function PortalProfilePage() {
  const { profile } = useLoaderData<typeof loader>();
  return (
    <>
      <h1 className="portal-kicker">My Profile & Shifts</h1>
      <p className="portal-sub">
        {profile.employee.firstName} {profile.employee.lastName} ·{" "}
        {profile.employee.roleLabel}
      </p>
      <div className="portal-stat-row">
        <div className="portal-stat">
          <span>Working hours</span>
          <strong>{profile.overview.workingHours}</strong>
        </div>
        <div className="portal-stat">
          <span>Break time</span>
          <strong>{profile.overview.breakTime}</strong>
        </div>
        <div className="portal-stat">
          <span>Total earnings</span>
          <strong>{profile.overview.totalEarnings}</strong>
        </div>
      </div>
      <div className="portal-panel">
        <h2>Upcoming shifts</h2>
        {profile.shifts.upcoming.length === 0 ? (
          <p className="portal-muted">No upcoming shifts.</p>
        ) : (
          profile.shifts.upcoming.map((shift) => (
            <div className="portal-row" key={shift.id}>
              <div>
                <strong>{shift.dateLabel}</strong>
                <div className="portal-muted">
                  {shift.timeRangeLabel} · {shift.locationName}
                </div>
              </div>
              <PortalBadge tone={shift.tone}>{shift.badge}</PortalBadge>
            </div>
          ))
        )}
      </div>
    </>
  );
}
