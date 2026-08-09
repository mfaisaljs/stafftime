import type { HeadersFunction, LoaderFunctionArgs } from "react-router";import { useEffect } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getDashboardData } from "../services/admin.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return getDashboardData(session);
};

export default function DashboardPage() {
  const { summary, laborCostToday, shopName } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  useEffect(() => {
    const interval = setInterval(() => {
      if (revalidator.state === "idle") {
        revalidator.revalidate();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [revalidator]);

  return (
    <s-page heading="Workforce OS Dashboard" inlineSize="large">
      <s-section heading={`${shopName} — Today`}>
        <s-stack direction="inline" gap="base">
          <s-badge tone="success">{summary.workingCount} Working</s-badge>
          <s-badge tone="warning">{summary.onBreakCount} On Break</s-badge>
          <s-badge tone="critical">{summary.absentCount} Absent</s-badge>
          <s-badge tone="info">{summary.lateCount} Late</s-badge>
        </s-stack>
        <s-paragraph>
          Pending approvals: {summary.pendingApprovals} · Total staff:{" "}
          {summary.totalEmployees}
        </s-paragraph>
        <s-paragraph>
          Estimated labor cost today: ${laborCostToday.toFixed(2)}
        </s-paragraph>
      </s-section>

      <s-section heading="Live Staff">
        <s-stack direction="block" gap="base">
          {summary.working.map((entry) => (
            <s-box key={entry.id} padding="base" background="subdued">
              <s-text>
                {entry.employee.firstName} {entry.employee.lastName} — Working
                since {entry.clockInAt.toLocaleTimeString()}
              </s-text>
            </s-box>
          ))}
          {summary.onBreak.map((entry) => (
            <s-box key={entry.id} padding="base" background="subdued">
              <s-text>
                {entry.employee.firstName} {entry.employee.lastName} — On break
              </s-text>
            </s-box>
          ))}
          {summary.working.length === 0 && summary.onBreak.length === 0 && (
            <s-text>No staff currently clocked in.</s-text>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Upcoming Shifts">
        <s-stack direction="block" gap="base">
          {summary.upcomingShifts.map((shift) => (
            <s-box key={shift.id} padding="base" background="subdued">
              <s-text>
                {shift.employee.firstName} {shift.employee.lastName} ·{" "}
                {shift.startsAt.toLocaleString()} –{" "}
                {shift.endsAt.toLocaleTimeString()} · {shift.location.name}
              </s-text>
            </s-box>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
