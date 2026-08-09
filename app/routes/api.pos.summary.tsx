import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getAttendanceSummary } from "../services/workforce.server";
import { jsonResponse } from "../utils/http.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { sessionToken, cors } = await authenticate.pos(request);
  const summary = await getAttendanceSummary(sessionToken.dest);

  return cors(
    jsonResponse({
      workingCount: summary.workingCount,
      onBreakCount: summary.onBreakCount,
      absentCount: summary.absentCount,
    }),
  );
};
