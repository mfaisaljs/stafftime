import { describe, expect, it } from "vitest";
import { parseTaskListForm } from "./parseTaskListForm";

function validForm(extra?: Record<string, string | string[]>) {
  const formData = new FormData();
  formData.set("name", "Open store");
  formData.set("assignStaff", "true");
  formData.set("timeline", "DAILY");
  formData.append("taskTitles", "Unlock doors");
  formData.append("taskItemIds", "task-1");
  formData.append("taskTitles", "Count drawer");
  formData.append("taskItemIds", "");
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) formData.append(key, item);
    } else {
      formData.set(key, value);
    }
  }
  return formData;
}

describe("parseTaskListForm shared flags", () => {
  it("defaults missing shared flags to true", () => {
    const parsed = parseTaskListForm(validForm());
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.tasks.map((task) => task.shared)).toEqual([true, true]);
  });

  it("reads per-task shared flags in order", () => {
    const parsed = parseTaskListForm(
      validForm({ taskShared: ["true", "false"] }),
    );
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.tasks).toEqual([
      { id: "task-1", title: "Unlock doors", shared: true },
      { id: null, title: "Count drawer", shared: false },
    ]);
  });
});
