import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Link, useFetcher, useLoaderData } from "react-router";
import { PortalFlash, portalTabClass } from "../components/portal/PortalShell";
import { requirePortalFeature } from "../utils/portal-auth.server";
import { portalHref } from "../utils/portal-path";
import {
  listEmployeeTaskListsForPos,
  setPosTaskItemCompletion,
  type PosTaskListTab,
} from "../services/tasklists.server";

const TABS: PosTaskListTab[] = ["all", "daily", "weekly", "monthly"];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const context = await requirePortalFeature(request, "tasklists");
  const url = new URL(request.url);
  const tab = (url.searchParams.get("tab") || "all") as PosTaskListTab;
  const payload = await listEmployeeTaskListsForPos({
    shopDomain: context.shop.domain,
    employeeId: context.employee.id,
    tab: TABS.includes(tab) ? tab : "all",
  });
  return {
    shopDomain: context.shop.domain,
    tab: TABS.includes(tab) ? tab : "all",
    payload,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const context = await requirePortalFeature(request, "tasklists");
  const formData = await request.formData();
  try {
    await setPosTaskItemCompletion({
      shopDomain: context.shop.domain,
      employeeId: context.employee.id,
      taskListId: String(formData.get("taskListId") ?? ""),
      taskItemId: String(formData.get("taskItemId") ?? ""),
      completed: String(formData.get("completed") ?? "") === "true",
    });
    return { success: "Task updated." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not update task",
    };
  }
};

export default function PortalTaskListsPage() {
  const { shopDomain, tab, payload } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const lists = payload.taskLists;
  const flash = fetcher.data;

  return (
    <>
      <h1 className="portal-kicker">TaskList</h1>
      <p className="portal-sub">Complete your assigned tasks.</p>
      <PortalFlash
        message={flash && "error" in flash ? flash.error : flash?.success}
        tone={flash && "error" in flash && flash.error ? "error" : "success"}
      />
      <div className="portal-tabs">
        {TABS.map((item) => (
          <Link
            key={item}
            className={portalTabClass(tab === item)}
            to={portalHref("/portal/tasklists", shopDomain, { tab: item })}
          >
            {item[0].toUpperCase() + item.slice(1)}
          </Link>
        ))}
      </div>
      {lists.length === 0 ? (
        <div className="portal-panel">
          <p className="portal-muted">No task lists assigned.</p>
        </div>
      ) : (
        lists.map((list) => (
          <div className="portal-panel" key={list.id} style={{ marginBottom: 16 }}>
            <div className="portal-row">
              <div>
                <strong>{list.name}</strong>
                <div className="portal-muted">
                  {list.timelineLabel} · {list.progressLabel}
                </div>
              </div>
              <span className="portal-badge">{list.assignedAs}</span>
            </div>
            {list.items.map((item) => (
              <fetcher.Form method="post" className="portal-row" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  {item.performedBy ? (
                    <div className="portal-muted">{item.performedBy}</div>
                  ) : null}
                </div>
                <input type="hidden" name="taskListId" value={list.id} />
                <input type="hidden" name="taskItemId" value={item.id} />
                <input
                  type="hidden"
                  name="completed"
                  value={item.completed ? "false" : "true"}
                />
                <button
                  className={`portal-btn${item.completed ? " secondary" : ""}`}
                  type="submit"
                  disabled={fetcher.state !== "idle"}
                >
                  {item.completed ? "Mark incomplete" : "Complete"}
                </button>
              </fetcher.Form>
            ))}
          </div>
        ))
      )}
    </>
  );
}
