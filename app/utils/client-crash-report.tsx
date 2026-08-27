import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { isSuppressedApplicationCrashMessage } from "./crash-report-suppression";

/**
 * Browser-only: POSTs to /api/app-error. Safe to import from root (calls run in useEffect / window handlers only).
 */
export function sendClientCrashReport(
  err: { name: string; message: string; stack?: string },
  options?: { route?: string; pageUrl?: string; shop?: string },
): void {
  if (typeof window === "undefined") return;
  if (isSuppressedApplicationCrashMessage(err.message)) return;
  const route =
    options?.route ?? `${window.location.pathname}${window.location.search}`;
  const pageUrl = options?.pageUrl ?? window.location.href;
  const shop =
    (options?.shop ??
      new URLSearchParams(window.location.search).get("shop") ??
      new URLSearchParams(window.location.search).get("ShopDomain")) ||
    undefined;
  const payload = {
    source: "client" as const,
    route,
    pageUrl,
    errorName: err.name,
    message: err.message,
    stack: err.stack,
    shop,
  };
  void fetch("/api/app-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

let globalHandlersInstalled = false;

/**
 * Catches throws in event listeners, async code, and other errors Error Boundaries do not see.
 */
export function installClientCrashGlobalHandlers(): void {
  if (typeof window === "undefined" || globalHandlersInstalled) return;
  globalHandlersInstalled = true;

  window.addEventListener(
    "error",
    (ev: ErrorEvent) => {
      if (ev.error instanceof Error) {
        sendClientCrashReport(ev.error);
      }
    },
    true,
  );

  window.addEventListener("unhandledrejection", (ev: PromiseRejectionEvent) => {
    const reason = ev.reason;
    if (reason instanceof Error) {
      sendClientCrashReport(reason);
      return;
    }
    let msg: string;
    try {
      msg = typeof reason === "string" ? reason : JSON.stringify(reason);
    } catch {
      msg = String(reason);
    }
    sendClientCrashReport({ name: "UnhandledRejection", message: msg });
  });
}

/**
 * Notifies admin via POST /api/app-error for client-only crashes.
 * Server-side loader/action errors are reported from entry.server handleError; dedupe reduces duplicates.
 */
export function ClientCrashReportEffect({ error }: { error: Error }) {
  const location = useLocation();
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;
    sendClientCrashReport(error, {
      route: `${location.pathname}${location.search}`,
    });
  }, [error, location.pathname, location.search]);

  return null;
}
