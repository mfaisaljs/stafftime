import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  fetchTaskLists,
  messageFromError,
  persistTaskSession,
  setTaskItemCompleted,
  showToast,
  verifyPin,
} from "./posApi";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  parseStoredTaskSession,
  type PosTaskItemRow,
  type PosTaskListRow,
  type PosTaskListTab,
  type TaskEmployee,
} from "./session";

const TABS: Array<{ id: PosTaskListTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

export default async function extension() {
  render(<TaskListModal />, document.body);
}

function TaskListModal() {
  const [employee, setEmployee] = useState<TaskEmployee | null>(null);
  const [tab, setTab] = useState<PosTaskListTab>("all");
  const [taskLists, setTaskLists] = useState<PosTaskListRow[]>([]);
  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const pinPadOpenRef = useRef(false);

  const clearSession = useCallback(async () => {
    try {
      await shopify.storage.delete(ACTIVE_SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
    setEmployee(null);
    setTaskLists([]);
  }, []);

  const loadTaskLists = useCallback(
    async (nextEmployee: TaskEmployee, nextTab: PosTaskListTab) => {
      setLoading(true);
      try {
        const data = await fetchTaskLists(nextEmployee.id, nextTab);
        setTaskLists(data.taskLists);
        setEmployee({
          ...nextEmployee,
          roleLabel: data.employee.roleLabel ?? nextEmployee.roleLabel,
        });
      } catch (err) {
        showToast(messageFromError(err, "Could not load task lists"));
        setTaskLists([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const showNativePinPad = useCallback(() => {
    if (pinPadOpenRef.current) return;

    if (!shopify.pinPad || typeof shopify.pinPad.showPinPad !== "function") {
      showToast("PIN pad is unavailable on this POS version.");
      return;
    }

    pinPadOpenRef.current = true;

    try {
      shopify.pinPad.showPinPad(
        async (pinDigits) => {
          const pin = pinDigits.join("");
          try {
            const data = await verifyPin(pin);
            await persistTaskSession(data);
            showToast(`Welcome, ${data.employee.firstName}`);
            return { result: "accept" as const };
          } catch (err) {
            return {
              result: "reject" as const,
              errorMessage: messageFromError(err, "Invalid PIN"),
            };
          }
        },
        {
          title: "Enter PIN",
          label: "Enter your PIN",
          masked: true,
          minPinLength: 4,
          maxPinLength: 4,
          autoSubmit: true,
          onDismissed: (result) => {
            pinPadOpenRef.current = false;
            if (result.completed) {
              void (async () => {
                const stored = parseStoredTaskSession(
                  await shopify.storage.get(ACTIVE_SESSION_STORAGE_KEY),
                );
                if (!stored) return;
                setEmployee(stored.employee);
                setTab("all");
                await loadTaskLists(stored.employee, "all");
              })();
            }
          },
        },
      );
    } catch {
      pinPadOpenRef.current = false;
    }
  }, [loadTaskLists]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = parseStoredTaskSession(
          await shopify.storage.get(ACTIVE_SESSION_STORAGE_KEY),
        );
        if (!cancelled && stored) {
          setEmployee(stored.employee);
          setTab("all");
          await loadTaskLists(stored.employee, "all");
        }
      } catch {
        // Stay on unlock UI.
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTaskLists]);

  const onSelectTab = useCallback(
    (nextTab: PosTaskListTab) => {
      setTab(nextTab);
      if (employee) {
        void loadTaskLists(employee, nextTab);
      }
    },
    [employee, loadTaskLists],
  );

  const handleTabsChange = useCallback(
    (event: { currentTarget: { value?: string | null } }) => {
      const next = event.currentTarget.value;
      if (!isPosTaskListTab(next) || next === tab) return;
      onSelectTab(next);
    },
    [onSelectTab, tab],
  );

  const toggleTask = useCallback(
    async (
      listId: string,
      item: PosTaskItemRow,
      completed: boolean,
    ) => {
      if (!employee || busyItemId) return;
      setBusyItemId(item.id);
      try {
        const result = await setTaskItemCompleted({
          employeeId: employee.id,
          taskListId: listId,
          taskItemId: item.id,
          completed,
        });
        setTaskLists((prev) =>
          prev.map((list) => {
            if (list.id !== listId) return list;
            const items = list.items.map((row) =>
              row.id === item.id
                ? {
                    ...row,
                    completed: result.completed,
                    performedBy: result.performedBy,
                  }
                : row,
            );
            const completedCount = items.filter((row) => row.completed).length;
            return {
              ...list,
              items,
              completedCount,
              progressLabel: `${completedCount}/${items.length} done`,
            };
          }),
        );
        showToast(completed ? "Task completed" : "Task marked incomplete");
      } catch (err) {
        showToast(messageFromError(err, "Could not update task"));
      } finally {
        setBusyItemId(null);
      }
    },
    [busyItemId, employee],
  );

  if (booting) {
    return (
      <s-page heading="Task List">
        <s-scroll-box>
          <s-box padding="large">
            <s-text>Loading…</s-text>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  if (!employee) {
    return (
      <s-page heading="Task List">
        <s-scroll-box>
          <s-box padding="large">
            <s-stack direction="block" gap="base">
              <s-text>Enter your staff PIN to view your task lists.</s-text>
              <s-button variant="primary" onClick={showNativePinPad}>
                Enter PIN
              </s-button>
            </s-stack>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  const listContent =
    loading ? (
      <s-text>Loading task lists…</s-text>
    ) : taskLists.length === 0 ? (
      <s-text>No task lists assigned for this tab.</s-text>
    ) : (
      <s-stack direction="block" gap="large">
        {taskLists.map((list) => (
          <TaskListCard
            key={list.id}
            list={list}
            busyItemId={busyItemId}
            onToggleTask={toggleTask}
          />
        ))}
      </s-stack>
    );

  return (
    <s-page heading="Task List">
      <s-scroll-box>
        <s-box padding="large">
          <s-stack direction="block" gap="large">
            <s-stack direction="block" gap="small">
              <s-heading>📋 {employee.firstName}'s Tasks</s-heading>
              <s-stack direction="inline" gap="small" alignItems="center">
                <s-badge tone="info">
                  {employee.roleLabel ?? "Staff"}
                </s-badge>
                <s-text>Showing lists assigned to your role</s-text>
              </s-stack>
            </s-stack>

            <s-tabs value={tab} onChange={handleTabsChange}>
              <s-tab-list>
                {TABS.map((item) => (
                  <s-tab key={item.id} controls={item.id}>
                    {item.label}
                  </s-tab>
                ))}
              </s-tab-list>
              {TABS.map((item) => (
                <s-tab-panel key={item.id} id={item.id}>
                  <s-box padding="base none">{listContent}</s-box>
                </s-tab-panel>
              ))}
            </s-tabs>

            <s-button
              variant="secondary"
              onClick={() => {
                void clearSession();
              }}
            >
              <s-stack direction="inline" gap="small" alignItems="center">
                <s-icon type="person" color="strong" />
                <s-text>Switch employee</s-text>
              </s-stack>
            </s-button>
          </s-stack>
        </s-box>
      </s-scroll-box>
    </s-page>
  );
}

function isPosTaskListTab(value: unknown): value is PosTaskListTab {
  return (
    value === "all" ||
    value === "daily" ||
    value === "weekly" ||
    value === "monthly"
  );
}

function TaskListCard(props: {
  list: PosTaskListRow;
  busyItemId: string | null;
  onToggleTask: (
    listId: string,
    item: PosTaskItemRow,
    completed: boolean,
  ) => Promise<void>;
}) {
  const { list, busyItemId, onToggleTask } = props;
  const done =
    list.taskCount > 0 && list.completedCount >= list.taskCount;

  return (
    <s-section heading={list.name}>
      <s-box padding="small none">
        <s-stack direction="block" gap="base">
          <s-stack
            direction="inline"
            gap="small"
            alignItems="center"
            justifyContent="space-between"
            inlineSize="100%"
          >
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-badge tone="neutral">
                Timeline: {list.timelineLabel}
              </s-badge>
              <s-badge tone="info">{list.assignedAs}</s-badge>
            </s-stack>
            <s-badge tone={done ? "success" : "warning"}>
              {list.progressLabel}
            </s-badge>
          </s-stack>

          <s-text>Period: {list.periodLabel}</s-text>

          {list.description ? <s-text>{list.description}</s-text> : null}

          {list.items.length === 0 ? (
            <s-text>No tasks in this list.</s-text>
          ) : (
            <s-stack direction="block" gap="base">
              {list.items.map((item) => (
                <s-box key={item.id} padding="small none">
                  <s-stack direction="block" gap="small">
                    <s-stack
                      direction="inline"
                      gap="small"
                      alignItems="center"
                      justifyContent="space-between"
                      inlineSize="100%"
                    >
                      <s-stack
                        direction="inline"
                        gap="small"
                        alignItems="center"
                      >
                        <s-icon
                          type={
                            item.completed
                              ? "check-circle-filled"
                              : "circle"
                          }
                          color="strong"
                          tone={item.completed ? "success" : "auto"}
                        />
                        <s-stack direction="block" gap="none">
                          <s-text type="strong">{item.title}</s-text>
                          <s-text>
                            {item.completed
                              ? `Completed${item.performedBy ? ` by ${item.performedBy}` : ""}`
                              : "Pending"}
                          </s-text>
                        </s-stack>
                      </s-stack>
                      <s-badge
                        tone={item.completed ? "success" : "warning"}
                      >
                        {item.completed ? "Done" : "To do"}
                      </s-badge>
                    </s-stack>

                    {item.completed ? (
                      <s-button
                        variant="secondary"
                        loading={busyItemId === item.id}
                        disabled={busyItemId !== null && busyItemId !== item.id}
                        onClick={() => {
                          void onToggleTask(list.id, item, false);
                        }}
                      >
                        Mark incomplete
                      </s-button>
                    ) : (
                      <s-button
                        variant="primary"
                        loading={busyItemId === item.id}
                        disabled={busyItemId !== null && busyItemId !== item.id}
                        onClick={() => {
                          void onToggleTask(list.id, item, true);
                        }}
                      >
                        Complete task
                      </s-button>
                    )}
                  </s-stack>
                </s-box>
              ))}
            </s-stack>
          )}
        </s-stack>
      </s-box>
    </s-section>
  );
}
