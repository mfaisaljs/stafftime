import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import {
  isSuppressedApplicationCrashMessage,
  isSuppressedClientCrash,
} from "./crash-report-suppression";
import { serializeUnknownError } from "./serialize-unknown-error";
import {
  CLIENT_SHOP_DOMAIN_STORAGE_KEY,
  shopFromHostParam,
} from "./client-shop-domain";

function shopFromAppBridge(): string | undefined {
  const shopify = (window as Window & {
    shopify?: { config?: { shop?: string }; shop?: string };
  }).shopify;
  const candidate = shopify?.config?.shop || shopify?.shop;
  return candidate?.trim() || undefined;
}

function resolveClientShop(explicit?: string): string | undefined {
  if (explicit?.trim()) return explicit.trim();
  const params = new URLSearchParams(window.location.search);
  const fromQuery =
    params.get("shop") || params.get("ShopDomain") || undefined;
  if (fromQuery) return fromQuery;
  const fromHost = shopFromHostParam(params.get("host"));
  if (fromHost) return fromHost;
  const fromBridge = shopFromAppBridge();
  if (fromBridge) return fromBridge;
  try {
    return window.sessionStorage.getItem(CLIENT_SHOP_DOMAIN_STORAGE_KEY) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Browser-only: POSTs to /api/app-error. Safe to import from root (calls run in useEffect / window handlers only).
 */
export function sendClientCrashReport(
  err: unknown,
  options?: { route?: string; pageUrl?: string; shop?: string },
): void {
  if (typeof window === "undefined") return;
  const serialized = serializeUnknownError(err);
  if (isSuppressedClientCrash(err, serialized.message)) return;
  if (isSuppressedApplicationCrashMessage(serialized.message)) return;
  const route =
    options?.route ?? `${window.location.pathname}${window.location.search}`;
  const pageUrl = options?.pageUrl ?? window.location.href;
  const shop = resolveClientShop(options?.shop);
  const payload = {
    source: "client" as const,
    route,
    pageUrl,
    errorName: serialized.name,
    message: serialized.message,
    stack: serialized.stack,
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
      if (ev.error != null) {
        sendClientCrashReport(ev.error);
        return;
      }
      if (ev.message) {
        sendClientCrashReport(ev.message);
      }
    },
    true,
  );

  window.addEventListener("unhandledrejection", (ev: PromiseRejectionEvent) => {
    sendClientCrashReport(ev.reason);
  });
}

/**
 * Notifies admin via POST /api/app-error for client-only crashes.
 * Server-side loader/action errors are reported from entry.server handleError; dedupe reduces duplicates.
 */
export function ClientCrashReportEffect({ error }: { error: unknown }) {
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
