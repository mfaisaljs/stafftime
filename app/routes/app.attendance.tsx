import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useEffect } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAttendanceSummary } from "../services/workforce.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return getAttendanceSummary(session.shop);
};

export default function AttendancePage() {
  const summary = useLoaderData<typeof loader>();
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
    <s-page heading="Attendance Dashboard" inlineSize="large">
      <s-section heading="Status Overview">
        <s-stack direction="inline" gap="base">
          <s-badge tone="success">{summary.workingCount} Working</s-badge>
          <s-badge tone="warning">{summary.onBreakCount} On Break</s-badge>
          <s-badge tone="critical">{summary.absentCount} Absent</s-badge>
          <s-badge tone="info">{summary.lateCount} Late</s-badge>
        </s-stack>
      </s-section>

      <s-section heading="Late Arrivals">
        {summary.late.length === 0 ? (
          <s-text>No late arrivals today.</s-text>
        ) : (
          summary.late.map((entry) => (
            <s-box key={entry.id} padding="base" background="subdued">
              <s-text>
                {entry.employee.firstName} {entry.employee.lastName} clocked in
                at {entry.clockInAt.toLocaleTimeString()}
              </s-text>
            </s-box>
          ))
        )}
      </s-section>

      <s-section heading="Absent">
        {summary.absent.length === 0 ? (
          <s-text>No absences for scheduled staff today.</s-text>
        ) : (
          summary.absent.map((employee) => (
            <s-box key={employee.id} padding="base" background="subdued">
              <s-text>
                {employee.firstName} {employee.lastName} — scheduled but not
                clocked in
              </s-text>
            </s-box>
          ))
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
