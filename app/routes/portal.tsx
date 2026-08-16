import type { LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData } from "react-router";
import { PortalShell } from "../components/portal/PortalShell";
import { handlePortalAction, loadPortalHome } from "../utils/portal-auth.server";
import { readPortalSession } from "../utils/portal-session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const home = await loadPortalHome(request);
  const session = await readPortalSession(request);
  const employeeName =
    session && session.shopDomain === home.shopDomain
      ? `${session.firstName} ${session.lastName}`.trim()
      : "";
  return { ...home, employeeName };
};

export const action = handlePortalAction;

export default function PortalLayout() {
  const data = useLoaderData<typeof loader>();
  return (
    <PortalShell
      shopDomain={data.shopDomain}
      shopName={data.shopName}
      locationName={data.locationName}
      employeeName={data.employeeName}
    >
      <Outlet />
    </PortalShell>
  );
}

export const meta = () => [{ title: "Trubuild Time Portal" }];
