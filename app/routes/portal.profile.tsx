import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import {
  parsePortalProfileTab,
  parsePortalRangeParams,
  PortalStaffProfile,
} from "../components/portal/PortalStaffProfile";
import { requirePortalFeature } from "../utils/portal-auth.server";
import { getStaffProfileForPos } from "../services/staff-profile.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const context = await requirePortalFeature(request, "profile");
  const url = new URL(request.url);
  const tab = parsePortalProfileTab(url.searchParams.get("tab"));
  const range = parsePortalRangeParams(url);
  const profile = await getStaffProfileForPos({
    shopDomain: context.shop.domain,
    employeeId: context.employee.id,
    start: range.start,
    end: range.end,
    days: range.days ?? 7,
  });
  return {
    shopDomain: context.shop.domain,
    tab,
    profile,
  };
};

export default function PortalProfilePage() {
  const { shopDomain, tab, profile } = useLoaderData<typeof loader>();
  return (
    <>
      <h1 className="portal-kicker">My Profile & Shifts</h1>
      <p className="portal-sub">
        {profile.employee.firstName} {profile.employee.lastName} ·{" "}
        {profile.employee.roleLabel}
      </p>
      <PortalStaffProfile
        shopDomain={shopDomain}
        pathname="/portal/profile"
        tab={tab}
        profile={profile}
      />
    </>
  );
}
