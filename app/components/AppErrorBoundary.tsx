import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { ClientCrashReportEffect } from "../utils/client-crash-report";

export function AppErrorBoundary() {
  const error = useRouteError();
  return (
    <>
      <ClientCrashReportEffect error={error} />
      {boundary.error(error)}
    </>
  );
}
