import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { PortalBadge, PortalFlash, portalTabClass } from "../components/portal/PortalShell";
import { requirePortalFeature } from "../utils/portal-auth.server";
import {
  bootstrapManagerViewForPos,
  getManagerViewStaffDetailForPos,
  managerClockActionForPos,
} from "../services/manager-view.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const context = await requirePortalFeature(request, "manager");
  const url = new URL(request.url);
  const staffId = url.searchParams.get("staff")?.trim() || "";
  const bootstrap = await bootstrapManagerViewForPos({
    shopDomain: context.shop.domain,
    managerId: context.employee.id,
  });
  const detail = staffId
    ? await getManagerViewStaffDetailForPos({
        shopDomain: context.shop.domain,
        managerId: context.employee.id,
        staffId,
      })
    : null;
  return {
    shopDomain: context.shop.domain,
    requirePhoto: context.settings.requirePhoto,
    bootstrap,
    detail,
    staffId,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const context = await requirePortalFeature(request, "manager");
  const formData = await request.formData();
  try {
    await managerClockActionForPos({
      shopDomain: context.shop.domain,
      managerId: context.employee.id,
      staffId: String(formData.get("staffId") ?? ""),
      action: String(formData.get("action") ?? "") as
        | "clock-in"
        | "clock-out"
        | "break-start"
        | "break-end",
      notes: String(formData.get("notes") ?? "") || undefined,
      photo: String(formData.get("photo") ?? "") || undefined,
    });
    return { success: "Staff clock updated." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Clock action failed",
    };
  }
};

export default function PortalManagerPage() {
  const { bootstrap, detail, staffId } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [params, setParams] = useSearchParams();
  const flash = fetcher.data;
  const filter = params.get("filter") || "all";

  const staff = bootstrap.staff.filter((row) => {
    if (filter === "working") return row.punchStatus === "CLOCKED_IN";
    if (filter === "break") return row.punchStatus === "ON_BREAK";
    if (filter === "absent") return row.status === "absent";
    return true;
  });

  function setFilter(next: string) {
    const copy = new URLSearchParams(params);
    copy.set("filter", next);
    setParams(copy, { replace: true });
  }

  function openStaff(id: string) {
    const copy = new URLSearchParams(params);
    copy.set("staff", id);
    setParams(copy);
  }

  return (
    <>
      <h1 className="portal-kicker">Manager View</h1>
      <p className="portal-sub">
        {bootstrap.manager.firstName} {bootstrap.manager.lastName} ·{" "}
        {bootstrap.manager.roleLabel}
      </p>
      <PortalFlash
        message={flash && "error" in flash ? flash.error : flash?.success}
        tone={flash && "error" in flash && flash.error ? "error" : "success"}
      />
      <div className="portal-stat-row">
        <div className="portal-stat">
          <span>Working</span>
          <strong>{bootstrap.metrics.workingCount}</strong>
        </div>
        <div className="portal-stat">
          <span>On break</span>
          <strong>{bootstrap.metrics.onBreakCount}</strong>
        </div>
        <div className="portal-stat">
          <span>Absent</span>
          <strong>{bootstrap.metrics.absentCount}</strong>
        </div>
      </div>
      <div className="portal-tabs">
        {["all", "working", "break", "absent"].map((item) => (
          <button
            key={item}
            type="button"
            className={portalTabClass(filter === item)}
            onClick={() => setFilter(item)}
          >
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>
      <div className="portal-panel">
        {staff.map((row) => (
          <div className="portal-row" key={row.id}>
            <button
              type="button"
              onClick={() => openStaff(row.id)}
              style={{
                background: "none",
                border: 0,
                padding: 0,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <strong>{row.name}</strong>
              <div className="portal-muted">
                {row.position || "Staff"} · {row.location}
              </div>
            </button>
            <PortalBadge tone={row.punchStatusTone}>
              {row.punchStatusLabel}
            </PortalBadge>
          </div>
        ))}
      </div>
      {detail ? (
        <div className="portal-panel" style={{ marginTop: 16 }}>
          <h2>{detail.details.fullName}</h2>
          <p className="portal-muted">
            {detail.details.roleLabel} · {detail.clockStatus.status.replace("_", " ")}
          </p>
          <fetcher.Form method="post" className="portal-actions">
            <input type="hidden" name="staffId" value={staffId} />
            {detail.clockStatus.status === "CLOCKED_OUT" ? (
              <button className="portal-btn" name="action" value="clock-in" type="submit">
                Clock in
              </button>
            ) : (
              <button className="portal-btn danger" name="action" value="clock-out" type="submit">
                Clock out
              </button>
            )}
            {detail.clockStatus.status === "CLOCKED_IN" ? (
              <button className="portal-btn secondary" name="action" value="break-start" type="submit">
                Start break
              </button>
            ) : null}
            {detail.clockStatus.status === "ON_BREAK" ? (
              <button className="portal-btn" name="action" value="break-end" type="submit">
                End break
              </button>
            ) : null}
          </fetcher.Form>
        </div>
      ) : null}
    </>
  );
}
