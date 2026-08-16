import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { AppPage } from "../components/AppPage";
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

export default function AttendancePage() {
  const { dateRange, live, timeFormat, metrics, rows } = useLoaderData<typeof loader>();

  return (
    <AppPage heading="Attendance" inlineSize="large">
      <AttendanceBoard
        basePath="/app/attendance"
        dateRange={dateRange}
        live={live}
        timeFormat={timeFormat}
        metrics={metrics}
        rows={rows}
      />
    </AppPage>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
