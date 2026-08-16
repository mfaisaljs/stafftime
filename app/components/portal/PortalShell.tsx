import { useEffect, useState, type ReactNode } from "react";
import { Form, Link, useLocation } from "react-router";
import { ChevronLeft, ChevronRight, Globe, MapPin } from "lucide-react";
import { PORTAL_STYLES } from "./portal-styles";
import { portalHref } from "../../utils/portal-path";

export function PortalShell(props: {
  shopDomain: string;
  shopName: string;
  locationName: string;
  employeeName?: string;
  children: ReactNode;
}) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const isHome =
    location.pathname === "/portal" || location.pathname === "/portal/";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="portal-root">
      <aside className={`portal-sidebar${collapsed ? " collapsed" : ""}`}>
        <button
          type="button"
          className="portal-collapse"
          aria-label={collapsed ? "Show clock panel" : "Hide clock panel"}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        <div className="portal-clock-block">
          <p className="portal-dow">
            {now.toLocaleDateString(undefined, { weekday: "long" }).toUpperCase()}
          </p>
          <p className="portal-date">
            {now.toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
          <p className="portal-time">
            {now.toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
        </div>
        <div className="portal-brand">
          <div className="portal-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 16c4-9 12-9 16 0"
                stroke="#fff"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              <circle cx="12" cy="8" r="2.2" fill="#fff" />
            </svg>
          </div>
          <div className="portal-brand-name">
            TRUBUILD
            <span>TIME PORTAL</span>
          </div>
        </div>
        <div className="portal-meta">
          <div className="portal-location">
            <MapPin size={16} />
            <span>{props.locationName || props.shopName || "Shop location"}</span>
          </div>
          <button type="button" className="portal-lang" disabled>
            <Globe size={14} />
            US English
          </button>
        </div>
      </aside>
      <main className="portal-main">
        {!isHome ? (
          <div className="portal-toolbar">
            <Form method="post" action={portalHref("/portal", props.shopDomain)}>
              <input type="hidden" name="intent" value="home" />
              <button type="submit" className="portal-home">
                <ChevronLeft size={16} />
                All actions
              </button>
            </Form>
            {props.employeeName ? (
              <span className="portal-muted">{props.employeeName}</span>
            ) : null}
          </div>
        ) : null}
        {props.children}
      </main>
      <style>{PORTAL_STYLES}</style>
    </div>
  );
}

export function PortalFlash({
  message,
  tone = "success",
}: {
  message?: string | null;
  tone?: "success" | "error";
}) {
  if (!message) return null;
  return (
    <p className={`portal-flash${tone === "error" ? " error" : ""}`}>{message}</p>
  );
}

export function PortalBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "critical" | "info";
}) {
  return <span className={`portal-badge ${tone}`}>{children}</span>;
}

export function portalTabClass(active: boolean) {
  return `portal-tab${active ? " active" : ""}`;
}

export function PortalHomeLink({
  shopDomain,
  children,
}: {
  shopDomain: string;
  children: ReactNode;
}) {
  return <Link to={portalHref("/portal", shopDomain)}>{children}</Link>;
}
