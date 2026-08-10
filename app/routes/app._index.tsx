import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  AttendanceBoard,
  resolveAttendanceDateRange,
} from "../components/attendance/AttendanceBoard";
import { getAttendanceBoard } from "../services/workforce.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const dateRange = resolveAttendanceDateRange(url.searchParams);
  const board = await getAttendanceBoard(session.shop, {
    start: dateRange.start,
    end: dateRange.end,
  });

  return { dateRange, ...board };
};

export default function DashboardPage() {
  const { dateRange, live, metrics, rows } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Dashboard" inlineSize="large">
      <AttendanceBoard
        basePath="/app"
        dateRange={dateRange}
        live={live}
        metrics={metrics}
        rows={rows}
      />
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
