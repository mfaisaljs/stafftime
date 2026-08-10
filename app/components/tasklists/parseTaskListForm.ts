export type ParsedTaskListForm =
  | {
      name: string;
      description: string | null;
      assignStaff: boolean;
      assignManagers: boolean;
      staffScope: "ALL" | "SELECTED";
      managerScope: "ALL" | "SELECTED";
      employeeIds: string[];
      managerIds: string[];
      locationAccess: "ALL" | "SPECIFIC";
      locationIds: string[];
      timelines: string[];
      tasks: Array<{ id: string | null; title: string }>;
    }
  | { error: string };

export function parseTaskListForm(formData: FormData): ParsedTaskListForm {
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
  const timeline = String(formData.get("timeline") ?? "");
  const timelines = ["DAILY", "WEEKLY", "MONTHLY"].includes(timeline)
    ? [timeline]
    : [];
  const taskTitles = formData
    .getAll("taskTitles")
    .map((value) => String(value).trim());
  const taskItemIds = formData
    .getAll("taskItemIds")
    .map((value) => String(value).trim());

  const tasks = taskTitles
    .map((title, index) => ({
      id: taskItemIds[index] || null,
      title,
    }))
    .filter((task) => task.title.length > 0);

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
    return { error: "Choose a timeline." };
  }
  if (tasks.length === 0) {
    return { error: "Add at least one task." };
  }

  return {
    name,
    description: description || null,
    assignStaff,
    assignManagers,
    staffScope: assignStaff ? staffScope : "ALL",
    managerScope: assignManagers ? managerScope : "ALL",
    employeeIds: assignStaff && staffScope === "SELECTED" ? employeeIds : [],
    managerIds: assignManagers && managerScope === "SELECTED" ? managerIds : [],
    locationAccess,
    locationIds: locationAccess === "SPECIFIC" ? locationIds : [],
    timelines,
    tasks,
  };
}
