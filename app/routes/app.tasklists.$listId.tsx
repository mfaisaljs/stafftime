import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useEffect, useState } from "react";
import {
  useFetcher,
  useLoaderData,
  useNavigate,
  useSearchParams,
} from "react-router";
import {
  Check,
  Clock3,
  Info,
  MapPin,
  RefreshCw,
  User,
} from "lucide-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getAdminShop,
  getEmployeeLocations,
} from "../services/admin.server";
import {
  DateRangeSelector,
  defaultDateRangeValue,
  rangeFromPreset,
  type DateRangeValue,
} from "../components/DateRangeSelector";
import prisma from "../db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const listId = params.listId;
  if (!listId) throw new Response("Task list not found", { status: 404 });

  const shop = await getAdminShop(session);
  const url = new URL(request.url);
  const dateRange = resolveDateRange(url.searchParams);
  const completeDateKey = resolveCompleteDateKey(dateRange);

  const [list, locations, completions] = await Promise.all([
    prisma.taskList.findFirst({
      where: { id: listId, shopId: shop.id },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    }),
    getEmployeeLocations(session),
    prisma.taskListCompletion.findMany({
      where: {
        shopId: shop.id,
        taskListId: listId,
        dateKey: { gte: dateRange.start, lte: dateRange.end },
      },
      orderBy: { performedAt: "desc" },
    }),
  ]);

  if (!list) throw new Response("Task list not found", { status: 404 });

  const locationNameById = new Map(
    locations.map((location) => [location.id, location.name]),
  );
  const locationIds = parseJsonArray(list.locationIds);
  const completionByItemId = new Map<string, (typeof completions)[number]>();
  for (const completion of completions) {
    if (!completionByItemId.has(completion.taskItemId)) {
      completionByItemId.set(completion.taskItemId, completion);
    }
  }

  const assignedTo: string[] = [];
  if (list.assignStaff) assignedTo.push("Staff");
  if (list.assignManagers) assignedTo.push("Managers");

  const timeline = timelineLabel(parseJsonArray(list.timelines)[0] ?? "");
  const tasks = list.items.map((item) => {
    const completion = completionByItemId.get(item.id);
    return {
      id: item.id,
      title: item.title,
      status: completion ? ("completed" as const) : ("pending" as const),
      performedBy: completion?.performedBy ?? null,
      performedAt: completion?.performedAt?.toISOString() ?? null,
      notes: completion?.notes ?? null,
    };
  });

  const completedCount = tasks.filter((task) => task.status === "completed").length;
  const totalCount = tasks.length;
  const progressPercent =
    totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return {
    list: {
      id: list.id,
      name: list.name,
      active: list.active,
      timeline,
      frequency: timeline,
      locations:
        list.locationAccess === "ALL"
          ? "All Locations"
          : locationIds
              .map((id) => locationNameById.get(id) ?? id)
              .filter(Boolean)
              .join(", ") || "—",
      assignedTo,
    },
    dateRange,
    completeDateKey,
    dateLabel: formatRangeLabel(dateRange),
    progressPercent,
    completedCount,
    totalCount,
    tasks,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const listId = params.listId;
  if (!listId) return { error: "Task list not found" };

  const shop = await getAdminShop(session);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const taskItemId = String(formData.get("taskItemId") ?? "");
  const dateKey =
    normalizeDateKey(String(formData.get("dateKey") ?? "")) ?? toDateKey(new Date());

  if (intent !== "completeTask" || !taskItemId) {
    return { error: "Invalid action" };
  }

  const list = await prisma.taskList.findFirst({
    where: { id: listId, shopId: shop.id },
    include: { items: { where: { id: taskItemId }, select: { id: true } } },
  });
  if (!list || list.items.length === 0) {
    return { error: "Task not found" };
  }

  await prisma.taskListCompletion.upsert({
    where: {
      taskItemId_dateKey: { taskItemId, dateKey },
    },
    create: {
      shopId: shop.id,
      taskListId: listId,
      taskItemId,
      dateKey,
      performedBy: "Admin",
      performedAt: new Date(),
      notes: null,
    },
    update: {
      performedBy: "Admin",
      performedAt: new Date(),
    },
  });

  return { ok: true };
};

export default function TaskListDetailPage() {
  const {
    list,
    dateRange,
    completeDateKey,
    dateLabel,
    progressPercent,
    completedCount,
    totalCount,
    tasks,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [range, setRange] = useState<DateRangeValue>(dateRange);

  useEffect(() => {
    setRange(dateRange);
  }, [dateRange]);

  const applyRange = (next: DateRangeValue) => {
    setRange(next);
    const params = new URLSearchParams(searchParams);
    if (next.custom) {
      params.set("start", next.start);
      params.set("end", next.end);
      params.delete("days");
      params.delete("date");
    } else {
      params.set("days", String(next.days));
      params.delete("start");
      params.delete("end");
      params.delete("date");
    }
    setSearchParams(params);
  };

  const taskCountLabel = `${totalCount} task${totalCount === 1 ? "" : "s"}`;

  return (
    <s-page heading={list.name} inlineSize="large">
      <s-button
        slot="secondary-actions"
        type="button"
        variant="secondary"
        onClick={() => navigate("/app/tasklists")}
      >
        Back
      </s-button>

      <div className="detail-page">
        <section className="info-card">
          <h2>Task List Information</h2>

          <div className="info-row">
            <span className="info-label">
              <User aria-hidden="true" size={16} />
              Assigned To:
            </span>
            <span className="info-value">
              {list.assignedTo.length > 0
                ? list.assignedTo.map((label) => (
                    <span key={label} className="pill assigned">
                      {label}
                    </span>
                  ))
                : "—"}
            </span>
          </div>

          <div className="info-row">
            <span className="info-label">
              <Clock3 aria-hidden="true" size={16} />
              Timeline:
            </span>
            <span className="info-value">
              {list.timeline ? (
                <span className="pill timeline">{list.timeline}</span>
              ) : (
                "—"
              )}
            </span>
          </div>

          <div className="info-row">
            <span className="info-label">
              <RefreshCw aria-hidden="true" size={16} />
              Frequency:
            </span>
            <span className="info-value text">{list.frequency || "—"}</span>
          </div>

          <div className="info-row">
            <span className="info-label">
              <MapPin aria-hidden="true" size={16} />
              Locations:
            </span>
            <span className="info-value text">{list.locations}</span>
          </div>

          <div className="info-row status-row">
            <span className="info-label">Status:</span>
            <span className="info-value">
              <span className={`pill status ${list.active ? "active" : "inactive"}`}>
                {list.active ? "Active" : "Inactive"}
              </span>
            </span>
          </div>
        </section>

        <section className="status-card">
          <div className="status-header">
            <h2>Task status for {dateLabel}</h2>
            <div className="date-control">
              <DateRangeSelector
                value={range}
                onChange={applyRange}
                align="end"
                includeHiddenInputs={false}
              />
            </div>
          </div>

          <div className="info-banner">
            <Info aria-hidden="true" size={16} />
            <div>
              <strong>Filter tasks by date range</strong>
              <p>
                Select a date range to view task status and completion progress
                for that period.
              </p>
            </div>
          </div>

          <div className="progress-card">
            <div className="progress-top">
              <span>Completion Progress</span>
              <strong>{progressPercent}%</strong>
            </div>
            <div className="progress-track" aria-hidden="true">
              <div
                className="progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p>
              {completedCount} of {totalCount} tasks completed
            </p>
          </div>
        </section>

        <section className="tasks-card">
          <div className="tasks-header">
            <h2>Tasks</h2>
            <span>{taskCountLabel}</span>
          </div>

          <div className="tasks-table-wrap">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Task Name</th>
                  <th>Status</th>
                  <th>Performed By</th>
                  <th>Performed At</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty-cell">
                      No tasks in this list.
                    </td>
                  </tr>
                ) : (
                  tasks.map((task) => {
                    const pending =
                      fetcher.state !== "idle" &&
                      String(fetcher.formData?.get("taskItemId") || "") ===
                        task.id;

                    return (
                      <tr key={task.id}>
                        <td>
                          <strong>{task.title}</strong>
                        </td>
                        <td>
                          <span
                            className={`pill task-status ${task.status}`}
                          >
                            {task.status === "completed" ? "Completed" : "Pending"}
                          </span>
                        </td>
                        <td>{task.performedBy || "—"}</td>
                        <td>
                          {task.performedAt
                            ? formatPerformedAt(task.performedAt)
                            : "—"}
                        </td>
                        <td>{task.notes || "—"}</td>
                        <td>
                          {task.status === "completed" ? (
                            <span className="done-label">Completed</span>
                          ) : (
                            <fetcher.Form method="post">
                              <input
                                type="hidden"
                                name="intent"
                                value="completeTask"
                              />
                              <input
                                type="hidden"
                                name="taskItemId"
                                value={task.id}
                              />
                              <input
                                type="hidden"
                                name="dateKey"
                                value={completeDateKey}
                              />
                              <s-button
                                type="submit"
                                variant="primary"
                                {...(pending ? { loading: true } : {})}
                              >
                                <span className="button-content">
                                  <Check aria-hidden="true" size={14} />
                                  Complete Task
                                </span>
                              </s-button>
                            </fetcher.Form>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <style>{DETAIL_STYLES}</style>
    </s-page>
  );
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function timelineLabel(value: string) {
  const labels: Record<string, string> = {
    DAILY: "Daily",
    WEEKLY: "Weekly",
    MONTHLY: "Monthly",
  };
  return labels[value] ?? "";
}

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDateKey(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function resolveDateRange(searchParams: URLSearchParams): DateRangeValue {
  const start = normalizeDateKey(searchParams.get("start"));
  const end = normalizeDateKey(searchParams.get("end"));
  if (start && end && start <= end) {
    return {
      start,
      end,
      custom: true,
      days: 0,
      label: `${formatShortDate(start)} - ${formatShortDate(end)}`,
    };
  }

  const legacyDate = normalizeDateKey(searchParams.get("date"));
  if (legacyDate) {
    return {
      start: legacyDate,
      end: legacyDate,
      custom: true,
      days: 0,
      label: formatStatusDate(legacyDate),
    };
  }

  const days = Number(searchParams.get("days"));
  if ([1, 2, 7, 30, 90, 365].includes(days)) {
    return rangeFromPreset(days);
  }

  return defaultDateRangeValue(1);
}

function resolveCompleteDateKey(range: DateRangeValue) {
  const today = toDateKey(new Date());
  if (today >= range.start && today <= range.end) return today;
  return range.end;
}

function formatStatusDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return `${month}/${day}/${year}`;
}

function formatRangeLabel(range: DateRangeValue) {
  if (!range.custom && range.label) return range.label;
  if (range.start === range.end) return formatStatusDate(range.start);
  return `${formatStatusDate(range.start)} - ${formatStatusDate(range.end)}`;
}

function formatPerformedAt(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

const DETAIL_STYLES = `
  .detail-page {
    display: grid;
    gap: 16px;
  }

  .info-card,
  .status-card,
  .tasks-card {
    background: #fff;
    border: 1px solid #e3e3e3;
    border-radius: 12px;
    padding: 18px;
  }

  .info-card h2,
  .status-card h2,
  .tasks-card h2 {
    color: #202223;
    font-size: 16px;
    margin: 0 0 12px;
  }

  .info-row {
    align-items: center;
    border-bottom: 1px solid #ececec;
    display: flex;
    gap: 12px;
    justify-content: space-between;
    min-height: 46px;
    padding: 10px 0;
  }

  .info-row.status-row {
    border-bottom: 0;
    padding-bottom: 0;
  }

  .info-label {
    align-items: center;
    color: #303030;
    display: inline-flex;
    font-size: 13px;
    font-weight: 600;
    gap: 8px;
  }

  .info-label svg {
    color: #6d7175;
  }

  .info-value {
    align-items: center;
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: flex-end;
  }

  .info-value.text {
    color: #202223;
    font-size: 13px;
    font-weight: 600;
  }

  .pill {
    border-radius: 999px;
    display: inline-flex;
    font-size: 12px;
    font-weight: 650;
    padding: 3px 10px;
  }

  .pill.assigned,
  .pill.status.active {
    background: #e0f0ff;
    color: #00527c;
  }

  .pill.timeline {
    background: #e3f5e1;
    color: #0c5132;
  }

  .pill.status.inactive {
    background: #f1f2f3;
    color: #616161;
  }

  .pill.task-status.pending {
    background: #fff5d8;
    color: #8a6116;
  }

  .pill.task-status.completed {
    background: #e3f5e1;
    color: #0c5132;
  }

  .status-header {
    align-items: center;
    display: flex;
    gap: 12px;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .status-header h2 {
    margin: 0;
  }

  .date-control {
    position: relative;
    z-index: 5;
  }

  .button-content {
    align-items: center;
    display: inline-flex;
    gap: 4px;
  }

  .info-banner {
    align-items: flex-start;
    background: #eaf4ff;
    border-radius: 10px;
    color: #00527c;
    display: flex;
    gap: 10px;
    margin-bottom: 14px;
    padding: 12px 14px;
  }

  .info-banner strong,
  .info-banner p {
    display: block;
    margin: 0;
  }

  .info-banner p {
    color: #4a6f8f;
    font-size: 13px;
    margin-top: 2px;
  }

  .progress-card {
    background: #f6f6f7;
    border-radius: 10px;
    display: grid;
    gap: 8px;
    padding: 14px;
  }

  .progress-top {
    align-items: center;
    display: flex;
    font-size: 13px;
    font-weight: 650;
    justify-content: space-between;
  }

  .progress-track {
    background: #dfe3e8;
    border-radius: 999px;
    height: 10px;
    overflow: hidden;
  }

  .progress-fill {
    background: #008060;
    height: 100%;
    transition: width 160ms ease;
  }

  .progress-card p {
    color: #616161;
    font-size: 12px;
    margin: 0;
  }

  .tasks-header {
    align-items: center;
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .tasks-header h2 {
    margin: 0;
  }

  .tasks-header span {
    color: #616161;
    font-size: 13px;
  }

  .tasks-table-wrap {
    overflow-x: auto;
  }

  .tasks-table {
    border-collapse: collapse;
    min-width: 820px;
    width: 100%;
  }

  .tasks-table th,
  .tasks-table td {
    border-bottom: 1px solid #ececec;
    color: #303030;
    font-size: 13px;
    padding: 12px 10px;
    text-align: left;
    vertical-align: middle;
  }

  .tasks-table th {
    background: #f6f6f7;
    color: #616161;
    font-weight: 600;
  }

  .tasks-table tr:last-child td {
    border-bottom: 0;
  }

  .empty-cell {
    color: #616161;
    text-align: center !important;
  }

  .done-label {
    color: #008060;
    font-size: 12px;
    font-weight: 650;
  }

  @media (max-width: 760px) {
    .status-header {
      align-items: stretch;
      flex-direction: column;
    }
  }
`;
