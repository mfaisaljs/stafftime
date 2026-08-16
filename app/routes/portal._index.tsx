import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useFetcher, useLoaderData, useSearchParams } from "react-router";
import {
  CalendarDays,
  ClipboardList,
  Clock,
  ListChecks,
  UserCog,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { PinPad } from "../components/portal/PinPad";
import {
  isPortalFeatureKey,
  PORTAL_FEATURE_PATHS,
  portalHref,
  type PortalFeatureKey,
} from "../utils/portal-path";
import { loadPortalHome } from "../utils/portal-auth.server";
import {
  portalRedirectHeaders,
  readPortalShopDomain,
} from "../utils/portal-session.server";
import {
  toPortalSessionEmployee,
  verifyPortalPin,
} from "../services/portal.server";

const ACTION_CARDS: Array<{
  key: PortalFeatureKey;
  title: string;
  description: string;
  color: string;
  icon: typeof Clock;
}> = [
  {
    key: "clock",
    title: "Clock In/Out",
    description: "Start your shift.",
    color: "#2563eb",
    icon: Clock,
  },
  {
    key: "timesheet",
    title: "Timesheet",
    description: "View your monthly hours.",
    color: "#d97706",
    icon: ClipboardList,
  },
  {
    key: "time-off",
    title: "Time Off",
    description: "Request leave.",
    color: "#0f9d8a",
    icon: CalendarDays,
  },
  {
    key: "profile",
    title: "My Profile & Shifts",
    description: "View Profile & Shifts.",
    color: "#16a34a",
    icon: UserRound,
  },
  {
    key: "tasklists",
    title: "TaskList",
    description: "Daily tasks.",
    color: "#7c3aed",
    icon: ListChecks,
  },
  {
    key: "manager",
    title: "Manager View",
    description: "Manager access.",
    color: "#ea580c",
    icon: UserCog,
  },
  {
    key: "shifts",
    title: "View Shifts",
    description: "View upcoming shifts.",
    color: "#4338ca",
    icon: CalendarDays,
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return loadPortalHome(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const shopDomain = await readPortalShopDomain(request);

  if (intent === "home") {
    throw redirect(portalHref("/portal", shopDomain), {
      headers: await portalRedirectHeaders({
        shopDomain,
        clearSession: true,
      }),
    });
  }

  if (intent !== "pin") {
    return { error: "Unknown action." };
  }

  const pin = String(formData.get("pin") ?? "");
  const next = String(formData.get("next") ?? "");
  const feature = isPortalFeatureKey(next) ? next : undefined;
  if (!feature) {
    return { error: "Select an action first." };
  }

  try {
    const result = await verifyPortalPin({
      shopDomain,
      pin,
      feature,
    });
    throw redirect(portalHref(PORTAL_FEATURE_PATHS[feature], result.shop.domain), {
      headers: await portalRedirectHeaders({
        shopDomain: result.shop.domain,
        session: toPortalSessionEmployee(result.shop.domain, result.employee),
      }),
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      error: error instanceof Error ? error.message : "Invalid PIN",
    };
  }
};

export default function PortalHomePage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pending, setPending] = useState<PortalFeatureKey | null>(null);
  const visibleCards = ACTION_CARDS.filter((card) =>
    data.features.some((feature) => feature.key === card.key && feature.enabled),
  );
  const pinError =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  useEffect(() => {
    const unlock = searchParams.get("unlock");
    if (unlock && isPortalFeatureKey(unlock)) {
      setPending(unlock);
      const next = new URLSearchParams(searchParams);
      next.delete("unlock");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  function choose(feature: PortalFeatureKey) {
    setPending(feature);
  }

  function submitPin(pin: string) {
    if (!pending) return;
    void fetcher.submit(
      { intent: "pin", pin, next: pending },
      { method: "post" },
    );
  }

  return (
    <>
      <h1 className="portal-kicker">Select an action</h1>
      <p className="portal-sub">
        Select an option below and enter your PIN to continue.
      </p>

      {data.error ? (
        <div className="portal-error">
          <h2>Portal unavailable</h2>
          <p className="portal-muted">{data.error}</p>
        </div>
      ) : visibleCards.length === 0 ? (
        <div className="portal-error">
          <h2>No portal features enabled</h2>
          <p className="portal-muted">
            Ask a manager to enable Staff Portal options in Settings.
          </p>
        </div>
      ) : (
        <div className="portal-grid">
          {visibleCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.key}
                type="button"
                className="portal-card"
                onClick={() => choose(card.key)}
              >
                <span className="portal-card-icon" style={{ background: card.color }}>
                  <Icon size={20} />
                </span>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </button>
            );
          })}
        </div>
      )}

      {pending ? (
        <PinPad
          title="Enter PIN"
          subtitle={`Continue to ${ACTION_CARDS.find((card) => card.key === pending)?.title ?? "this action"}.`}
          error={pinError}
          busy={fetcher.state !== "idle"}
          onCancel={() => setPending(null)}
          onSubmit={submitPin}
        />
      ) : null}
    </>
  );
}
