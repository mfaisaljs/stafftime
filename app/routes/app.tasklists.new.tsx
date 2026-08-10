import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
} from "react-router";
import { GripVertical, Plus, X } from "lucide-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getAdminShop,
  getEmployeeLocations,
  getEmployees,
} from "../services/admin.server";
import prisma from "../db.server";

type TaskDraft = {
  id: string;
  title: string;
  active: boolean;
};

const TIMELINE_OPTIONS = [
  {
    value: "DAILY",
    label: "Daily",
    help: "This task list needs to be completed every day.",
  },
  {
    value: "WEEKLY",
    label: "Weekly",
    help: "This task list needs to be completed every week.",
  },
  {
    value: "MONTHLY",
    label: "Monthly",
    help: "This task list needs to be completed every month.",
  },
] as const;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [employees, locations] = await Promise.all([
    getEmployees(session),
    getEmployeeLocations(session),
  ]);

  return {
    employees: employees
      .filter((employee) => employee.status !== "ARCHIVED")
      .map((employee) => ({
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        role: employee.role,
      })),
    locations: locations.map((location) => ({
      id: location.id,
      name: location.name,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const formData = await request.formData();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const assignStaff = formData.get("assignStaff") === "true";
  const assignManagers = formData.get("assignManagers") === "true";
  const staffScope =
    String(formData.get("staffScope") ?? "ALL") === "SELECTED"
      ? "SELECTED"
      : "ALL";
  const managerScope =
    String(formData.get("managerScope") ?? "ALL") === "SELECTED"
      ? "SELECTED"
      : "ALL";
  const locationAccess =
    String(formData.get("locationAccess") ?? "ALL") === "SPECIFIC"
      ? "SPECIFIC"
      : "ALL";
  const employeeIds = formData
    .getAll("employeeIds")
    .map((value) => String(value))
    .filter(Boolean);
  const managerIds = formData
    .getAll("managerIds")
    .map((value) => String(value))
    .filter(Boolean);
  const locationIds = formData
    .getAll("locationIds")
    .map((value) => String(value))
    .filter(Boolean);
  const timelines = formData
    .getAll("timelines")
    .map((value) => String(value))
    .filter((value) => ["DAILY", "WEEKLY", "MONTHLY"].includes(value));
  const taskTitles = formData
    .getAll("taskTitles")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!name) {
    return { error: "Enter a task list name." };
  }
  if (!assignStaff && !assignManagers) {
    return { error: "Assign the task list to Staff and/or Managers." };
  }
  if (assignStaff && staffScope === "SELECTED" && employeeIds.length === 0) {
    return { error: "Select at least one staff member." };
  }
  if (assignManagers && managerScope === "SELECTED" && managerIds.length === 0) {
    return { error: "Select at least one manager." };
  }
  if (locationAccess === "SPECIFIC" && locationIds.length === 0) {
    return { error: "Select at least one location." };
  }
  if (timelines.length === 0) {
    return { error: "Choose at least one timeline." };
  }
  if (taskTitles.length === 0) {
    return { error: "Add at least one task." };
  }

  await prisma.taskList.create({
    data: {
      shopId: shop.id,
      name,
      description: description || null,
      assignStaff,
      assignManagers,
      staffScope: assignStaff ? staffScope : "ALL",
      managerScope: assignManagers ? managerScope : "ALL",
      employeeIds: JSON.stringify(
        assignStaff && staffScope === "SELECTED" ? employeeIds : [],
      ),
      managerIds: JSON.stringify(
        assignManagers && managerScope === "SELECTED" ? managerIds : [],
      ),
      locationAccess,
      locationIds: JSON.stringify(
        locationAccess === "SPECIFIC" ? locationIds : [],
      ),
      timelines: JSON.stringify(timelines),
      items: {
        create: taskTitles.map((title, index) => ({
          title,
          active: true,
          sortOrder: index,
        })),
      },
    },
  });

  return redirect("/app/tasklists");
};

export default function CreateTaskListPage() {
  const { employees, locations } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [assignStaff, setAssignStaff] = useState(true);
  const [assignManagers, setAssignManagers] = useState(false);
  const [staffScope, setStaffScope] = useState<"ALL" | "SELECTED">("ALL");
  const [managerScope, setManagerScope] = useState<"ALL" | "SELECTED">("ALL");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedManagerIds, setSelectedManagerIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [locationAccess, setLocationAccess] = useState<"ALL" | "SPECIFIC">(
    "ALL",
  );
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [timelines, setTimelines] = useState<Set<string>>(() => new Set());
  const [tasks, setTasks] = useState<TaskDraft[]>([]);
  const [addingTask, setAddingTask] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const staffEmployees = useMemo(
    () => employees.filter((employee) => employee.role === "EMPLOYEE"),
    [employees],
  );
  const managerEmployees = useMemo(
    () =>
      employees.filter(
        (employee) =>
          employee.role === "STORE_MANAGER" || employee.role === "OWNER",
      ),
    [employees],
  );
  const selectableStaff =
    staffEmployees.length > 0 ? staffEmployees : employees;
  const selectableManagers =
    managerEmployees.length > 0 ? managerEmployees : employees;

  const toggleEmployee = (id: string, checked: boolean) => {
    setSelectedEmployeeIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleManager = (id: string, checked: boolean) => {
    setSelectedManagerIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleLocation = (id: string, checked: boolean) => {
    setSelectedLocationIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleTimeline = (value: string, checked: boolean) => {
    setTimelines((current) => {
      const next = new Set(current);
      if (checked) next.add(value);
      else next.delete(value);
      return next;
    });
  };

  const addTask = () => {
    const title = draftTitle.trim();
    if (!title) return;
    setTasks((current) => [
      ...current,
      { id: `task-${Date.now()}-${current.length}`, title, active: true },
    ]);
    setDraftTitle("");
    setAddingTask(false);
  };

  const removeTask = (id: string) => {
    setTasks((current) => current.filter((task) => task.id !== id));
  };

  const onDropTask = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    setTasks((current) => {
      const next = [...current];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDragIndex(null);
  };

  return (
    <s-page heading="Create Task List" inlineSize="large">
      {actionData?.error && (
        <s-banner heading={actionData.error} tone="critical" />
      )}

      <Form method="post" data-save-bar>
        {Array.from(selectedEmployeeIds).map((id) => (
          <input key={`staff-${id}`} type="hidden" name="employeeIds" value={id} />
        ))}
        {Array.from(selectedManagerIds).map((id) => (
          <input key={`manager-${id}`} type="hidden" name="managerIds" value={id} />
        ))}
        {Array.from(selectedLocationIds).map((id) => (
          <input key={id} type="hidden" name="locationIds" value={id} />
        ))}
        {tasks.map((task) => (
          <input key={task.id} type="hidden" name="taskTitles" value={task.title} />
        ))}

        <s-stack direction="block" gap="large">
          <FormSection
            title="Task List Details"
            description="Give your task list a name and description."
          >
            <label className="field-label">
              Task List Name
              <input
                name="name"
                type="text"
                placeholder="Daily tasks for store."
                required
              />
            </label>
            <label className="field-label">
              Description
              <textarea
                name="description"
                rows={4}
                placeholder="Describe the purpose of this task list"
              />
            </label>
          </FormSection>

          <FormSection
            title="Assigned To"
            description="Choose who should be responsible for completing this task list. You can select multiple options."
          >
            <div className="assign-block">
              <span className="group-label">Assign To</span>
              <label className="check-row">
                <input
                  type="checkbox"
                  name="assignStaff"
                  value="true"
                  checked={assignStaff}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setAssignStaff(checked);
                    if (!checked) {
                      setStaffScope("ALL");
                      setSelectedEmployeeIds(new Set());
                    }
                  }}
                />
                Staff
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  name="assignManagers"
                  value="true"
                  checked={assignManagers}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setAssignManagers(checked);
                    if (!checked) {
                      setManagerScope("ALL");
                      setSelectedManagerIds(new Set());
                    }
                  }}
                />
                Managers
              </label>
            </div>

            {(assignStaff || assignManagers) && (
              <div className="assignee-picker">
                <span className="group-label">Selected Assignees</span>
                <div className="assignee-chips">
                  {assignStaff && (
                    <span className="chip">
                      Staff
                      <button
                        type="button"
                        aria-label="Remove Staff assignment"
                        onClick={() => {
                          setAssignStaff(false);
                          setStaffScope("ALL");
                          setSelectedEmployeeIds(new Set());
                        }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  )}
                  {assignManagers && (
                    <span className="chip">
                      Managers
                      <button
                        type="button"
                        aria-label="Remove Managers assignment"
                        onClick={() => {
                          setAssignManagers(false);
                          setManagerScope("ALL");
                          setSelectedManagerIds(new Set());
                        }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  )}
                </div>

                {assignStaff && (
                  <div className="scope-block">
                    <span className="group-label">Staff assignees</span>
                    <label className="radio-row">
                      <input
                        type="radio"
                        name="staffScope"
                        value="ALL"
                        checked={staffScope === "ALL"}
                        onChange={() => {
                          setStaffScope("ALL");
                          setSelectedEmployeeIds(new Set());
                        }}
                      />
                      All staff
                    </label>
                    <label className="radio-row">
                      <input
                        type="radio"
                        name="staffScope"
                        value="SELECTED"
                        checked={staffScope === "SELECTED"}
                        onChange={() => setStaffScope("SELECTED")}
                      />
                      Selected staff
                    </label>
                    {staffScope === "SELECTED" && (
                      <div className="staff-options">
                        {selectableStaff.length === 0 ? (
                          <p className="help-text">No staff members available.</p>
                        ) : (
                          selectableStaff.map((employee) => (
                            <label key={employee.id} className="check-row">
                              <input
                                type="checkbox"
                                checked={selectedEmployeeIds.has(employee.id)}
                                onChange={(event) =>
                                  toggleEmployee(
                                    employee.id,
                                    event.currentTarget.checked,
                                  )
                                }
                              />
                              {employee.name}
                            </label>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}

                {assignManagers && (
                  <div className="scope-block">
                    <span className="group-label">Manager assignees</span>
                    <label className="radio-row">
                      <input
                        type="radio"
                        name="managerScope"
                        value="ALL"
                        checked={managerScope === "ALL"}
                        onChange={() => {
                          setManagerScope("ALL");
                          setSelectedManagerIds(new Set());
                        }}
                      />
                      All managers
                    </label>
                    <label className="radio-row">
                      <input
                        type="radio"
                        name="managerScope"
                        value="SELECTED"
                        checked={managerScope === "SELECTED"}
                        onChange={() => setManagerScope("SELECTED")}
                      />
                      Selected managers
                    </label>
                    {managerScope === "SELECTED" && (
                      <div className="staff-options">
                        {selectableManagers.length === 0 ? (
                          <p className="help-text">No managers available.</p>
                        ) : (
                          selectableManagers.map((employee) => (
                            <label key={employee.id} className="check-row">
                              <input
                                type="checkbox"
                                checked={selectedManagerIds.has(employee.id)}
                                onChange={(event) =>
                                  toggleManager(
                                    employee.id,
                                    event.currentTarget.checked,
                                  )
                                }
                              />
                              {employee.name}
                            </label>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </FormSection>

          <FormSection
            title="Locations"
            description="Select the locations where this task list applies."
          >
            <label className="radio-row">
              <input
                type="radio"
                name="locationAccess"
                value="ALL"
                checked={locationAccess === "ALL"}
                onChange={() => {
                  setLocationAccess("ALL");
                  setSelectedLocationIds(new Set());
                }}
              />
              All Locations
            </label>
            <label className="radio-row">
              <input
                type="radio"
                name="locationAccess"
                value="SPECIFIC"
                checked={locationAccess === "SPECIFIC"}
                onChange={() => setLocationAccess("SPECIFIC")}
              />
              Specific locations
            </label>
            {locationAccess === "SPECIFIC" && (
              <div className="staff-options">
                {locations.length === 0 ? (
                  <p className="help-text">No locations available.</p>
                ) : (
                  locations.map((location) => (
                    <label key={location.id} className="check-row">
                      <input
                        type="checkbox"
                        checked={selectedLocationIds.has(location.id)}
                        onChange={(event) =>
                          toggleLocation(
                            location.id,
                            event.currentTarget.checked,
                          )
                        }
                      />
                      {location.name}
                    </label>
                  ))
                )}
              </div>
            )}
          </FormSection>

          <FormSection
            title="Timeline"
            description="Choose how frequently this task list should be completed."
          >
            {TIMELINE_OPTIONS.map((option) => (
              <label key={option.value} className="timeline-row">
                <input
                  type="checkbox"
                  name="timelines"
                  value={option.value}
                  checked={timelines.has(option.value)}
                  onChange={(event) =>
                    toggleTimeline(option.value, event.currentTarget.checked)
                  }
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.help}</small>
                </span>
              </label>
            ))}
          </FormSection>

          <FormSection
            title="Tasks"
            description="Add and manage the tasks that need to be completed."
          >
            <div className="tasks-header">
              <strong>Task Items</strong>
              <p>Add tasks to your list. Drag to reorder them as needed.</p>
            </div>

            <div className="task-list">
              {tasks.map((task, index) => (
                <div
                  key={task.id}
                  className="task-row"
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => onDropTask(index)}
                >
                  <GripVertical
                    className="drag-handle"
                    aria-hidden="true"
                    size={16}
                  />
                  <span className="task-title">{task.title}</span>
                  <span className="active-badge">Active</span>
                  <button
                    type="button"
                    className="delete-task"
                    aria-label={`Remove ${task.title}`}
                    onClick={() => removeTask(task.id)}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>

            {addingTask ? (
              <div className="add-task-form">
                <label className="field-label">
                  Task Title
                  <input
                    type="text"
                    placeholder="Enter task title"
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addTask();
                      }
                    }}
                  />
                </label>
                <div className="add-task-actions">
                  <s-button type="button" variant="primary" onClick={addTask}>
                    Add task
                  </s-button>
                  <s-button
                    type="button"
                    variant="tertiary"
                    onClick={() => {
                      setAddingTask(false);
                      setDraftTitle("");
                    }}
                  >
                    Cancel
                  </s-button>
                </div>
              </div>
            ) : (
              <s-button
                type="button"
                variant="secondary"
                onClick={() => setAddingTask(true)}
              >
                <span className="button-content">
                  <Plus aria-hidden="true" size={14} />
                  Add task
                </span>
              </s-button>
            )}
          </FormSection>
        </s-stack>
      </Form>

      <style>{CREATE_TASKLIST_STYLES}</style>
    </s-page>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="form-section">
      <div className="form-section-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <div className="form-section-card">{children}</div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

const CREATE_TASKLIST_STYLES = `
  .form-section {
    align-items: start;
    display: grid;
    gap: 24px;
    grid-template-columns: minmax(180px, 280px) 1fr;
    min-width: 0;
  }

  .form-section-copy {
    color: #303030;
    display: grid;
    gap: 6px;
  }

  .form-section-copy span,
  .help-text,
  .tasks-header p {
    color: #616161;
    font-size: 13px;
  }

  .form-section-card {
    background: #fff;
    border: 1px solid #e3e3e3;
    border-radius: 12px;
    display: grid;
    gap: 14px;
    min-width: 0;
    padding: 18px;
  }

  .field-label,
  .group-label {
    color: #303030;
    display: grid;
    font-size: 13px;
    font-weight: 600;
    gap: 6px;
  }

  .field-label input,
  .field-label textarea {
    border: 1px solid #8a8a8a;
    border-radius: 8px;
    box-sizing: border-box;
    font: inherit;
    font-weight: 400;
    min-height: 36px;
    padding: 8px 10px;
    width: 100%;
  }

  .field-label textarea {
    min-height: 96px;
    resize: vertical;
  }

  .assign-block,
  .assignee-picker,
  .scope-block,
  .staff-options,
  .task-list,
  .add-task-form {
    display: grid;
    gap: 10px;
  }

  .scope-block {
    border-top: 1px solid #ececec;
    padding-top: 12px;
  }

  .check-row,
  .radio-row,
  .timeline-row {
    align-items: flex-start;
    color: #303030;
    display: flex;
    font-size: 13px;
    gap: 8px;
  }

  .timeline-row span {
    display: grid;
    gap: 2px;
  }

  .timeline-row small {
    color: #616161;
    font-size: 12px;
  }

  .assignee-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chip {
    align-items: center;
    background: #f1f2f3;
    border-radius: 999px;
    display: inline-flex;
    font-size: 12px;
    font-weight: 600;
    gap: 6px;
    padding: 4px 8px 4px 10px;
  }

  .chip button {
    align-items: center;
    background: transparent;
    border: 0;
    color: #616161;
    cursor: pointer;
    display: inline-flex;
    padding: 0;
  }

  .tasks-header {
    display: grid;
    gap: 4px;
  }

  .tasks-header strong,
  .tasks-header p {
    margin: 0;
  }

  .task-row {
    align-items: center;
    border: 1px solid #e3e3e3;
    border-radius: 10px;
    display: grid;
    gap: 10px;
    grid-template-columns: 20px 1fr auto auto;
    padding: 10px 12px;
  }

  .drag-handle {
    color: #8a8a8a;
    cursor: grab;
  }

  .task-title {
    color: #202223;
    font-size: 13px;
    font-weight: 600;
  }

  .active-badge {
    background: #008060;
    border-radius: 999px;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    padding: 3px 8px;
  }

  .delete-task {
    align-items: center;
    background: transparent;
    border: 0;
    color: #d72c0d;
    cursor: pointer;
    display: inline-flex;
    padding: 2px;
  }

  .add-task-actions {
    display: flex;
    gap: 8px;
  }

  .button-content {
    align-items: center;
    display: inline-flex;
    gap: 4px;
  }

  @media (max-width: 900px) {
    .form-section {
      grid-template-columns: 1fr;
    }
  }
`;
