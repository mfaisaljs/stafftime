import type { ActionFunctionArgs } from "react-router";
import { emailService } from "../services/email.server";
import {
  hostFromCrashInput,
  resolveShopFromCrashRequest,
  storeLabelFromDomain,
} from "../utils/crash-report.server";
import { shopDomainFromSearchParams } from "../utils/portal-url.server";

const MAX_BODY_LENGTH = 48_000;

function allowedErrorReportHosts(): string[] {
  const hosts: string[] = [];
  for (const raw of [
    process.env.SHOPIFY_APP_URL,
    process.env.PORTAL_URL,
    process.env.PORTAL_HOST,
  ]) {
    if (!raw) continue;
    try {
      const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
      hosts.push(url.host.toLowerCase(), url.hostname.toLowerCase());
    } catch {
      // ignore invalid env URLs
    }
  }
  return hosts;
}

/**
 * Allow same-origin browser POSTs to report client-side ErrorBoundary errors.
 * Relaxed in development for alternate dev hosts/ports.
 */
function isPermittedErrorReportRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const candidate = origin || (referer ? new URL(referer).origin : null);
  if (!candidate) {
    return process.env.NODE_ENV !== "production";
  }
  try {
    const host = new URL(candidate).host.toLowerCase();
    const hostname = new URL(candidate).hostname.toLowerCase();
    const allowed = allowedErrorReportHosts();
    if (
      allowed.includes(host) ||
      allowed.includes(hostname)
    ) {
      return true;
    }
    if (process.env.NODE_ENV !== "production") {
      return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
    }
    return false;
  } catch {
    return false;
  }
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  if (!isPermittedErrorReportRequest(request)) {
    return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }
  if (text.length > MAX_BODY_LENGTH) {
    return Response.json({ ok: false, error: "Payload too large" }, { status: 413 });
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const source =
    body.source === "client" ? "client" : body.source === "server" ? "server" : "client";
  const message = typeof body.message === "string" ? body.message : "";
  const errorName = typeof body.errorName === "string" ? body.errorName : "Error";
  const stack = typeof body.stack === "string" ? body.stack : undefined;
  const route = typeof body.route === "string" ? body.route : "/";
  const pageUrl = typeof body.pageUrl === "string" ? body.pageUrl : undefined;
  const bodyShop = typeof body.shop === "string" ? body.shop : undefined;

  let queryShop: string | null = null;
  try {
    queryShop = shopDomainFromSearchParams(
      new URL(pageUrl || request.url).searchParams,
    ) || null;
  } catch {
    // ignore
  }
  const sessionShop = await resolveShopFromCrashRequest(request);
  const shop = hostFromCrashInput(bodyShop, sessionShop, queryShop);

  if (!message) {
    return Response.json({ ok: false, error: "Message required" }, { status: 400 });
  }

  const sent = await emailService.sendApplicationCrashReport({
    source,
    shopDomain: shop,
    storeName: storeLabelFromDomain(shop ?? null),
    route: route.length > 4000 ? `${route.slice(0, 4000)}…` : route,
    fullUrl:
      pageUrl && pageUrl.length <= 4000
        ? pageUrl
        : pageUrl
          ? `${pageUrl.slice(0, 4000)}…`
          : undefined,
    method: typeof body.method === "string" ? body.method : undefined,
    errorName,
    message: message.length > 16_000 ? `${message.slice(0, 16_000)}…` : message,
    stack: stack && stack.length > 32_000 ? `${stack.slice(0, 32_000)}…` : stack,
  });

  if (!sent) {
    return Response.json({ ok: false, error: "Report not sent" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
