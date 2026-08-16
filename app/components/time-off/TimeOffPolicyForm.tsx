import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { useSaveBarToast } from "../../hooks/useSaveBarToast";
import { useSaveBarToast } from "../../hooks/useSaveBarToast";
import { Form } from "react-router";
import { AppPage } from "../AppPage";
import { User } from "lucide-react";

export type TimeOffPolicyEmployeeOption = {
  id: string;
  name: string;
  position: string;
};

export type TimeOffPolicyInitial = {
  id?: string;
  name: string;
  policyType: string;
  compensation: string;
  fullDayDuration: number;
  employeeIds: string[];
  active?: boolean;
};

type TimeOffPolicyFormProps = {
  mode: "create" | "edit";
  employees: TimeOffPolicyEmployeeOption[];
  initialPolicy?: TimeOffPolicyInitial | null;
  actionError?: string | null;
};

const POLICY_TYPES = [
  { value: "TIME_OFF", label: "Time Off" },
  { value: "SICK_LEAVE", label: "Sick Leave" },
] as const;

export function TimeOffPolicyForm({
  mode,
  employees,
  initialPolicy,
  actionError,
}: TimeOffPolicyFormProps) {
  const dirtyInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    () => initialPolicy?.employeeIds ?? [],
  );
  const [active, setActive] = useState(initialPolicy?.active ?? true);
  const allSelected =
    employees.length > 0 && selectedIds.length === employees.length;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const pageHeading = mode === "edit" ? "Edit Policy" : "Create Policy";

  useSaveBarToast(actionError ? { error: actionError } : null);

  const markDirty = () => {
    if (dirtyInputRef.current) {
      dirtyInputRef.current.value = String(Date.now());
      notifySaveBar(dirtyInputRef.current);
    }
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : employees.map((employee) => employee.id));
    markDirty();
  };

  const toggleOne = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
    markDirty();
  };

  const handleDiscard = () => {
    setSelectedIds(initialPolicy?.employeeIds ?? []);
    setActive(initialPolicy?.active ?? true);
  };

  return (
    <AppPage heading={pageHeading} inlineSize="large">
      <Form
        method="post"
        data-save-bar
        data-discard-confirmation
        onReset={handleDiscard}
      >
        <input
          ref={dirtyInputRef}
          type="hidden"
          name="_dirty"
          defaultValue="0"
        />
        {selectedIds.map((id) => (
          <input key={id} type="hidden" name="employeeIds" value={id} />
        ))}

        <s-stack direction="block" gap="large">
          <FormSection
            title="Policy Information"
            description={
              mode === "edit"
                ? "Update the details for this policy."
                : "Enter the details for the new policy."
            }
          >
            <label className="field">
              <span>Policy Name</span>
              <input
                name="name"
                type="text"
                placeholder="Policy Name"
                defaultValue={initialPolicy?.name ?? ""}
                required
              />
            </label>
            <label className="field">
              <span>Policy Type</span>
              <select
                name="policyType"
                defaultValue={initialPolicy?.policyType ?? "TIME_OFF"}
              >
                {POLICY_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {mode === "edit" && (
              <label className="radio-option">
                <input
                  type="checkbox"
                  name="active"
                  value="true"
                  checked={active}
                  onChange={(event) => {
                    setActive(event.currentTarget.checked);
                    markDirty();
                  }}
                />
                Active policy
              </label>
            )}
          </FormSection>

          <FormSection
            title="Paid/Unpaid Status"
            description="Select whether the policy is paid or unpaid."
          >
            <fieldset className="radio-fieldset">
              <legend>Paid Status</legend>
              <label className="radio-option">
                <input
                  type="radio"
                  name="compensation"
                  value="UNPAID"
                  defaultChecked={
                    (initialPolicy?.compensation ?? "UNPAID") === "UNPAID"
                  }
                />
                Unpaid
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="compensation"
                  value="PAID"
                  defaultChecked={initialPolicy?.compensation === "PAID"}
                />
                Paid
              </label>
            </fieldset>
          </FormSection>

          <FormSection
            title="Full Day Duration"
            description="Enter the duration for a full day."
          >
            <label className="field duration-field">
              <span>Full Day Duration</span>
              <span className="duration-input">
                <input
                  name="fullDayDuration"
                  type="number"
                  min="0.5"
                  step="0.5"
                  defaultValue={String(initialPolicy?.fullDayDuration ?? 8)}
                  required
                />
                <span className="suffix">Hours</span>
              </span>
            </label>
          </FormSection>

          <FormSection
            title="Assigned Staff Members"
            description="Select the staff members to whom this policy applies."
          >
            <div className="staff-table-wrap">
              <table className="staff-table">
                <thead>
                  <tr>
                    <th className="check-col">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label="Select all staff"
                      />
                    </th>
                    <th>Staff</th>
                    <th>Position</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id}>
                      <td className="check-col">
                        <input
                          type="checkbox"
                          checked={selectedSet.has(employee.id)}
                          onChange={() => toggleOne(employee.id)}
                          aria-label={`Select ${employee.name}`}
                        />
                      </td>
                      <td>
                        <span className="staff-cell">
                          <span className="staff-icon" aria-hidden="true">
                            <User size={14} />
                          </span>
                          {employee.name}
                        </span>
                      </td>
                      <td>{employee.position}</td>
                    </tr>
                  ))}
                  {employees.length === 0 && (
                    <tr>
                      <td colSpan={3} className="empty-cell">
                        No staff members available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </FormSection>
        </s-stack>
      </Form>

      <style>{POLICY_FORM_STYLES}</style>
    </AppPage>
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

function notifySaveBar(element: HTMLInputElement) {
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

const POLICY_FORM_STYLES = `
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

  .form-section-copy span {
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

  .field {
    display: grid;
    gap: 6px;
  }

  .field > span {
    color: #303030;
    font-size: 13px;
    font-weight: 600;
  }

  .field input,
  .field select {
    background: #fff;
    border: 1px solid #c9cccf;
    border-radius: 8px;
    color: #303030;
    font: inherit;
    min-height: 36px;
    padding: 0 12px;
    width: 100%;
  }

  .radio-fieldset {
    border: 0;
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
  }

  .radio-fieldset legend {
    color: #303030;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 4px;
    padding: 0;
  }

  .radio-option {
    align-items: center;
    color: #303030;
    display: inline-flex;
    gap: 8px;
  }

  .duration-field {
    max-width: 280px;
  }

  .duration-input {
    align-items: center;
    display: grid;
    grid-template-columns: 1fr auto;
    position: relative;
  }

  .duration-input input {
    padding-right: 64px;
  }

  .duration-input .suffix {
    color: #616161;
    font-size: 13px;
    pointer-events: none;
    position: absolute;
    right: 12px;
  }

  .staff-table-wrap {
    border: 1px solid #ebebeb;
    border-radius: 10px;
    overflow: hidden;
  }

  .staff-table {
    border-collapse: collapse;
    width: 100%;
  }

  .staff-table th,
  .staff-table td {
    border-bottom: 1px solid #ebebeb;
    color: #303030;
    padding: 12px 14px;
    text-align: left;
  }

  .staff-table th {
    background: #fafafa;
    color: #616161;
    font-size: 12px;
    font-weight: 650;
  }

  .staff-table tbody tr:last-child td {
    border-bottom: 0;
  }

  .check-col {
    width: 44px;
  }

  .staff-cell {
    align-items: center;
    display: inline-flex;
    gap: 10px;
  }

  .staff-icon {
    align-items: center;
    background: #6b4eff;
    border-radius: 6px;
    color: #fff;
    display: inline-flex;
    height: 28px;
    justify-content: center;
    width: 28px;
  }

  .empty-cell {
    color: #616161;
    text-align: center !important;
  }

  @media (max-width: 800px) {
    .form-section {
      grid-template-columns: 1fr;
    }
  }
`;
