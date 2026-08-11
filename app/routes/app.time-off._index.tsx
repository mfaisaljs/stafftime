import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import type { ReactNode } from "react";
import { Form, Link, useActionData, useLoaderData, useNavigate, useSearchParams } from "react-router";
import { useState } from "react";
import { ArrowUpDown, Search } from "lucide-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAdminShop, getEmployees } from "../services/admin.server";
import {
  approveTimeOffRequestForShop,
  findOverlappingScheduledShifts,
  summarizeOverlappingShifts,
} from "../services/time-off-shifts.server";
import prisma from "../db.server";

type StatusTab = "all" | "approved" | "pending" | "declined";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const url = new URL(request.url);
  const status = statusTab(url.searchParams.get("status"));

  const [employees, requests] = await Promise.all([
    getEmployees(session),
    prisma.timeOffRequest.findMany({
      where: {
        shopId: shop.id,
        ...(status === "all" ? {} : { status: status.toUpperCase() }),
      },
      include: { policy: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const employeeNameById = new Map(
    employees.map((employee) => [
      employee.id,
      `${employee.firstName} ${employee.lastName}`.trim(),
    ]),
  );

  const pendingRequests = requests.filter((request) => request.status === "PENDING");
  const overlapByRequestId = new Map<
    string,
    ReturnType<typeof summarizeOverlappingShifts>
  >();
  await Promise.all(
    pendingRequests.map(async (request) => {
      const overlapping = await findOverlappingScheduledShifts({
        shopId: shop.id,
        employeeId: request.employeeId,
        startDate: request.startDate,
        endDate: request.endDate,
      });
      overlapByRequestId.set(request.id, summarizeOverlappingShifts(overlapping));
    }),
  );

  return {
    created: url.searchParams.get("created") === "1",
    status,
    timeOffs: requests.map((request) => ({
      id: request.id,
      staffName: employeeNameById.get(request.employeeId) ?? "Unknown staff",
      policyName: request.policy.name,
      startDate: request.startDate,
      endDate: request.endDate,
      status: request.status.toLowerCase() as StatusTab,
      reason: request.reason ?? "",
      overlappingShifts: overlapByRequestId.get(request.id) ?? [],
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const formData = await request.formData();
  const requestId = String(formData.get("requestId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!requestId) {
    return { error: "Time off request not found." };
  }
  if (status !== "APPROVED" && status !== "DECLINED") {
    return { error: "Select a valid review action." };
  }

  const existing = await prisma.timeOffRequest.findFirst({
    where: { id: requestId, shopId: shop.id },
  });
  if (!existing) {
    return { error: "Time off request not found." };
  }
  if (existing.status !== "PENDING") {
    return { error: "This time off request has already been reviewed." };
  }

  try {
    const { cancelledShiftCount } = await approveTimeOffRequestForShop({
      shopId: shop.id,
      requestId: existing.id,
      status: status as "APPROVED" | "DECLINED",
    });

    if (status === "APPROVED") {
      return {
        success:
          cancelledShiftCount > 0
            ? `Time off approved. ${cancelledShiftCount} overlapping shift${cancelledShiftCount === 1 ? "" : "s"} cancelled.`
            : "Time off approved.",
      };
    }
    return { success: "Time off declined." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not review request.",
    };
  }
};

export default function TimeOffIndexPage() {
  const { timeOffs, created, status } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = statusTab(searchParams.get("status") ?? status);
  const isEmpty = timeOffs.length === 0;
  const [approveTarget, setApproveTarget] = useState<
    (typeof timeOffs)[number] | null
  >(null);

  return (
    <s-page heading="Time Off Management" inlineSize="large">
      <s-button
        slot="secondary-actions"
        type="button"
        variant="secondary"
        onClick={() => navigate("/app/time-off/policy")}
      >
        View Policy
      </s-button>
      <s-button
        slot="primary-action"
        type="button"
        variant="primary"
        onClick={() => navigate("/app/time-off/new")}
      >
        Create Time Off
      </s-button>

      {created && (
        <s-banner tone="success" heading="Time off created and approved." />
      )}
      {actionData && "error" in actionData && actionData.error && (
        <s-banner tone="critical" heading={actionData.error} />
      )}
      {actionData && "success" in actionData && actionData.success && (
        <s-banner tone="success" heading={actionData.success} />
      )}

      <section className="timeoff-card">
        <div className="timeoff-toolbar">
          <nav className="timeoff-tabs" aria-label="Time off status filters">
            <StatusTabLink status="all" active={tab} searchParams={searchParams}>
              All
            </StatusTabLink>
            <StatusTabLink
              status="approved"
              active={tab}
              searchParams={searchParams}
            >
              Approved
            </StatusTabLink>
            <StatusTabLink
              status="pending"
              active={tab}
              searchParams={searchParams}
            >
              Pending
            </StatusTabLink>
            <StatusTabLink
              status="declined"
              active={tab}
              searchParams={searchParams}
            >
              Declined
            </StatusTabLink>
          </nav>

          <div className="timeoff-actions">
            <button
              type="button"
              className="icon-button"
              aria-label="Search and filter"
            >
              <Search aria-hidden="true" size={16} />
              <span className="filter-lines" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>
            <button type="button" className="icon-button" aria-label="Sort">
              <ArrowUpDown aria-hidden="true" size={16} />
            </button>
          </div>
        </div>

        {isEmpty ? (
          <div className="timeoff-empty">
            <Search aria-hidden="true" size={56} strokeWidth={1.25} />
            <strong>No Time Offs found</strong>
            <p>Try changing the filters or search term</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="timeoff-table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Policy</th>
                  <th>Dates</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {timeOffs.map((item) => (
                  <tr key={item.id}>
                    <td>{item.staffName}</td>
                    <td>{item.policyName}</td>
                    <td>
                      {formatDate(item.startDate)} – {formatDate(item.endDate)}
                    </td>
                    <td>
                      <span className={`status-pill ${item.status}`}>
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td>{item.reason || "—"}</td>
                    <td>
                      {item.status === "pending" ? (
                        <div className="timeoff-actions-inline">
                          <s-button
                            type="button"
                            variant="primary"
                            onClick={() => setApproveTarget(item)}
                          >
                            Approve
                          </s-button>
                          <Form method="post">
                            <input type="hidden" name="requestId" value={item.id} />
                            <input type="hidden" name="status" value="DECLINED" />
                            <s-button type="submit" variant="secondary">
                              Decline
                            </s-button>
                          </Form>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="knowledge-link">
        For more guidance, visit our <Link to="/app">Knowledge Base</Link>
      </p>

      {approveTarget ? (
        <s-modal
          heading="Approve time off?"
          open
          onClose={() => setApproveTarget(null)}
        >
          <s-box padding="base">
            <s-stack direction="block" gap="base">
              <s-text>
                Approve {approveTarget.staffName}&apos;s {approveTarget.policyName}{" "}
                request ({formatDate(approveTarget.startDate)} –{" "}
                {formatDate(approveTarget.endDate)})?
              </s-text>
              {approveTarget.overlappingShifts.length > 0 ? (
                <s-banner tone="warning" heading="Overlapping shifts will be cancelled">
                  <s-text>
                    {approveTarget.overlappingShifts.length} scheduled shift
                    {approveTarget.overlappingShifts.length === 1 ? "" : "s"} will
                    be cancelled for this employee.
                  </s-text>
                  <s-stack direction="block" gap="small">
                    {approveTarget.overlappingShifts.map((shift) => (
                      <s-text key={shift.id}>
                        {formatDate(shift.dateKey)} · {shift.startTime}–
                        {shift.endTime} · {shift.locationName}
                      </s-text>
                    ))}
                  </s-stack>
                </s-banner>
              ) : null}
            </s-stack>
          </s-box>
          <Form method="post" slot="primary-action">
            <input type="hidden" name="requestId" value={approveTarget.id} />
            <input type="hidden" name="status" value="APPROVED" />
            <s-button type="submit" variant="primary">
              Approve
            </s-button>
          </Form>
          <s-button
            slot="secondary-actions"
            variant="secondary"
            onClick={() => setApproveTarget(null)}
          >
            Cancel
          </s-button>
        </s-modal>
      ) : null}

      <style>{TIME_OFF_STYLES}</style>
    </s-page>
  );
}

function StatusTabLink({
  status,
  active,
  searchParams,
  children,
}: {
  status: StatusTab;
  active: StatusTab;
  searchParams: URLSearchParams;
  children: ReactNode;
}) {
  const next = new URLSearchParams(searchParams);
  next.delete("created");
  if (status === "all") {
    next.delete("status");
  } else {
    next.set("status", status);
  }
  const query = next.toString();
  const href = query ? `/app/time-off?${query}` : "/app/time-off";

  return (
    <Link
      className={`timeoff-tab${status === active ? " active" : ""}`}
      to={href}
    >
      {children}
    </Link>
  );
}

function statusTab(value: string | null): StatusTab {
  if (value === "approved" || value === "pending" || value === "declined") {
    return value;
  }
  return "all";
}

function statusLabel(status: StatusTab) {
  switch (status) {
    case "approved":
      return "Approved";
    case "declined":
      return "Declined";
    case "pending":
      return "Pending";
    default:
      return "All";
  }
}

function formatDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

const TIME_OFF_STYLES = `
  .timeoff-card {
    background: #fff;
    border: 1px solid #e3e3e3;
    border-radius: 12px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    display: grid;
    min-height: 420px;
    min-width: 0;
    overflow: hidden;
  }

  .timeoff-toolbar {
    align-items: center;
    border-bottom: 1px solid #ebebeb;
    display: flex;
    gap: 12px;
    justify-content: space-between;
    padding: 12px 14px;
  }

  .timeoff-tabs {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .timeoff-tab {
    border-radius: 8px;
    color: #303030;
    padding: 8px 14px;
    text-decoration: none;
  }

  .timeoff-tab.active {
    background: #e3e3e3;
    font-weight: 650;
  }

  .timeoff-actions {
    align-items: center;
    display: inline-flex;
    gap: 8px;
  }

  .timeoff-actions-inline {
    align-items: center;
    display: inline-flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .icon-button {
    align-items: center;
    background: #fff;
    border: 1px solid #d4d4d4;
    border-radius: 8px;
    color: #303030;
    cursor: pointer;
    display: inline-flex;
    gap: 6px;
    height: 36px;
    justify-content: center;
    min-width: 36px;
    padding: 0 10px;
  }

  .icon-button:hover {
    background: #f7f7f7;
  }

  .filter-lines {
    display: grid;
    gap: 2px;
    width: 12px;
  }

  .filter-lines span {
    background: #303030;
    border-radius: 999px;
    display: block;
    height: 1.5px;
  }

  .filter-lines span:nth-child(1) {
    width: 100%;
  }

  .filter-lines span:nth-child(2) {
    width: 70%;
  }

  .filter-lines span:nth-child(3) {
    width: 40%;
  }

  .timeoff-empty {
    align-content: center;
    color: #616161;
    display: grid;
    gap: 8px;
    justify-items: center;
    padding: 72px 24px;
    text-align: center;
  }

  .timeoff-empty svg {
    color: #b5b5b5;
    margin-bottom: 8px;
  }

  .timeoff-empty strong {
    color: #303030;
    font-size: 18px;
    font-weight: 700;
  }

  .timeoff-empty p {
    color: #616161;
    font-size: 14px;
    margin: 0;
  }

  .table-scroll {
    overflow-x: auto;
  }

  .timeoff-table {
    border-collapse: collapse;
    min-width: 720px;
    width: 100%;
  }

  .timeoff-table th,
  .timeoff-table td {
    border-bottom: 1px solid #ebebeb;
    color: #303030;
    padding: 14px 16px;
    text-align: left;
    white-space: nowrap;
  }

  .timeoff-table th {
    background: #fafafa;
    color: #616161;
    font-size: 12px;
    font-weight: 650;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .status-pill {
    border-radius: 999px;
    display: inline-flex;
    font-size: 12px;
    font-weight: 650;
    padding: 4px 10px;
  }

  .status-pill.pending {
    background: #fff4d6;
    color: #8a5700;
  }

  .status-pill.approved {
    background: #e3f8e8;
    color: #0b6b32;
  }

  .status-pill.declined {
    background: #fde8e8;
    color: #b91c1c;
  }

  .knowledge-link {
    color: #616161;
    font-size: 13px;
    margin: 18px 0 0;
    text-align: center;
  }

  .knowledge-link a {
    color: #005bd3;
    text-decoration: underline;
  }
`;
