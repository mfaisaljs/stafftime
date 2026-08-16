import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useEffect, useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { captureSelfie } from "../components/portal/captureSelfie";
import { PortalFlash } from "../components/portal/PortalShell";
import { requirePortalFeature } from "../utils/portal-auth.server";
import {
  buildEmployeeStatus,
  clockIn,
  clockOut,
  endBreak,
  startBreak,
} from "../services/workforce.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const context = await requirePortalFeature(request, "clock");
  const status = await buildEmployeeStatus(context.employee.id);
  return {
    shopDomain: context.shop.domain,
    requirePhoto: context.settings.requirePhoto,
    status,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const context = await requirePortalFeature(request, "clock");
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const notes = String(formData.get("notes") ?? "");
  const photo = String(formData.get("photo") ?? "") || undefined;

  try {
    const params = {
      shopDomain: context.shop.domain,
      employeeId: context.employee.id,
    };
    if (intent === "clock-in") {
      await clockIn({ ...params, photo });
    } else if (intent === "clock-out") {
      await clockOut({ ...params, notes, photo });
    } else if (intent === "break-start") {
      await startBreak(params);
    } else if (intent === "break-end") {
      await endBreak(params);
    } else {
      return { error: "Unknown action." };
    }
    return { success: "Updated." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Action failed",
    };
  }
};

export default function PortalClockPage() {
  const { status, requirePhoto } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [now, setNow] = useState(Date.now());
  const [note, setNote] = useState("");
  const offsetRef = useRef(status.serverTime ? status.serverTime - Date.now() : 0);
  const busy = fetcher.state !== "idle";
  const flash = fetcher.data;

  useEffect(() => {
    offsetRef.current = status.serverTime ? status.serverTime - Date.now() : 0;
  }, [status.serverTime, status.clockInAtMs, status.status]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const adjustedNow = now + offsetRef.current;
  const running = status.isRunning;
  const daySeconds = liveSeconds(
    status.dayTotalSeconds,
    status.serverTime,
    adjustedNow,
    running,
  );
  const sessionSeconds = liveSeconds(
    status.sessionSeconds,
    status.serverTime,
    adjustedNow,
    running,
  );

  async function submit(intent: string) {
    let photo = "";
    if (requirePhoto && (intent === "clock-in" || intent === "clock-out")) {
      try {
        photo = await captureSelfie();
      } catch (error) {
        window.alert(
          error instanceof Error ? error.message : "Selfie is required.",
        );
        return;
      }
    }
    void fetcher.submit(
      { intent, notes: note, photo },
      { method: "post" },
    );
  }

  return (
    <>
      <h1 className="portal-kicker">Clock In/Out</h1>
      <p className="portal-sub">Welcome, {status.employeeName}</p>
      <PortalFlash
        message={flash && "error" in flash ? flash.error : flash?.success}
        tone={flash && "error" in flash && flash.error ? "error" : "success"}
      />
      <div className="portal-stat-row">
        <div className="portal-stat">
          <span>Today</span>
          <strong>{formatHms(daySeconds)}</strong>
        </div>
        <div className="portal-stat">
          <span>This session</span>
          <strong>{formatHms(sessionSeconds)}</strong>
        </div>
        <div className="portal-stat">
          <span>This week</span>
          <strong>{status.weekTotalLabel}</strong>
        </div>
      </div>
      <div className="portal-panel">
        <div className="portal-row">
          <div>
            <strong>Status</strong>
            <div className="portal-muted">{status.status.replace("_", " ")}</div>
          </div>
          <span className={`portal-badge ${running ? "success" : "neutral"}`}>
            {running ? "Running" : "Off the clock"}
          </span>
        </div>
        <div className="portal-row">
          <span>Location</span>
          <strong>{status.locationName}</strong>
        </div>
        <div className="portal-row">
          <span>First clock in today</span>
          <strong>{status.firstClockInLabel}</strong>
        </div>
        <div className="portal-row">
          <span>Current clock in</span>
          <strong>{status.currentClockInLabel}</strong>
        </div>
        {status.status !== "CLOCKED_OUT" ? (
          <label className="portal-form" style={{ marginTop: 12 }}>
            Note before clock out (optional)
            <textarea
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
              rows={3}
            />
          </label>
        ) : null}
        <div className="portal-actions" style={{ marginTop: 18, marginBottom: 0 }}>
          {status.status === "CLOCKED_OUT" ? (
            <button
              type="button"
              className="portal-btn"
              disabled={busy}
              onClick={() => void submit("clock-in")}
            >
              Clock In
            </button>
          ) : (
            <button
              type="button"
              className="portal-btn danger"
              disabled={busy}
              onClick={() => void submit("clock-out")}
            >
              Clock Out
            </button>
          )}
          {status.status === "CLOCKED_IN" ? (
            <button
              type="button"
              className="portal-btn secondary"
              disabled={busy}
              onClick={() => void submit("break-start")}
            >
              Start Break
            </button>
          ) : null}
          {status.status === "ON_BREAK" ? (
            <button
              type="button"
              className="portal-btn"
              disabled={busy}
              onClick={() => void submit("break-end")}
            >
              End Break
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}

function formatHms(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = String(Math.floor(safe / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((safe % 3600) / 60)).padStart(2, "0");
  const seconds = String(safe % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function liveSeconds(
  base: number,
  serverTime: number | undefined,
  now: number,
  running: boolean,
) {
  if (!running) return base;
  const origin = serverTime ?? Date.now();
  return base + Math.max(0, Math.floor((now - origin) / 1000));
}

