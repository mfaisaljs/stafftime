import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAdminShop, getPayrollEntries } from "../services/admin.server";
import { formatMinutes, summarizeTimeEntry } from "../services/time-tracking.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const entries = await getPayrollEntries(session, 30);
  const shop = await getAdminShop(session);
  const settings = shop.settings ?? {
    overtimeDailyHours: 8,
  };

  const rows = entries.map((entry) => {
    const summary = summarizeTimeEntry(entry, settings);
    return {
      id: entry.id,
      employeeName: `${entry.employee.firstName} ${entry.employee.lastName}`,
      clockIn: entry.clockInAt.toLocaleString(),
      clockOut: entry.clockOutAt?.toLocaleString() ?? "Open",
      paidHours: (summary.paidMinutes / 60).toFixed(2),
      overtime: formatMinutes(summary.overtimeMinutes),
      laborCost: (
        (summary.paidMinutes / 60) *
        (entry.hourlyRateSnapshot ?? entry.employee.hourlyRate)
      ).toFixed(2),
    };
  });

  return { rows };
};

export default function PayrollPage() {
  const { rows } = useLoaderData<typeof loader>();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setExportError(null);

    try {
      const exportUrl = new URL("/app/payroll/export", window.location.origin);
      exportUrl.search = window.location.search;

      const response = await fetch(exportUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "text/csv",
        },
      });

      if (!response.ok) {
        throw new Error(`Export failed with status ${response.status}`);
      }

      const contentType = response.headers.get("Content-Type") ?? "";
      if (!contentType.includes("text/csv")) {
        throw new Error(`Expected CSV response but received ${contentType}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "stafftime-payroll.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      setExportError("Payroll export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <s-page heading="Payroll Export">
      <s-section heading="Recent Timesheets">
        <s-button
          type="button"
          variant="primary"
          loading={isExporting}
          onClick={handleExport}
        >
          Export CSV
        </s-button>
        {exportError && <s-text>{exportError}</s-text>}
        <s-stack direction="block" gap="base">
          {rows.map((row) => (
            <s-box key={row.id} padding="base" background="subdued">
              <s-text>
                {row.employeeName} · {row.clockIn} – {row.clockOut} · Paid{" "}
                {row.paidHours}h · OT {row.overtime} · ${row.laborCost}
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
