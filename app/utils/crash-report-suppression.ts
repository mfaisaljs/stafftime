import { isRouteErrorLike } from "./serialize-unknown-error";

/**
 * Messages that should not trigger admin crash emails.
 * React production builds throw minified codes for hydration issues; these are noisy
 * and usually need devtools / component fixes rather than an on-call email.
 */
export function isSuppressedApplicationCrashMessage(message: string): boolean {
  if (!message) return false;
  const normalized = message.trim();
  return (
    /Minified React error #418\b/.test(normalized) ||
    /Minified React error #419\b/.test(normalized) ||
    /Minified React error #422\b/.test(normalized) ||
    /Minified React error #423\b/.test(normalized) ||
    /Minified React error #425\b/.test(normalized) ||
    /\binvariant=418\b/.test(normalized) ||
    /\binvariant=419\b/.test(normalized) ||
    /\binvariant=422\b/.test(normalized) ||
    /\binvariant=423\b/.test(normalized) ||
    /\binvariant=425\b/.test(normalized) ||
    // Browser/network transient fetch failures (offline, blocked request, DNS hiccup,
    // tab closed mid-request, CORS blip) are noisy and not actionable as app crash alerts.
    /^Failed to fetch$/i.test(normalized) ||
    /NetworkError when attempting to fetch resource/i.test(normalized) ||
    /^Network request failed$/i.test(normalized) ||
    /^Load failed$/i.test(normalized) ||
    // Shopify session-token / App Bridge auth bounces (not application bugs).
    /^HTTP (301|302|303|307|308|401|403|404)\b/.test(normalized)
  );
}

/**
 * Client HydratedRouter onError often receives ErrorResponse objects for expected
 * auth redirects (401/302) during the session-token POST to /app.
 */
export function isSuppressedClientCrash(error: unknown, message: string): boolean {
  if (isSuppressedApplicationCrashMessage(message)) return true;
  if (isRouteErrorLike(error) && error.status >= 300 && error.status < 500) {
    return true;
  }
  if (typeof Response !== "undefined" && error instanceof Response) {
    return error.status >= 300 && error.status < 500;
  }
  return false;
}
