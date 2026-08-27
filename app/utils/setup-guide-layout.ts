export const SETUP_GUIDE_STORAGE_KEY = "stafftime.setupGuide.v1";
export const SETUP_GUIDE_COOKIE_NAME = "stafftime_setup_guide";
export const SETUP_GUIDE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const SETUP_STEP_IDS = ["portal", "enroll", "pos", "titles"] as const;
export type SetupStepId = (typeof SETUP_STEP_IDS)[number];
export type SetupGuideLayout = "hidden" | "collapsed" | "open";

export type SetupGuidePersisted = {
  collapsed?: boolean;
  dismissed?: boolean;
  done?: Partial<Record<SetupStepId, boolean>>;
};

export function allSetupStepsDone(
  done: Partial<Record<SetupStepId, boolean>> | undefined,
) {
  return SETUP_STEP_IDS.every((id) => Boolean(done?.[id]));
}

export function setupGuideLayoutFromPersisted(
  parsed: SetupGuidePersisted | null | undefined,
): SetupGuideLayout {
  if (!parsed) return "open";
  if (allSetupStepsDone(parsed.done) && parsed.dismissed) return "hidden";
  if (parsed.collapsed) return "collapsed";
  return "open";
}

export function parseSetupGuideLayoutCookie(
  cookieHeader: string | null | undefined,
): SetupGuideLayout {
  if (!cookieHeader) return "open";
  const match = cookieHeader.match(
    /(?:^|;\s*)stafftime_setup_guide=(hidden|collapsed|open)(?:;|$)/,
  );
  return (match?.[1] as SetupGuideLayout | undefined) ?? "open";
}

export function setupGuideCookieString(layout: SetupGuideLayout) {
  return `${SETUP_GUIDE_COOKIE_NAME}=${layout}; Path=/; Max-Age=${SETUP_GUIDE_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function persistSetupGuideLayoutCookie(layout: SetupGuideLayout) {
  if (typeof document === "undefined") return;
  document.cookie = setupGuideCookieString(layout);
}

/**
 * Runs in <head> before first paint so a dismissed/collapsed setup guide
 * never takes layout space, then writes a cookie for the next SSR.
 */
export const SETUP_GUIDE_ANTI_SHIFT_SCRIPT = `(function(){try{var r=localStorage.getItem(${JSON.stringify(SETUP_GUIDE_STORAGE_KEY)});if(!r)return;var p=JSON.parse(r);var d=p.done||{};var all=d.portal&&d.enroll&&d.pos&&d.titles;var m=all&&p.dismissed?"hidden":p.collapsed?"collapsed":"open";document.documentElement.dataset.setupGuide=m;document.cookie=${JSON.stringify(SETUP_GUIDE_COOKIE_NAME)}+"="+m+"; Path=/; Max-Age=${SETUP_GUIDE_COOKIE_MAX_AGE}; SameSite=Lax";}catch(e){}})();`;
