import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Link, useFetcher, useLoaderData } from "react-router";
import { captureSelfie } from "../components/portal/captureSelfie";
import {
  PortalBadge,
  PortalFlash,
  portalTabClass,
} from "../components/portal/PortalShell";
import {
  parsePortalProfileTab,
  parsePortalRangeParams,
  PortalStaffProfile,
  rangeForDays,
} from "../components/portal/PortalStaffProfile";
import { requirePortalFeature } from "../utils/portal-auth.server";
import { portalHref } from "../utils/portal-path";
import {
  bootstrapManagerViewForPos,
  getManagerViewStaffDetailForPos,
  managerClockActionForPos,
} from "../services/manager-view.server";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "working", label: "Working" },
  { id: "on_break", label: "On break" },
  { id: "on_leave", label: "On leave" },
  { id: "absent", label: "Absent" },
  { id: "late", label: "Late" },
] as const;

type StaffFilter = (typeof FILTERS)[number]["id"];

function parseFilter(value: string | null): StaffFilter {
  return FILTERS.some((item) => item.id === value)
    ? (value as StaffFilter)
    : "all";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const context = await requirePortalFeature(request, "manager");
  const url = new URL(request.url);
  const staffId = url.searchParams.get("staff")?.trim() || "";
  const filter = parseFilter(url.searchParams.get("filter"));
  const tab = parsePortalProfileTab(url.searchParams.get("tab"));
  const range = parsePortalRangeParams(url);
  const bootstrap = await bootstrapManagerViewForPos({
    shopDomain: context.shop.domain,
    managerId: context.employee.id,
  });

  let detail = null;
  let detailError: string | null = null;
  if (staffId) {
    try {
      detail = await getManagerViewStaffDetailForPos({
        shopDomain: context.shop.domain,
        managerId: context.employee.id,
        staffId,
        start: range.start,
        end: range.end,
        days: range.days ?? 7,
      });
    } catch (error) {
      detailError =
        error instanceof Error ? error.message : "Could not load this staff member.";
    }
  }

  return {
    shopDomain: context.shop.domain,
    requirePhoto: context.settings.requirePhoto,
    bootstrap,
    detail,
    detailError,
    staffId,
    filter,
    tab,
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

type ManagerLoaderData = Awaited<ReturnType<typeof loader>>;

export default function PortalManagerPage() {
  const {
    shopDomain,
    requirePhoto,
    bootstrap,
    detail,
    detailError,
    staffId,
    filter,
    tab,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const flash = fetcher.data;
  const busy = fetcher.state !== "idle";

  if (staffId) {
    return (
      <>
        <Link
          className="portal-home"
          to={portalHref("/portal/manager", shopDomain, { filter })}
          style={{ marginBottom: 16 }}
        >
          Back to staff
        </Link>
        <h1 className="portal-kicker">Manager View</h1>
        <PortalFlash
          message={flash && "error" in flash ? flash.error : flash?.success}
          tone={flash && "error" in flash && flash.error ? "error" : "success"}
        />
        {detailError || !detail ? (
          <div className="portal-panel">
            <p className="portal-muted">
              {detailError || "Could not load this staff member."}
            </p>
          </div>
        ) : (
          <StaffDetail
            shopDomain={shopDomain}
            staffId={staffId}
            filter={filter}
            tab={tab}
            detail={detail}
            requirePhoto={requirePhoto}
            busy={busy}
            onClock={(action, photo) => {
              void fetcher.submit(
                { staffId, action, photo: photo ?? "" },
                { method: "post" },
              );
            }}
          />
        )}
      </>
    );
  }

  const staff = filterStaff(bootstrap.staff, filter);

  return (
    <>
      <h1 className="portal-kicker">Manager View</h1>
      <p className="portal-sub">
        {bootstrap.manager.firstName} {bootstrap.manager.lastName} ·{" "}
        {bootstrap.manager.roleLabel}
      </p>
      <div className="portal-stat-row five">
        <div className="portal-stat">
          <span>Working</span>
          <strong>{bootstrap.metrics.workingCount}</strong>
        </div>
        <div className="portal-stat">
          <span>On break</span>
          <strong>{bootstrap.metrics.onBreakCount}</strong>
        </div>
        <div className="portal-stat">
          <span>On leave</span>
          <strong>{bootstrap.metrics.onLeaveCount}</strong>
        </div>
        <div className="portal-stat">
          <span>Absent</span>
          <strong>{bootstrap.metrics.absentCount}</strong>
        </div>
        <div className="portal-stat">
          <span>Late</span>
          <strong>{bootstrap.metrics.lateCount}</strong>
        </div>
      </div>
      <div className="portal-tabs">
        {FILTERS.map((item) => (
          <Link
            key={item.id}
            className={portalTabClass(filter === item.id)}
            to={portalHref("/portal/manager", shopDomain, { filter: item.id })}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <div className="portal-panel">
        {staff.length === 0 ? (
          <p className="portal-muted">No staff match this filter.</p>
        ) : (
          staff.map((row) => {
            const primary =
              row.status === "on_leave" ||
              row.status === "absent" ||
              row.status === "late"
                ? { label: row.statusLabel, tone: row.statusTone }
                : {
                    label: row.punchStatusLabel,
                    tone: row.punchStatusTone,
                  };
            const range = rangeForDays(7);
            return (
              <div className="portal-row" key={row.id}>
                <div>
                  <strong>{row.name}</strong>
                  <div className="portal-muted">
                    {row.position || "Staff"}
                    {row.location ? ` · ${row.location}` : ""}
                  </div>
                  {row.clockInLabel || row.clockOutLabel ? (
                    <div className="portal-muted">
                      {row.clockInLabel ? `In ${row.clockInLabel}` : ""}
                      {row.clockInLabel && row.clockOutLabel ? " · " : ""}
                      {row.clockOutLabel ? `Out ${row.clockOutLabel}` : ""}
                    </div>
                  ) : null}
                </div>
                <div className="portal-row-actions">
                  <PortalBadge tone={primary.tone}>{primary.label}</PortalBadge>
                  {row.workedToday && row.punchStatus === "CLOCKED_OUT" ? (
                    <PortalBadge tone="info">Worked today</PortalBadge>
                  ) : null}
                  {row.isLate && row.status !== "late" ? (
                    <PortalBadge tone="critical">Late</PortalBadge>
                  ) : null}
                  <Link
                    className="portal-btn secondary"
                    to={portalHref("/portal/manager", shopDomain, {
                      filter,
                      staff: row.id,
                      tab: "overview",
                      start: range.start,
                      end: range.end,
                      days: "7",
                    })}
                  >
                    View profile
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

function StaffDetail(props: {
  shopDomain: string;
  staffId: string;
  filter: StaffFilter;
  tab: "overview" | "shifts" | "payroll";
  detail: NonNullable<ManagerLoaderData["detail"]>;
  requirePhoto: boolean;
  busy: boolean;
  onClock: (action: string, photo?: string) => void;
}) {
  const { shopDomain, staffId, filter, tab, detail, requirePhoto, busy, onClock } =
    props;
  const status = detail.clockStatus.status;
  const extraParams = { staff: staffId, filter };

  async function runClock(action: string) {
    if (busy) return;
    let photo = "";
    if (requirePhoto && (action === "clock-in" || action === "clock-out")) {
      try {
        photo = await captureSelfie();
      } catch (error) {
        window.alert(
          error instanceof Error ? error.message : "Selfie is required.",
        );
        return;
      }
    }
    onClock(action, photo);
  }

  return (
    <>
      <p className="portal-sub" style={{ marginBottom: 16 }}>
        {detail.details.fullName}
      </p>
      <div className="portal-panel">
        <div className="portal-row">
          <div>
            <strong>{detail.details.fullName}</strong>
            <div className="portal-muted">
              {detail.details.roleLabel}
              {detail.details.locationName
                ? ` · ${detail.details.locationName}`
                : ""}
            </div>
          </div>
          <div className="portal-row-actions">
            <PortalBadge
              tone={
                status === "CLOCKED_IN"
                  ? "success"
                  : status === "ON_BREAK"
                    ? "warning"
                    : "neutral"
              }
            >
              {status === "CLOCKED_IN"
                ? "Clocked in"
                : status === "ON_BREAK"
                  ? "On break"
                  : "Clocked out"}
            </PortalBadge>
            <PortalBadge tone="info">{detail.details.statusLabel}</PortalBadge>
          </div>
        </div>
        {detail.clockStatus.sessionLabel ? (
          <div className="portal-metric">
            <span>Session</span>
            <strong>{detail.clockStatus.sessionLabel}</strong>
          </div>
        ) : null}
        {detail.clockStatus.dayTotalLabel ? (
          <div className="portal-metric">
            <span>Today</span>
            <strong>{detail.clockStatus.dayTotalLabel}</strong>
          </div>
        ) : null}

        <h2>Clock in / out</h2>
        <div className="portal-actions">
          {status === "CLOCKED_OUT" ? (
            <button
              className="portal-btn"
              type="button"
              disabled={busy}
              onClick={() => void runClock("clock-in")}
            >
              Clock in
            </button>
          ) : null}
          {status === "CLOCKED_IN" ? (
            <>
              <button
                className="portal-btn secondary"
                type="button"
                disabled={busy}
                onClick={() => void runClock("break-start")}
              >
                Start break
              </button>
              <button
                className="portal-btn danger"
                type="button"
                disabled={busy}
                onClick={() => void runClock("clock-out")}
              >
                Clock out
              </button>
            </>
          ) : null}
          {status === "ON_BREAK" ? (
            <>
              <button
                className="portal-btn secondary"
                type="button"
                disabled={busy}
                onClick={() => void runClock("break-end")}
              >
                End break
              </button>
              <button
                className="portal-btn danger"
                type="button"
                disabled={busy}
                onClick={() => void runClock("clock-out")}
              >
                Clock out
              </button>
            </>
          ) : null}
        </div>
        {detail.clockStatus.history && detail.clockStatus.history.length > 0 ? (
          <>
            <h2>Today’s history</h2>
            {detail.clockStatus.history.map((event) => (
              <div className="portal-row" key={event.id}>
                <span>
                  {event.badge} {event.label}
                </span>
                <strong>{event.atLabel}</strong>
              </div>
            ))}
          </>
        ) : null}
      </div>

      <div className="portal-panel">
        <h2>Personal information</h2>
        <div className="portal-metric">
          <span>Staff type</span>
          <strong>{detail.details.staffType}</strong>
        </div>
        <div className="portal-metric">
          <span>Email</span>
          <strong>{detail.details.email || "—"}</strong>
        </div>
        <div className="portal-metric">
          <span>Phone</span>
          <strong>{detail.details.phone || "—"}</strong>
        </div>
        <div className="portal-metric">
          <span>Position</span>
          <strong>{detail.details.position || "—"}</strong>
        </div>
        <div className="portal-metric">
          <span>Hourly rate</span>
          <strong>{detail.details.hourlyRateLabel}</strong>
        </div>
        <div className="portal-metric">
          <span>Location</span>
          <strong>{detail.details.locationName || "—"}</strong>
        </div>
      </div>

      <PortalStaffProfile
        shopDomain={shopDomain}
        pathname="/portal/manager"
        tab={tab}
        profile={detail.profile}
        extraParams={extraParams}
      />
    </>
  );
}

function filterStaff(
  staff: ManagerLoaderData["bootstrap"]["staff"],
  filter: StaffFilter,
) {
  if (filter === "all") return staff;
  if (filter === "working") {
    return staff.filter((row) => row.punchStatus === "CLOCKED_IN");
  }
  if (filter === "on_break") {
    return staff.filter((row) => row.punchStatus === "ON_BREAK");
  }
  if (filter === "late") {
    return staff.filter((row) => Boolean(row.isLate));
  }
  return staff.filter((row) => row.status === filter);
}
