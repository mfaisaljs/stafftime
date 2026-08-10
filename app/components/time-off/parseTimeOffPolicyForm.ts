const POLICY_TYPES = new Set(["TIME_OFF", "SICK_LEAVE"]);

export type ParsedTimeOffPolicyForm =
  | {
      name: string;
      policyType: string;
      compensation: string;
      fullDayDuration: number;
      employeeIds: string[];
      active: boolean;
    }
  | { error: string };

export function parseTimeOffPolicyForm(
  formData: FormData,
  options?: { allowActive?: boolean },
): ParsedTimeOffPolicyForm {
  const name = String(formData.get("name") ?? "").trim();
  const policyType = String(formData.get("policyType") ?? "TIME_OFF");
  const compensation = String(formData.get("compensation") ?? "UNPAID");
  const fullDayDuration = Number(formData.get("fullDayDuration") ?? 8);
  const employeeIds = formData
    .getAll("employeeIds")
    .map(String)
    .filter(Boolean);
  const active = options?.allowActive
    ? String(formData.get("active") ?? "") === "true"
    : true;

  if (!name) {
    return { error: "Policy name is required." };
  }
  if (!POLICY_TYPES.has(policyType)) {
    return { error: "Select a valid policy type." };
  }
  if (compensation !== "PAID" && compensation !== "UNPAID") {
    return { error: "Select paid or unpaid status." };
  }
  if (!Number.isFinite(fullDayDuration) || fullDayDuration <= 0) {
    return { error: "Full day duration must be greater than 0." };
  }

  return {
    name,
    policyType,
    compensation,
    fullDayDuration,
    employeeIds,
    active,
  };
}
