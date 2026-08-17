const TOP_LEVEL_APP_ROUTES = new Set([
  "/app",
  "/app/staff",
  "/app/reports",
  "/app/schedules",
  "/app/commission-programs",
  "/app/sales-targets",
  "/app/payroll",
  "/app/tasklists",
  "/app/time-off",
  "/app/pricing",
  "/app/usage",
  "/app/settings",
  "/app/attendance",
  "/app/missed-punches",
  "/app/billing",
  "/app/additional",
]);

export function resolveAppBackPath(pathname: string): string | null {
  const path = pathname.replace(/\/$/, "") || "/";

  if (TOP_LEVEL_APP_ROUTES.has(path)) {
    return null;
  }

  if (path === "/app/staff/new") {
    return "/app/staff";
  }

  if (/^\/app\/staff\/[^/]+\/edit$/.test(path)) {
    return path.replace(/\/edit$/, "");
  }

  if (/^\/app\/staff\/[^/]+\/time-entry\//.test(path)) {
    const match = path.match(/^(\/app\/staff\/[^/]+)/);
    return match?.[1] ?? "/app/staff";
  }

  if (/^\/app\/staff\/[^/]+$/.test(path)) {
    return "/app/staff";
  }

  if (path === "/app/time-off/new") {
    return "/app/time-off";
  }

  if (path === "/app/time-off/policy/new") {
    return "/app/time-off/policy";
  }

  if (/^\/app\/time-off\/policy\/[^/]+$/.test(path)) {
    return "/app/time-off/policy";
  }

  if (path === "/app/time-off/policy") {
    return "/app/time-off";
  }

  if (path === "/app/commission-programs/new") {
    return "/app/commission-programs";
  }

  if (/^\/app\/commission-programs\/[^/]+$/.test(path)) {
    return "/app/commission-programs";
  }

  if (path === "/app/tasklists/new") {
    return "/app/tasklists";
  }

  if (/^\/app\/tasklists\/[^/]+\/edit$/.test(path)) {
    return "/app/tasklists";
  }

  if (/^\/app\/tasklists\/[^/]+$/.test(path)) {
    return "/app/tasklists";
  }

  if (/^\/app\/payroll\/[^/]+\/create$/.test(path)) {
    return "/app/payroll";
  }

  if (path === "/app/payroll/export") {
    return "/app/payroll";
  }

  const segments = path.split("/").filter(Boolean);
  if (segments.length <= 2) {
    return null;
  }

  return `/${segments.slice(0, -1).join("/")}`;
}
