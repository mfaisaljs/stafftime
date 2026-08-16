export type PortalFeatureKey =
  | "clock"
  | "timesheet"
  | "time-off"
  | "profile"
  | "tasklists"
  | "manager"
  | "shifts";

export const PORTAL_FEATURE_PATHS: Record<PortalFeatureKey, string> = {
  clock: "/portal/clock",
  timesheet: "/portal/timesheet",
  "time-off": "/portal/time-off",
  profile: "/portal/profile",
  tasklists: "/portal/tasklists",
  manager: "/portal/manager",
  shifts: "/portal/shifts",
};

export function portalHref(
  path: string,
  shopDomain: string,
  extra?: Record<string, string | undefined>,
) {
  const url = new URL(path, "https://portal.local");
  if (shopDomain) {
    url.searchParams.set("ShopDomain", shopDomain);
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) url.searchParams.set(key, value);
    }
  }
  return `${url.pathname}${url.search}`;
}

export function isPortalFeatureKey(value: string): value is PortalFeatureKey {
  return value in PORTAL_FEATURE_PATHS;
}
