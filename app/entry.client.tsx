import { HydratedRouter } from "react-router/dom";
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import {
  installClientCrashGlobalHandlers,
  sendClientCrashReport,
} from "./utils/client-crash-report";

installClientCrashGlobalHandlers();

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter
        onError={(error) => {
          if (error instanceof Error) {
            sendClientCrashReport(error);
            return;
          }
          sendClientCrashReport({
            name: "Error",
            message: String(error),
          });
        }}
      />
    </StrictMode>,
  );
});
