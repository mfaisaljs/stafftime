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
    /^Load failed$/i.test(normalized)
  );
}
