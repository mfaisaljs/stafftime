import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { PortalBadge, PortalFlash, portalTabClass } from "../components/portal/PortalShell";
import { requirePortalFeature } from "../utils/portal-auth.server";
import {
  createTimeOffRequestForPos,
  getTimeOffBootstrapForPos,
  reviewTimeOffRequestForPos,
} from "../services/time-off-pos.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const context = await requirePortalFeature(request, "time-off");
  const payload = await getTimeOffBootstrapForPos({
    shopDomain: context.shop.domain,
    employeeId: context.employee.id,
  });
  return { shopDomain: context.shop.domain, payload };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const context = await requirePortalFeature(request, "time-off");
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  try {
    if (intent === "create") {
      await createTimeOffRequestForPos({
        shopDomain: context.shop.domain,
        employeeId: context.employee.id,
        policyId: String(formData.get("policyId") ?? ""),
        startDate: String(formData.get("startDate") ?? ""),
        endDate: String(formData.get("endDate") ?? ""),
        reason: String(formData.get("reason") ?? ""),
      });
      return { success: "Time off request submitted." };
    }
    if (intent === "review") {
      await reviewTimeOffRequestForPos({
        shopDomain: context.shop.domain,
        employeeId: context.employee.id,
        requestId: String(formData.get("requestId") ?? ""),
        status: String(formData.get("status") ?? "").toUpperCase() as
          | "APPROVED"
          | "DECLINED",
      });
      return { success: "Request updated." };
    }
    return { error: "Unknown action." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Request failed",
    };
  }
};

export default function PortalTimeOffPage() {
  const { payload } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "mine";
  const flash = fetcher.data;

  function setTab(next: string) {
    const copy = new URLSearchParams(params);
    copy.set("tab", next);
    setParams(copy, { replace: true });
  }

  return (
    <>
      <h1 className="portal-kicker">Time Off</h1>
      <p className="portal-sub">Request leave and review your time off.</p>
      <PortalFlash
        message={flash && "error" in flash ? flash.error : flash?.success}
        tone={flash && "error" in flash && flash.error ? "error" : "success"}
      />
      <div className="portal-tabs">
        <button type="button" className={portalTabClass(tab === "mine")} onClick={() => setTab("mine")}>
          My requests
        </button>
        <button type="button" className={portalTabClass(tab === "request")} onClick={() => setTab("request")}>
          New request
        </button>
        {payload.employee.canApprove ? (
          <button type="button" className={portalTabClass(tab === "approvals")} onClick={() => setTab("approvals")}>
            Approvals
          </button>
        ) : null}
      </div>
      {tab === "request" ? (
        <div className="portal-panel">
          <fetcher.Form method="post" className="portal-form">
            <input type="hidden" name="intent" value="create" />
            <label>
              Policy
              <select name="policyId" required>
                <option value="">Select policy</option>
                {payload.policies.map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name} ({policy.compensation})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Start date
              <input type="date" name="startDate" required />
            </label>
            <label>
              End date
              <input type="date" name="endDate" required />
            </label>
            <label>
              Reason (optional)
              <textarea name="reason" rows={3} />
            </label>
            <button className="portal-btn" type="submit" disabled={fetcher.state !== "idle"}>
              Submit request
            </button>
          </fetcher.Form>
        </div>
      ) : null}
      {tab === "mine" ? (
        <div className="portal-panel">
          {payload.myRequests.length === 0 ? (
            <p className="portal-muted">No time off requests yet.</p>
          ) : (
            payload.myRequests.map((item) => (
              <div className="portal-row" key={item.id}>
                <div>
                  <strong>{item.policyName}</strong>
                  <div className="portal-muted">
                    {item.startDate} → {item.endDate}
                  </div>
                </div>
                <PortalBadge tone={item.tone}>{item.statusLabel}</PortalBadge>
              </div>
            ))
          )}
        </div>
      ) : null}
      {tab === "approvals" && payload.employee.canApprove ? (
        <div className="portal-panel">
          {[...payload.pendingApprovals, ...payload.declinedApprovals].length === 0 ? (
            <p className="portal-muted">No requests to review.</p>
          ) : (
            [...payload.pendingApprovals, ...payload.declinedApprovals].map((item) => (
              <div className="portal-row" key={item.id}>
                <div>
                  <strong>{item.employeeName}</strong>
                  <div className="portal-muted">
                    {item.policyName} · {item.startDate} → {item.endDate}
                  </div>
                </div>
                {item.canReview ? (
                  <fetcher.Form method="post" className="portal-actions" style={{ margin: 0 }}>
                    <input type="hidden" name="intent" value="review" />
                    <input type="hidden" name="requestId" value={item.id} />
                    <button className="portal-btn" name="status" value="APPROVED" type="submit">
                      Approve
                    </button>
                    <button className="portal-btn danger" name="status" value="DECLINED" type="submit">
                      Decline
                    </button>
                  </fetcher.Form>
                ) : (
                  <PortalBadge tone={item.tone}>{item.statusLabel}</PortalBadge>
                )}
              </div>
            ))
          )}
        </div>
      ) : null}
    </>
  );
}
