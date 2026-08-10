import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { CircleHelp, Copy, Info } from "lucide-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAdminShop } from "../services/admin.server";
import prisma from "../db.server";

const WEEKDAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

const EARLY_CLOCK_IN_OPTIONS = [5, 10, 15, 30, 45, 60];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  let settings = shop.settings;
  if (!settings) {
    settings = await prisma.setting.create({
      data: { shopId: shop.id },
    });
  }

  return {
    shopDomain: session.shop,
    portalUrl: `https://portal.movestaff.com/?ShopDomain=${session.shop}`,
    settings: {
      deductBreakTime: settings.deductBreakTime,
      salaryAfterFirstClockIn: settings.salaryAfterFirstClockIn,
      blockBreakAfterEndTime: settings.blockBreakAfterEndTime,
      allowEarlyClockIn: settings.allowEarlyClockIn,
      earlyClockInMinutes: settings.earlyClockInMinutes,
      showPayrollStatsInPos: settings.showPayrollStatsInPos,
      requirePhoto: settings.requirePhoto,
      requireGps: settings.requireGps,
      timeFormat: settings.timeFormat,
      hourFormat: settings.hourFormat,
      excludePaidLeavesFromAbsences: settings.excludePaidLeavesFromAbsences,
      includeUnpaidLeavesInAbsences: settings.includeUnpaidLeavesInAbsences,
      autoAddPaidLeavesToSalary: settings.autoAddPaidLeavesToSalary,
      autoDeductUnpaidLeavesFromSalary: settings.autoDeductUnpaidLeavesFromSalary,
      autoDeductAbsencesFromSalary: settings.autoDeductAbsencesFromSalary,
      defaultDailyWorkingHours: settings.defaultDailyWorkingHours,
      holidayWeekdays: parseWeekdays(settings.holidayWeekdays),
      portalClockIn: settings.portalClockIn,
      portalManagerView: settings.portalManagerView,
      portalTimeOff: settings.portalTimeOff,
      portalProfileShifts: settings.portalProfileShifts,
      portalTaskList: settings.portalTaskList,
      portalViewShifts: settings.portalViewShifts,
      portalTimesheet: settings.portalTimesheet,
      portalCreateShift: settings.portalCreateShift,
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const formData = await request.formData();

  const earlyClockInMinutes = Number(formData.get("earlyClockInMinutes") ?? 30);
  const defaultDailyWorkingHours = Number(
    formData.get("defaultDailyWorkingHours") ?? 8,
  );
  const timeFormat = String(formData.get("timeFormat") ?? "24H");
  const hourFormat = String(formData.get("hourFormat") ?? "STANDARD");
  const holidayWeekdays = formData
    .getAll("holidayWeekdays")
    .map(String)
    .filter((day): day is (typeof WEEKDAYS)[number] =>
      (WEEKDAYS as readonly string[]).includes(day),
    );

  if (![5, 10, 15, 30, 45, 60].includes(earlyClockInMinutes)) {
    return { error: "Select a valid early clock-in window." };
  }
  if (!Number.isFinite(defaultDailyWorkingHours) || defaultDailyWorkingHours < 0) {
    return { error: "Default daily working hours must be 0 or greater." };
  }
  if (timeFormat !== "24H" && timeFormat !== "12H") {
    return { error: "Select a valid time format." };
  }
  if (hourFormat !== "STANDARD" && hourFormat !== "DECIMAL") {
    return { error: "Select a valid hour format." };
  }

  await prisma.setting.upsert({
    where: { shopId: shop.id },
    create: {
      shopId: shop.id,
      ...settingsFromForm(formData, {
        earlyClockInMinutes,
        defaultDailyWorkingHours,
        timeFormat,
        hourFormat,
        holidayWeekdays,
      }),
    },
    update: settingsFromForm(formData, {
      earlyClockInMinutes,
      defaultDailyWorkingHours,
      timeFormat,
      hourFormat,
      holidayWeekdays,
    }),
  });

  return { success: "Settings saved." };
};

export default function SettingsPage() {
  const { settings, portalUrl } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const dirtyInputRef = useRef<HTMLInputElement>(null);
  const [allowEarlyClockIn, setAllowEarlyClockIn] = useState(
    settings.allowEarlyClockIn,
  );
  useEffect(() => {
    setAllowEarlyClockIn(settings.allowEarlyClockIn);
  }, [settings.allowEarlyClockIn]);
  const [copied, setCopied] = useState(false);
  const isSubmitting = navigation.state === "submitting";

  const markDirty = () => {
    if (!dirtyInputRef.current) return;
    dirtyInputRef.current.value = String(Date.now());
    dirtyInputRef.current.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const copyPortalUrl = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <s-page heading="Settings" inlineSize="large">
      {actionData && "error" in actionData && actionData.error && (
        <s-banner heading={actionData.error} tone="critical" />
      )}
      {actionData && "success" in actionData && actionData.success && (
        <s-banner heading={actionData.success} tone="success" />
      )}

      <Form method="post" data-save-bar data-discard-confirmation>
        <input
          ref={dirtyInputRef}
          type="hidden"
          name="_dirty"
          defaultValue="0"
        />

        <s-stack direction="block" gap="large">
          <FormSection
            title="Clock Event Settings"
            description="Manage clock related settings."
          >
            <SettingCheckbox
              name="deductBreakTime"
              label="Deduct break time from total hours"
              help="When enabled, unpaid break time is removed from total worked hours."
              defaultChecked={settings.deductBreakTime}
              onChange={markDirty}
            />
            <SettingCheckbox
              name="salaryAfterFirstClockIn"
              label="Calculate weekly/monthly salary starts after first clock in date"
              help="Salary period calculations begin from the staff member's first clock-in date."
              defaultChecked={settings.salaryAfterFirstClockIn}
              onChange={markDirty}
            />
            <SettingCheckbox
              name="blockBreakAfterEndTime"
              label="Don't allow staff to take break after break end time"
              help="Prevents starting a break once the scheduled break end time has passed."
              defaultChecked={settings.blockBreakAfterEndTime}
              onChange={markDirty}
            />

            <div className="setting-row inline-row">
              <input
                type="hidden"
                name="allowEarlyClockIn"
                value={allowEarlyClockIn ? "true" : "false"}
              />
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={allowEarlyClockIn}
                  onChange={(event) => {
                    setAllowEarlyClockIn(event.currentTarget.checked);
                    markDirty();
                  }}
                />
                <span>Allow staff to clock in</span>
              </label>
              <select
                name="earlyClockInMinutes"
                defaultValue={String(settings.earlyClockInMinutes)}
                disabled={!allowEarlyClockIn}
                onChange={markDirty}
                aria-label="Early clock-in minutes"
              >
                {EARLY_CLOCK_IN_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} Minutes
                  </option>
                ))}
              </select>
              <span className="inline-text">Before shift start</span>
              <HelpTip
                id="help-early-clock-in"
                text="Staff may clock in this many minutes before their scheduled shift starts."
              />
            </div>

            <SettingCheckbox
              name="showPayrollStatsInPos"
              label="Show payroll stats of staff in POS to managers"
              help="Managers can view payroll stats for staff from the POS app."
              defaultChecked={settings.showPayrollStatsInPos}
              onChange={markDirty}
            />
            <SettingCheckbox
              name="requirePhoto"
              label="Take Selfie before clock in/out"
              help="Requires a selfie photo verification on clock-in and clock-out."
              defaultChecked={settings.requirePhoto}
              onChange={markDirty}
            />
            <SettingCheckbox
              name="requireGps"
              label="Verify GPS location during clock in/out"
              help="Requires GPS location verification within the store geofence."
              defaultChecked={settings.requireGps}
              onChange={markDirty}
            />

            <div className="setting-row select-row">
              <label>
                <span>Time Format:</span>
                <select
                  name="timeFormat"
                  defaultValue={settings.timeFormat}
                  onChange={markDirty}
                >
                  <option value="24H">24-hour (00:00-23:59)</option>
                  <option value="12H">12-hour (1:00 AM-12:59 PM)</option>
                </select>
              </label>
              <HelpTip
                id="help-time-format"
                text="Controls how times are displayed across Admin and POS."
              />
            </div>

            <div className="setting-row select-row">
              <label>
                <span>Hour Format:</span>
                <select
                  name="hourFormat"
                  defaultValue={settings.hourFormat}
                  onChange={markDirty}
                >
                  <option value="STANDARD">Standard (1h 30m)</option>
                  <option value="DECIMAL">Decimal (1.50h)</option>
                </select>
              </label>
              <HelpTip
                id="help-hour-format"
                text="Controls how hour totals are formatted in reports and timesheets."
              />
            </div>
          </FormSection>

          <FormSection
            title="Absence Calculation Settings"
            description="Configure how absences are calculated."
          >
            <SettingCheckbox
              name="excludePaidLeavesFromAbsences"
              label="Exclude paid leaves from total absences"
              help="Paid leave days are not counted toward absence totals."
              defaultChecked={settings.excludePaidLeavesFromAbsences}
              onChange={markDirty}
            />
            <SettingCheckbox
              name="includeUnpaidLeavesInAbsences"
              label="Include unpaid leaves in total absences"
              help="Unpaid leave days are included in absence totals."
              defaultChecked={settings.includeUnpaidLeavesInAbsences}
              onChange={markDirty}
            />
            <SettingCheckbox
              name="autoAddPaidLeavesToSalary"
              label="Automatically add paid leaves to salary"
              help="Paid leave hours are automatically included in salary calculations."
              defaultChecked={settings.autoAddPaidLeavesToSalary}
              onChange={markDirty}
            />
            <SettingCheckbox
              name="autoDeductUnpaidLeavesFromSalary"
              label="Automatically deduct unpaid leaves from salary"
              help="Unpaid leave hours are automatically deducted from salary."
              defaultChecked={settings.autoDeductUnpaidLeavesFromSalary}
              onChange={markDirty}
            />
            <SettingCheckbox
              name="autoDeductAbsencesFromSalary"
              label="Automatically deduct absences from salary"
              help="Unexcused absences are automatically deducted from salary."
              defaultChecked={settings.autoDeductAbsencesFromSalary}
              onChange={markDirty}
            />

            <div className="setting-row field-row">
              <label className="field">
                <span>Default Daily Working Hours</span>
                <input
                  name="defaultDailyWorkingHours"
                  type="number"
                  min="0"
                  step="0.5"
                  defaultValue={String(settings.defaultDailyWorkingHours)}
                  onChange={markDirty}
                />
              </label>
              <HelpTip
                id="help-default-hours"
                text="Used when calculating full-day absences and leave duration."
              />
            </div>
          </FormSection>

          <FormSection
            title="Holiday Rules Settings"
            description="Configure which days of the week are considered holidays."
          >
            <p className="section-intro">
              Select the days you want to mark as holidays:
            </p>
            <div className="weekday-row">
              {WEEKDAYS.map((day) => (
                <label key={day} className="check-label">
                  <input
                    type="checkbox"
                    name="holidayWeekdays"
                    value={day}
                    defaultChecked={settings.holidayWeekdays.includes(day)}
                    onChange={markDirty}
                  />
                  <span>{weekdayLabel(day)}</span>
                </label>
              ))}
            </div>
            <p className="info-note">
              <Info aria-hidden="true" size={14} />
              Holidays will not be counted as absences
            </p>
          </FormSection>

          <FormSection
            title="Staff Portal"
            description="Control portal features and access for your staff."
          >
            <p className="section-intro">
              Your staff can access the portal using this link:
            </p>
            <div className="portal-url-row">
              <input
                type="text"
                readOnly
                value={portalUrl}
                aria-label="Staff portal URL"
              />
              <button
                type="button"
                className="copy-button"
                aria-label="Copy portal URL"
                onClick={copyPortalUrl}
              >
                <Copy aria-hidden="true" size={16} />
              </button>
            </div>
            {copied && <p className="copied-note">Link copied</p>}

            <div className="portal-grid">
              <PortalFeature
                name="portalClockIn"
                title="Clock In"
                description="Staff can clock in/out"
                defaultChecked={settings.portalClockIn}
                onChange={markDirty}
              />
              <PortalFeature
                name="portalManagerView"
                title="Manager View"
                description="Access management features"
                defaultChecked={settings.portalManagerView}
                onChange={markDirty}
              />
              <PortalFeature
                name="portalTimeOff"
                title="Time Off"
                description="Submit leave off requests"
                defaultChecked={settings.portalTimeOff}
                onChange={markDirty}
              />
              <PortalFeature
                name="portalProfileShifts"
                title="My Profile & Shifts"
                description="View/edit profile info"
                defaultChecked={settings.portalProfileShifts}
                onChange={markDirty}
              />
              <PortalFeature
                name="portalTaskList"
                title="Task List"
                description="View Task List"
                defaultChecked={settings.portalTaskList}
                onChange={markDirty}
              />
              <PortalFeature
                name="portalViewShifts"
                title="View Shifts"
                description="View assigned shifts"
                defaultChecked={settings.portalViewShifts}
                onChange={markDirty}
              />
              <PortalFeature
                name="portalTimesheet"
                title="Timesheet"
                description="Staff can view their monthly timesheet after entering PIN"
                defaultChecked={settings.portalTimesheet}
                onChange={markDirty}
              />
              <PortalFeature
                name="portalCreateShift"
                title="Create Shift"
                description="Allow managers to create shifts via POS portal"
                defaultChecked={settings.portalCreateShift}
                onChange={markDirty}
              />
            </div>
          </FormSection>

          <div className="form-actions">
            <s-button
              type="submit"
              variant="primary"
              {...(isSubmitting ? { loading: true } : {})}
            >
              Save Settings
            </s-button>
          </div>
        </s-stack>
      </Form>

      <p className="knowledge-link">
        For more assistance, visit our <Link to="/app">Knowledge Base</Link>
      </p>

      <style>{SETTINGS_STYLES}</style>
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

function SettingCheckbox({
  name,
  label,
  help,
  defaultChecked,
  onChange,
}: {
  name: string;
  label: string;
  help: string;
  defaultChecked: boolean;
  onChange: () => void;
}) {
  const [checked, setChecked] = useState(defaultChecked);
  useEffect(() => {
    setChecked(defaultChecked);
  }, [defaultChecked]);

  return (
    <div className="setting-row">
      {/* Hidden field always posts true/false so Save never drops checked toggles. */}
      <input type="hidden" name={name} value={checked ? "true" : "false"} />
      <label className="check-label">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => {
            setChecked(event.currentTarget.checked);
            onChange();
          }}
        />
        <span>{label}</span>
      </label>
      <HelpTip id={`help-${name}`} text={help} />
    </div>
  );
}

function PortalFeature({
  name,
  title,
  description,
  defaultChecked,
  onChange,
}: {
  name: string;
  title: string;
  description: string;
  defaultChecked: boolean;
  onChange: () => void;
}) {
  const [checked, setChecked] = useState(defaultChecked);
  useEffect(() => {
    setChecked(defaultChecked);
  }, [defaultChecked]);

  return (
    <label className="portal-feature">
      <input type="hidden" name={name} value={checked ? "true" : "false"} />
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          setChecked(event.currentTarget.checked);
          onChange();
        }}
      />
      <span>
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
    </label>
  );
}

function HelpTip({ id, text }: { id: string; text: string }) {
  return (
    <>
      <s-tooltip id={id}>{text}</s-tooltip>
      <button
        type="button"
        className="help-button"
        aria-label="More information"
        interestFor={id}
      >
        <CircleHelp aria-hidden="true" size={15} />
      </button>
    </>
  );
}

function settingsFromForm(
  formData: FormData,
  values: {
    earlyClockInMinutes: number;
    defaultDailyWorkingHours: number;
    timeFormat: string;
    hourFormat: string;
    holidayWeekdays: string[];
  },
) {
  const checked = (name: string) => String(formData.get(name) ?? "") === "true";

  return {
    deductBreakTime: checked("deductBreakTime"),
    salaryAfterFirstClockIn: checked("salaryAfterFirstClockIn"),
    blockBreakAfterEndTime: checked("blockBreakAfterEndTime"),
    allowEarlyClockIn: checked("allowEarlyClockIn"),
    earlyClockInMinutes: values.earlyClockInMinutes,
    showPayrollStatsInPos: checked("showPayrollStatsInPos"),
    requirePhoto: checked("requirePhoto"),
    requireGps: checked("requireGps"),
    timeFormat: values.timeFormat,
    hourFormat: values.hourFormat,
    excludePaidLeavesFromAbsences: checked("excludePaidLeavesFromAbsences"),
    includeUnpaidLeavesInAbsences: checked("includeUnpaidLeavesInAbsences"),
    autoAddPaidLeavesToSalary: checked("autoAddPaidLeavesToSalary"),
    autoDeductUnpaidLeavesFromSalary: checked("autoDeductUnpaidLeavesFromSalary"),
    autoDeductAbsencesFromSalary: checked("autoDeductAbsencesFromSalary"),
    defaultDailyWorkingHours: values.defaultDailyWorkingHours,
    holidayWeekdays: JSON.stringify(values.holidayWeekdays),
    portalClockIn: checked("portalClockIn"),
    portalManagerView: checked("portalManagerView"),
    portalTimeOff: checked("portalTimeOff"),
    portalProfileShifts: checked("portalProfileShifts"),
    portalTaskList: checked("portalTaskList"),
    portalViewShifts: checked("portalViewShifts"),
    portalTimesheet: checked("portalTimesheet"),
    portalCreateShift: checked("portalCreateShift"),
  };
}

function parseWeekdays(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return ["SUNDAY"];
    return parsed.filter(
      (value): value is string =>
        typeof value === "string" &&
        (WEEKDAYS as readonly string[]).includes(value),
    );
  } catch {
    return ["SUNDAY"];
  }
}

function weekdayLabel(day: string) {
  return day.charAt(0) + day.slice(1).toLowerCase();
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

const SETTINGS_STYLES = `
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

  .form-section-copy strong {
    font-size: 16px;
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

  .setting-row {
    align-items: center;
    display: grid;
    gap: 10px;
    grid-template-columns: 1fr auto;
  }

  .setting-row.inline-row {
    grid-template-columns: auto auto auto 1fr auto;
    justify-items: start;
  }

  .setting-row.select-row {
    grid-template-columns: 1fr auto;
  }

  .setting-row.select-row label,
  .setting-row.field-row .field {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .setting-row.select-row span,
  .field > span {
    color: #303030;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
  }

  .check-label {
    align-items: center;
    color: #303030;
    display: inline-flex;
    gap: 10px;
    min-width: 0;
  }

  .inline-text {
    color: #303030;
    white-space: nowrap;
  }

  select,
  .field input,
  .portal-url-row input {
    background: #fff;
    border: 1px solid #c9cccf;
    border-radius: 8px;
    color: #303030;
    font: inherit;
    min-height: 36px;
    padding: 0 12px;
  }

  .field {
    display: grid;
    gap: 6px;
    width: 100%;
  }

  .field input {
    width: 100%;
  }

  .help-button {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 999px;
    color: #8a8a8a;
    cursor: pointer;
    display: inline-flex;
    height: 24px;
    justify-content: center;
    padding: 0;
    width: 24px;
  }

  .section-intro {
    color: #303030;
    font-size: 13px;
    margin: 0;
  }

  .weekday-row {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 18px;
  }

  .info-note {
    align-items: center;
    color: #616161;
    display: inline-flex;
    gap: 8px;
    font-size: 13px;
    margin: 0;
  }

  .portal-url-row {
    align-items: center;
    display: grid;
    gap: 8px;
    grid-template-columns: 1fr auto;
  }

  .portal-url-row input {
    background: #f6f6f7;
    width: 100%;
  }

  .copy-button {
    align-items: center;
    background: #fff;
    border: 1px solid #c9cccf;
    border-radius: 8px;
    color: #303030;
    cursor: pointer;
    display: inline-flex;
    height: 36px;
    justify-content: center;
    width: 36px;
  }

  .copied-note {
    color: #0b6b32;
    font-size: 12px;
    margin: 0;
  }

  .portal-grid {
    display: grid;
    gap: 14px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .portal-feature {
    align-items: start;
    display: grid;
    gap: 10px;
    grid-template-columns: auto 1fr;
  }

  .portal-feature strong {
    color: #303030;
    display: block;
    font-size: 14px;
  }

  .portal-feature span span {
    color: #616161;
    display: block;
    font-size: 12px;
    margin-top: 2px;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
  }

  .knowledge-link {
    color: #616161;
    font-size: 13px;
    margin: 18px 0 0;
    text-align: center;
  }

  .knowledge-link a {
    color: #005bd3;
    text-decoration: underline;
  }

  @media (max-width: 900px) {
    .form-section {
      grid-template-columns: 1fr;
    }

    .setting-row.inline-row {
      grid-template-columns: 1fr;
    }

    .portal-grid {
      grid-template-columns: 1fr;
    }
  }
`;
