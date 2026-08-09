import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useEffect, useMemo, useState } from "react";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  AlertTriangle,
  CalendarDays,
  Clock,
  Copy,
  Edit3,
  Palette,
  PlusCircle,
  Printer,
  Trash2,
  User,
} from "lucide-react";
import { authenticate } from "../shopify.server";
import { getAdminShop } from "../services/admin.server";
import prisma from "../db.server";

type ScheduleActionResult = { success?: string; error?: string };
type SchedulePeriod = "weekly" | "monthly" | "yearly";
type ScheduleModal =
  | { mode: "create"; employeeId: string; dateKey: string }
  | { mode: "edit"; shiftId: string }
  | null;

const WEEKDAY_VALUES = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

const WEEKDAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const SCHEDULE_PERIODS: Array<{ value: SchedulePeriod; label: string }> = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const MONTH_OPTIONS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const url = new URL(request.url);
  const period = normalizePeriod(url.searchParams.get("period"));
  const rawSelectedDate = parseDateKey(
    url.searchParams.get("date") ?? url.searchParams.get("week"),
  );
  const selectedDate =
    period === "yearly" && rawSelectedDate.getFullYear() < new Date().getFullYear()
      ? new Date(new Date().getFullYear(), rawSelectedDate.getMonth(), 1)
      : rawSelectedDate;
  const range = rangeForPeriod(selectedDate, period);

  const [employees, shifts, locations] = await Promise.all([
    prisma.employee.findMany({
      where: { shopId: shop.id, status: { not: "ARCHIVED" } },
      include: { location: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.shift.findMany({
      where: {
        shopId: shop.id,
        startsAt: { gte: range.start, lte: range.end },
      },
      include: { employee: true, location: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.storeLocation.findMany({
      where: { shopId: shop.id, active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const days = buildRangeDays(range.start, range.end);

  return {
    days,
    period,
    selectedDate: toDateKey(selectedDate),
    weekStart: toDateKey(range.start),
    weekEnd: toDateKey(range.end),
    employees: employees.map((employee) => ({
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`,
      initials: initials(employee.firstName, employee.lastName),
      position: employee.position ?? "Staff",
      hourlyRate: employee.hourlyRate,
      currency: employee.currency,
      weeklyAvailability:
        employee.weeklyAvailability ??
        "MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY,SATURDAY",
    })),
    shifts: shifts.map((shift) => ({
      id: shift.id,
      employeeId: shift.employeeId,
      locationId: shift.locationId,
      locationName: shift.location.name,
      employeeName: `${shift.employee.firstName} ${shift.employee.lastName}`,
      dateKey: toDateKey(shift.startsAt),
      startsAt: shift.startsAt.toISOString(),
      endsAt: shift.endsAt.toISOString(),
      startTime: timeValue(shift.startsAt),
      endTime: timeValue(shift.endsAt),
      notes: shift.notes ?? "",
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
  const intent = String(formData.get("intent") ?? "createShift");

  try {
    if (intent === "deleteShift") {
      const shiftId = String(formData.get("shiftId") ?? "");
      await prisma.shift.deleteMany({ where: { id: shiftId, shopId: shop.id } });
      return { success: "Shift deleted." };
    }

    if (intent === "clearWeek") {
      const employeeIds = formData.getAll("employeeIds").map(String).filter(Boolean);
      if (employeeIds.length === 0) {
        return { error: "Select at least one staff member." };
      }
      await prisma.shift.deleteMany({
        where: {
          shopId: shop.id,
          employeeId: { in: employeeIds },
        },
      });
      return { success: "Selected staff shifts deleted." };
    }

    if (intent === "updateAvailability") {
      const employeeId = String(formData.get("employeeId") ?? "");
      await assertEmployee(shop.id, employeeId);
      await prisma.employee.update({
        where: { id: employeeId },
        data: {
          weeklyAvailability: formData.getAll("weeklyAvailability").join(","),
        },
      });
      return { success: "Availability updated." };
    }

    const employeeId = String(formData.get("employeeId") ?? "");
    const locationId = String(formData.get("locationId") ?? "");
    const date = String(formData.get("date") ?? "");
    const startTime = String(formData.get("startTime") ?? "");
    const endTime = String(formData.get("endTime") ?? "");
    const notes = String(formData.get("notes") ?? "");
    const repeatWeek = formData.get("repeatWeek") === "on";

    await assertEmployee(shop.id, employeeId);
    await assertLocation(shop.id, locationId);

    if (!isDateKey(date) || !startTime || !endTime) {
      return { error: "Choose a valid date and shift time." };
    }

    const startsAt = dateTimeFromInputs(date, startTime);
    const endsAt = dateTimeFromInputs(date, endTime);
    if (isPastDateKey(date)) {
      return { error: "You cannot add or edit shifts for past dates." };
    }
    if (endsAt <= startsAt) {
      return { error: "End time must be after start time." };
    }

    if (intent === "updateShift") {
      const shiftId = String(formData.get("shiftId") ?? "");
      await prisma.shift.updateMany({
        where: { id: shiftId, shopId: shop.id },
        data: { employeeId, locationId, startsAt, endsAt, notes: notes || null },
      });
      return { success: "Shift updated." };
    }

    const weekStart = startOfWeek(dateTimeFromInputs(date, "00:00"));
    const createDates = repeatWeek
      ? WEEKDAY_VALUES.map((_, index) => toDateKey(addDays(weekStart, index))).filter(
          (value) => value >= date,
        )
      : [date];

    await prisma.shift.createMany({
      data: createDates.map((dateKey) => ({
        shopId: shop.id,
        locationId,
        employeeId,
        startsAt: dateTimeFromInputs(dateKey, startTime),
        endsAt: dateTimeFromInputs(dateKey, endTime),
        notes: notes || null,
      })),
    });
    return { success: "Shift created." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not save schedule.",
    };
  }
};

export default function SchedulesPage() {
  const {
    shifts,
    employees,
    locations,
    days,
    period,
    selectedDate,
    weekStart,
    weekEnd,
  } =
    useLoaderData<typeof loader>();
  const actionFetcher = useFetcher<ScheduleActionResult>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [shiftModal, setShiftModal] = useState<ScheduleModal>(null);
  const [availabilityEmployeeId, setAvailabilityEmployeeId] = useState("");
  const [selectedClearStaff, setSelectedClearStaff] = useState<Set<string>>(
    () => new Set(),
  );
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [draftRange, setDraftRange] = useState(`${weekStart}--${weekEnd}`);

  useEffect(() => {
    if (actionFetcher.data?.success) {
      setShiftModal(null);
      setAvailabilityEmployeeId("");
      setSelectedClearStaff(new Set());
    }
  }, [actionFetcher.data]);

  useEffect(() => {
    setDraftRange(`${weekStart}--${weekEnd}`);
  }, [weekStart, weekEnd]);

  useEffect(() => {
    if (shiftModal) {
      void showShopifyModal("shift-modal");
    }
  }, [shiftModal]);

  const shiftsByEmployeeDay = useMemo(() => {
    const map = new Map<string, typeof shifts>();
    for (const shift of shifts) {
      const key = `${shift.employeeId}:${shift.dateKey}`;
      map.set(key, [...(map.get(key) ?? []), shift]);
    }
    return map;
  }, [shifts]);
  const shiftsByDay = useMemo(() => {
    const map = new Map<string, typeof shifts>();
    for (const shift of shifts) {
      map.set(shift.dateKey, [...(map.get(shift.dateKey) ?? []), shift]);
    }
    return map;
  }, [shifts]);
  const monthlyDays = useMemo(
    () => buildMonthCalendarDays(dateFromKey(weekStart), dateFromKey(weekEnd)),
    [weekStart, weekEnd],
  );

  const selectedShift =
    shiftModal?.mode === "edit"
      ? shifts.find((shift) => shift.id === shiftModal.shiftId)
      : undefined;
  const selectedAvailabilityEmployee = employees.find(
    (employee) => employee.id === availabilityEmployeeId,
  );
  const selectedDateObject = dateFromKey(selectedDate);
  const selectedMonth = selectedDateObject.getMonth();
  const selectedYear = selectedDateObject.getFullYear();
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 10 }, (_, index) => currentYear + index);

  const selectAnchorDate = (date: string) => {
    const range = rangeForPeriod(dateFromKey(date), period);
    setDraftRange(`${toDateKey(range.start)}--${toDateKey(range.end)}`);
    const params = new URLSearchParams(searchParams);
    params.set("date", date);
    params.set("period", period);
    params.delete("week");
    setSearchParams(params);
    setDatePickerOpen(false);
  };

  const selectDateRange = (value: string) => {
    setDraftRange(value);
    const anchorDate = pickerAnchorDate(value);
    if (anchorDate) {
      selectAnchorDate(anchorDate);
    }
  };

  const changePeriod = (nextPeriod: SchedulePeriod) => {
    const anchorDate = nextPeriod === "yearly" ? new Date() : dateFromKey(selectedDate);
    const anchorDateKey = toDateKey(anchorDate);
    const range = rangeForPeriod(anchorDate, nextPeriod);
    setDraftRange(`${toDateKey(range.start)}--${toDateKey(range.end)}`);
    const params = new URLSearchParams(searchParams);
    params.set("period", nextPeriod);
    params.set("date", anchorDateKey);
    params.delete("week");
    setSearchParams(params);
  };

  const changeMonthYear = (month: number, year: number) => {
    const nextDate = toDateKey(new Date(year, month, 1));
    const range = rangeForPeriod(dateFromKey(nextDate), "yearly");
    setDraftRange(`${toDateKey(range.start)}--${toDateKey(range.end)}`);
    const params = new URLSearchParams(searchParams);
    params.set("period", "yearly");
    params.set("date", nextDate);
    params.delete("week");
    setSearchParams(params);
  };

  const closeShiftModal = () => {
    void hideShopifyModal("shift-modal");
    setShiftModal(null);
  };

  return (
    <s-page heading="Schedule" inlineSize="large">
      <div className="schedule-page">
        {actionFetcher.data?.error && (
          <s-banner tone="critical" heading={actionFetcher.data.error} />
        )}
        {actionFetcher.data?.success && (
          <s-banner tone="success" heading={actionFetcher.data.success} />
        )}

        <div className="schedule-toolbar">
          <div className="toolbar-left">
            <s-button variant="secondary">
              <span className="toolbar-button-content">
                <Palette aria-hidden="true" size={15} />
                Customize Colors
              </span>
            </s-button>
            <div className="color-select">
              <s-select
                label="Color mode"
                labelAccessibilityVisibility="exclusive"
                value="location"
              >
                <s-option value="location">Color by Location</s-option>
                <s-option value="staff">Color by Staff</s-option>
              </s-select>
            </div>
            <s-button variant="secondary">
              <span className="toolbar-button-content">
                <Copy aria-hidden="true" size={15} />
                Copy Week
              </span>
            </s-button>
            <s-button variant="secondary" onClick={() => window.print()}>
              <span className="toolbar-button-content">
                <Printer aria-hidden="true" size={15} />
                Print Schedule
              </span>
            </s-button>
            <s-button
              variant="secondary"
              tone="critical"
              commandFor="clear-shifts-modal"
              command="--show"
            >
              <span className="toolbar-button-content">
                <Trash2 aria-hidden="true" size={15} />
                Clear All Shifts
              </span>
            </s-button>
          </div>
          <div className="toolbar-right">
            {period === "yearly" ? (
              <>
                <div className="period-select">
                  <s-select
                    label="Schedule month"
                    labelAccessibilityVisibility="exclusive"
                    value={String(selectedMonth)}
                    onChange={(event) =>
                      changeMonthYear(Number(selectValue(event)), selectedYear)
                    }
                  >
                    {MONTH_OPTIONS.map((month, index) => (
                      <s-option key={month} value={String(index)}>
                        {month}
                      </s-option>
                    ))}
                  </s-select>
                </div>
                <div className="year-select">
                  <s-select
                    label="Schedule year"
                    labelAccessibilityVisibility="exclusive"
                    value={String(selectedYear)}
                    onChange={(event) =>
                      changeMonthYear(selectedMonth, Number(selectValue(event)))
                    }
                  >
                    {yearOptions.map((year) => (
                      <s-option key={year} value={String(year)}>
                        {year}
                      </s-option>
                    ))}
                  </s-select>
                </div>
              </>
            ) : (
              <div className="schedule-date-wrap">
                <s-button
                  aria-haspopup="dialog"
                  aria-expanded={datePickerOpen}
                  onClick={() => setDatePickerOpen((value) => !value)}
                >
                  <CalendarDays aria-hidden="true" size={16} />
                  {formatDateRange(weekStart, weekEnd)}
                </s-button>
                {datePickerOpen && (
                  <div className="schedule-date-popover">
                    <s-date-picker
                      type="range"
                      value={draftRange}
                      view={selectedDate.slice(0, 7)}
                      onInput={(event) => selectDateRange(pickerValue(event))}
                      onChange={(event) => selectDateRange(pickerValue(event))}
                    ></s-date-picker>
                  </div>
                )}
              </div>
            )}
            <div className="view-select">
              <s-select
                label="Schedule view"
                labelAccessibilityVisibility="exclusive"
                value={period}
                onChange={(event) =>
                  changePeriod(selectValue(event) as SchedulePeriod)
                }
              >
                {SCHEDULE_PERIODS.map((option) => (
                  <s-option key={option.value} value={option.value}>
                    {option.label}
                  </s-option>
                ))}
              </s-select>
            </div>
          </div>
        </div>

        <section className="schedule-card">
          {period === "monthly" || period === "yearly" ? (
            <MonthlySchedule
              days={monthlyDays}
              shiftsByDay={shiftsByDay}
              employees={employees}
              fetcher={actionFetcher}
              onAdd={(dateKey) => {
                const employee = employees[0];
                if (!employee) return;
                setShiftModal({
                  mode: "create",
                  employeeId: employee.id,
                  dateKey,
                });
              }}
              onEditShift={(shiftId) => setShiftModal({ mode: "edit", shiftId })}
            />
          ) : (
            <div className="schedule-scroll">
              <table
                className="schedule-table"
                style={{ minWidth: `${Math.max(1120, 110 + days.length * 145)}px` }}
              >
                <thead>
                  <tr>
                    <th>Name</th>
                    {days.map((day) => (
                      <th key={day.key} className={day.isToday ? "today" : ""}>
                        <span className="day-heading">
                          {day.label} {day.dayNumber}
                        </span>
                        {day.isPast && <small>Past</small>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id}>
                      <th scope="row">{employee.name}</th>
                      {days.map((day) => {
                        const cellShifts =
                          shiftsByEmployeeDay.get(`${employee.id}:${day.key}`) ?? [];
                        const available = isAvailable(employee.weeklyAvailability, day.value);
                        return (
                          <td key={`${employee.id}-${day.key}`}>
                            <ScheduleCell
                              employee={employee}
                              day={day}
                              shifts={cellShifts}
                              available={available}
                              isPast={day.isPast}
                              onAdd={() =>
                                setShiftModal({
                                  mode: "create",
                                  employeeId: employee.id,
                                  dateKey: day.key,
                                })
                              }
                              onEditShift={(shiftId) =>
                                setShiftModal({ mode: "edit", shiftId })
                              }
                              onEditAvailability={() =>
                                setAvailabilityEmployeeId(employee.id)
                              }
                              fetcher={actionFetcher}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {employees.length === 0 && (
                    <tr>
                      <td colSpan={days.length + 1} className="empty-cell">
                        Add staff before building a schedule.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <th>Totals</th>
                    {days.map((day) => {
                      const total = dayTotals(shifts, day.key, employees);
                      return (
                        <td key={day.key}>
                          <div className="totals-cell">
                            <span>
                              <Clock aria-hidden="true" size={15} />
                              {formatHours(total.hours)}
                            </span>
                            <span>
                              $
                              {total.cost.toFixed(2)}
                            </span>
                            <span>
                              <User aria-hidden="true" size={15} />
                              {total.staff}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

      </div>

      {shiftModal && (
        <ShiftDialog
          modal={shiftModal}
          selectedShift={selectedShift}
          employees={employees}
          locations={locations}
          fetcher={actionFetcher}
          onClose={closeShiftModal}
        />
      )}

      {selectedAvailabilityEmployee && (
        <AvailabilityDialog
          employee={selectedAvailabilityEmployee}
          fetcher={actionFetcher}
          onClose={() => setAvailabilityEmployeeId("")}
        />
      )}

      <ClearShiftsDialog
        employees={employees}
        selectedIds={selectedClearStaff}
        setSelectedIds={setSelectedClearStaff}
        fetcher={actionFetcher}
      />

      <style>{SCHEDULE_STYLES}</style>
    </s-page>
  );
}

function MonthlySchedule({
  days,
  shiftsByDay,
  employees,
  fetcher,
  onAdd,
  onEditShift,
}: {
  days: Array<{
    key: string;
    dayNumber: number;
    isPast: boolean;
    isToday: boolean;
    isOutside: boolean;
  }>;
  shiftsByDay: Map<
    string,
    Array<{
      id: string;
      employeeName: string;
      startTime: string;
      endTime: string;
      locationName: string;
    }>
  >;
  employees: Array<{ id: string }>;
  fetcher: ReturnType<typeof useFetcher<ScheduleActionResult>>;
  onAdd: (dateKey: string) => void;
  onEditShift: (shiftId: string) => void;
}) {
  return (
    <div className="month-schedule">
      <div className="month-weekdays">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((weekday) => (
          <div key={weekday}>{weekday}</div>
        ))}
      </div>
      <div className="month-grid">
        {days.map((day) => {
          const dayShifts = shiftsByDay.get(day.key) ?? [];
          const canAdd = !day.isPast && !day.isOutside && employees.length > 0;
          return (
            <div
              className={`month-day${day.isOutside ? " outside" : ""}${
                day.isToday ? " today" : ""
              }`}
              key={day.key}
            >
              <div className="month-day-number">{day.dayNumber}</div>
              <div className="month-shifts">
                {dayShifts.map((shift) => (
                  <div className="shift-card month-shift" key={shift.id}>
                    <button
                      className="shift-content"
                      type="button"
                      onClick={() => onEditShift(shift.id)}
                    >
                      <strong>
                        {shift.startTime} - {shift.endTime}
                      </strong>
                      <span>{shift.employeeName}</span>
                      <span>{shift.locationName}</span>
                    </button>
                    <div className="shift-actions">
                      <button
                        type="button"
                        aria-label="Edit shift"
                        onClick={() => onEditShift(shift.id)}
                      >
                        <Edit3 aria-hidden="true" size={18} />
                      </button>
                      <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="deleteShift" />
                        <input type="hidden" name="shiftId" value={shift.id} />
                        <button type="submit" aria-label="Delete shift">
                          <Trash2 aria-hidden="true" size={18} />
                        </button>
                      </fetcher.Form>
                    </div>
                  </div>
                ))}
                {canAdd && (
                  <button
                    className="month-add-slot"
                    type="button"
                    onClick={() => onAdd(day.key)}
                    aria-label={`Add shift on ${day.key}`}
                  >
                    <PlusCircle aria-hidden="true" size={18} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScheduleCell({
  employee,
  day,
  shifts,
  available,
  isPast,
  onAdd,
  onEditShift,
  onEditAvailability,
  fetcher,
}: {
  employee: { id: string; name: string };
  day: { key: string; value: (typeof WEEKDAY_VALUES)[number] };
  shifts: Array<{
    id: string;
    startTime: string;
    endTime: string;
    locationName: string;
  }>;
  available: boolean;
  isPast: boolean;
  onAdd: () => void;
  onEditShift: (shiftId: string) => void;
  onEditAvailability: () => void;
  fetcher: ReturnType<typeof useFetcher<ScheduleActionResult>>;
}) {
  if (!available) {
    return (
      <div className="schedule-cell">
        <button
          className="unavailable-pill"
          type="button"
          onClick={onEditAvailability}
          aria-label={`Edit availability for ${employee.name} on ${day.value}`}
        >
          Unavailable ✎
        </button>
        <button className="empty-slot muted" type="button" onClick={onEditAvailability}>
          ⊘
        </button>
      </div>
    );
  }

  return (
    <div className="schedule-cell">
      {shifts.map((shift) => (
        <div className="shift-card" key={shift.id}>
          <button
            className="shift-content"
            type="button"
            onClick={() => onEditShift(shift.id)}
          >
            <strong>
              {shift.startTime} - {shift.endTime}
            </strong>
            <span>{shift.locationName}</span>
          </button>
          <div className="shift-actions">
            <button type="button" aria-label="Edit shift" onClick={() => onEditShift(shift.id)}>
              <Edit3 aria-hidden="true" size={18} />
            </button>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="deleteShift" />
              <input type="hidden" name="shiftId" value={shift.id} />
              <button type="submit" aria-label="Delete shift">
                <Trash2 aria-hidden="true" size={18} />
              </button>
            </fetcher.Form>
          </div>
        </div>
      ))}
      {isPast ? (
        <button className="empty-slot muted" type="button" disabled>
          ⊘
        </button>
      ) : (
        <button className="empty-slot add-slot" type="button" onClick={onAdd}>
          <PlusCircle aria-hidden="true" size={17} />
        </button>
      )}
    </div>
  );
}

function ShiftDialog({
  modal,
  selectedShift,
  employees,
  locations,
  fetcher,
  onClose,
}: {
  modal: NonNullable<ScheduleModal>;
  selectedShift?: {
    id: string;
    employeeId: string;
    locationId: string;
    dateKey: string;
    startTime: string;
    endTime: string;
    notes: string;
  };
  employees: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  fetcher: ReturnType<typeof useFetcher<ScheduleActionResult>>;
  onClose: () => void;
}) {
  const isEdit = modal.mode === "edit";
  const employeeId =
    modal.mode === "create" ? modal.employeeId : selectedShift?.employeeId ?? "";
  const dateKey = modal.mode === "create" ? modal.dateKey : selectedShift?.dateKey ?? "";
  const firstLocationId = locations[0]?.id ?? "";

  return (
    <s-modal id="shift-modal" heading={isEdit ? "Edit Shift" : "Create Shift"} size="base">
      <fetcher.Form id="shift-form" method="post" className="dialog-body">
          <input type="hidden" name="intent" value={isEdit ? "updateShift" : "createShift"} />
          {isEdit && <input type="hidden" name="shiftId" value={selectedShift?.id} />}
          <s-select label="Staff" name="employeeId" value={employeeId} required>
            {employees.map((employee) => (
              <s-option key={employee.id} value={employee.id}>
                {employee.name}
              </s-option>
            ))}
          </s-select>
          <s-select
            label="Location"
            name="locationId"
            value={selectedShift?.locationId ?? firstLocationId}
            required
          >
            {locations.map((location) => (
              <s-option key={location.id} value={location.id}>
                {location.name}
              </s-option>
            ))}
          </s-select>
          <label>
            Date
            <input name="date" type="date" defaultValue={dateKey} required />
          </label>
          <div className="time-grid">
            <label>
              Start at
              <input
                name="startTime"
                type="time"
                defaultValue={selectedShift?.startTime ?? "09:00"}
                required
              />
            </label>
            <label>
              End at
              <input
                name="endTime"
                type="time"
                defaultValue={selectedShift?.endTime ?? "17:00"}
                required
              />
            </label>
          </div>
          <label>
            Note
            <textarea
              name="notes"
              placeholder="Add notes for this shift"
              defaultValue={selectedShift?.notes ?? ""}
            />
          </label>
          <p className="form-help">These notes will be visible to staff when they clock in</p>
          {!isEdit && (
            <label className="checkbox-row">
              <input type="checkbox" name="repeatWeek" />
              Repeat this shift for the rest of the week
            </label>
          )}
        </fetcher.Form>
      <s-button
        slot="secondary-actions"
        variant="secondary"
        commandFor="shift-modal"
        command="--hide"
        onClick={onClose}
      >
        Cancel
      </s-button>
      <s-button
        slot="primary-action"
        variant="primary"
        type="button"
        commandFor="shift-modal"
        command="--hide"
        onClick={() =>
          (document.getElementById("shift-form") as HTMLFormElement | null)
            ?.requestSubmit()
        }
      >
        {isEdit ? "Save Shift" : "Create Shift"}
      </s-button>
    </s-modal>
  );
}

function AvailabilityDialog({
  employee,
  fetcher,
  onClose,
}: {
  employee: { id: string; name: string; weeklyAvailability: string };
  fetcher: ReturnType<typeof useFetcher<ScheduleActionResult>>;
  onClose: () => void;
}) {
  const availability = new Set(employee.weeklyAvailability.split(",").filter(Boolean));

  return (
    <div className="dialog-backdrop compact" role="presentation">
      <div className="availability-dialog" role="dialog" aria-modal="true">
        <div className="dialog-header">
          <h2>Edit Availability — {employee.name}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <fetcher.Form method="post" className="availability-body">
          <input type="hidden" name="intent" value="updateAvailability" />
          <input type="hidden" name="employeeId" value={employee.id} />
          <p>Click a day to toggle availability. Green = available.</p>
          <div className="availability-days">
            {WEEKDAY_VALUES.map((value, index) => (
              <label key={value} className="availability-pill">
                <input
                  type="checkbox"
                  name="weeklyAvailability"
                  value={value}
                  defaultChecked={availability.has(value)}
                />
                <span>{WEEKDAY_LABELS[index]}</span>
              </label>
            ))}
          </div>
          <div className="dialog-actions">
            <s-button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </s-button>
            <s-button variant="primary" type="submit">
              Save
            </s-button>
          </div>
        </fetcher.Form>
      </div>
    </div>
  );
}

function ClearShiftsDialog({
  employees,
  selectedIds,
  setSelectedIds,
  fetcher,
}: {
  employees: Array<{ id: string; name: string }>;
  selectedIds: Set<string>;
  setSelectedIds: (value: Set<string>) => void;
  fetcher: ReturnType<typeof useFetcher<ScheduleActionResult>>;
}) {
  const allSelected = employees.length > 0 && selectedIds.size === employees.length;
  const toggleStaff = (employeeId: string) => {
    const next = new Set(selectedIds);
    if (next.has(employeeId)) {
      next.delete(employeeId);
    } else {
      next.add(employeeId);
    }
    setSelectedIds(next);
  };

  return (
    <s-modal id="clear-shifts-modal" heading="Delete All Shifts" size="base">
      <fetcher.Form id="clear-shifts-form" method="post" className="clear-body">
        <input type="hidden" name="intent" value="clearWeek" />
        {Array.from(selectedIds).map((employeeId) => (
          <input key={employeeId} type="hidden" name="employeeIds" value={employeeId} />
        ))}
        <div className="warning-box">
          <AlertTriangle aria-hidden="true" size={20} />
          <span>
            Warning: This will permanently delete ALL past, present, and future
            shifts for the selected staff members. This action cannot be undone.
          </span>
        </div>
          <s-checkbox
            label="Select All Staff"
            checked={allSelected}
            indeterminate={selectedIds.size > 0 && !allSelected}
            onChange={(event) =>
              setSelectedIds(
                checkboxChecked(event)
                  ? new Set(employees.map((employee) => employee.id))
                  : new Set(),
              )
            }
          ></s-checkbox>
        <div className="clear-staff-list">
          {employees.map((employee) => (
              <s-checkbox
                key={employee.id}
                label={employee.name}
                checked={selectedIds.has(employee.id)}
                onChange={() => toggleStaff(employee.id)}
              ></s-checkbox>
          ))}
        </div>
        <p className="selected-count">{selectedIds.size} staff selected</p>
      </fetcher.Form>
      <s-button
        slot="secondary-actions"
        variant="secondary"
        commandFor="clear-shifts-modal"
        command="--hide"
      >
        Cancel
      </s-button>
      <s-button
        slot="primary-action"
        variant="primary"
        tone="critical"
        type="button"
        disabled={selectedIds.size === 0}
        commandFor="clear-shifts-modal"
        command="--hide"
        onClick={() =>
          (document.getElementById("clear-shifts-form") as HTMLFormElement | null)
            ?.requestSubmit()
        }
      >
        Delete Shifts
      </s-button>
    </s-modal>
  );
}

async function assertEmployee(shopId: string, employeeId: string) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, shopId },
  });
  if (!employee) throw new Error("Staff member not found.");
}

async function assertLocation(shopId: string, locationId: string) {
  const location = await prisma.storeLocation.findFirst({
    where: { id: locationId, shopId },
  });
  if (!location) throw new Error("Choose a valid location.");
}

function showShopifyModal(id: string) {
  return shopifyModal()?.show(id);
}

function hideShopifyModal(id: string) {
  return shopifyModal()?.hide(id);
}

function shopifyModal() {
  return (
    window as unknown as {
      shopify?: {
        modal?: {
          show: (id: string) => Promise<void>;
          hide: (id: string) => Promise<void>;
        };
      };
    }
  ).shopify?.modal;
}

function dayTotals(
  shifts: Array<{
    employeeId: string;
    dateKey: string;
    startsAt: string;
    endsAt: string;
  }>,
  dateKey: string,
  employees: Array<{ id: string; hourlyRate: number }>,
) {
  const dayShifts = shifts.filter((shift) => shift.dateKey === dateKey);
  const employeeRates = new Map(employees.map((employee) => [employee.id, employee.hourlyRate]));
  const staff = new Set(dayShifts.map((shift) => shift.employeeId)).size;
  const hours = dayShifts.reduce(
    (sum, shift) =>
      sum +
      Math.max(
        0,
        (new Date(shift.endsAt).getTime() - new Date(shift.startsAt).getTime()) /
          36e5,
      ),
    0,
  );
  const cost = dayShifts.reduce((sum, shift) => {
    const shiftHours = Math.max(
      0,
      (new Date(shift.endsAt).getTime() - new Date(shift.startsAt).getTime()) / 36e5,
    );
    return sum + shiftHours * (employeeRates.get(shift.employeeId) ?? 0);
  }, 0);

  return { hours, cost, staff };
}

function isAvailable(weeklyAvailability: string, day: (typeof WEEKDAY_VALUES)[number]) {
  return weeklyAvailability.split(",").filter(Boolean).includes(day);
}

function dateTimeFromInputs(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

function normalizePeriod(value: string | null): SchedulePeriod {
  return value === "monthly" || value === "yearly" ? value : "weekly";
}

function rangeForPeriod(value: Date, period: SchedulePeriod) {
  if (period === "monthly" || period === "yearly") {
    return {
      start: startOfMonth(value),
      end: endOfDay(new Date(value.getFullYear(), value.getMonth() + 1, 0)),
    };
  }

  const start = startOfWeek(value);
  return { start, end: endOfDay(addDays(start, 6)) };
}

function buildRangeDays(start: Date, end: Date) {
  const result = [];
  const current = startOfDay(start);
  const last = startOfDay(end);

  while (current.getTime() <= last.getTime()) {
    const date = new Date(current);
    result.push({
      key: toDateKey(date),
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      shortLabel: date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      dayNumber: date.getDate(),
      value: weekdayValue(date),
      isPast: startOfDay(date).getTime() < startOfDay(new Date()).getTime(),
      isToday: toDateKey(date) === toDateKey(new Date()),
    });
    current.setDate(current.getDate() + 1);
  }

  return result;
}

function buildMonthCalendarDays(start: Date, end: Date) {
  const firstVisible = startOfWeek(start);
  const lastVisible = addDays(startOfWeek(end), 6);
  const result = [];
  const current = new Date(firstVisible);

  while (current.getTime() <= lastVisible.getTime()) {
    const date = new Date(current);
    result.push({
      key: toDateKey(date),
      dayNumber: date.getDate(),
      isPast: startOfDay(date).getTime() < startOfDay(new Date()).getTime(),
      isToday: toDateKey(date) === toDateKey(new Date()),
      isOutside:
        startOfDay(date).getTime() < startOfDay(start).getTime() ||
        startOfDay(date).getTime() > startOfDay(end).getTime(),
    });
    current.setDate(current.getDate() + 1);
  }

  return result;
}

function weekdayValue(date: Date): (typeof WEEKDAY_VALUES)[number] {
  const index = date.getDay() === 0 ? 6 : date.getDay() - 1;
  return WEEKDAY_VALUES[index];
}

function parseDateKey(value: string | null) {
  if (value && isDateKey(value)) return dateFromKey(value);
  return new Date();
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isPastDateKey(value: string) {
  return startOfDay(dateFromKey(value)).getTime() < startOfDay(new Date()).getTime();
}

function pickerAnchorDate(value: string) {
  const [start, end] = value.split("--");
  if (isDateKey(start)) return start;
  if (isDateKey(end)) return end;
  return null;
}

function pickerValue(event: { currentTarget: unknown }) {
  return ((event.currentTarget as unknown as { value: string }).value ?? "");
}

function checkboxChecked(event: { currentTarget: unknown }) {
  return Boolean((event.currentTarget as unknown as { checked: boolean }).checked);
}

function selectValue(event: { currentTarget: unknown }) {
  return String((event.currentTarget as unknown as { value: string }).value ?? "");
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfMonth(value: Date) {
  return startOfDay(new Date(value.getFullYear(), value.getMonth(), 1));
}

function endOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(23, 59, 59, 999);
  return next;
}

function startOfWeek(value: Date) {
  const next = startOfDay(value);
  const day = next.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + offset);
  return next;
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function timeValue(value: Date) {
  return `${String(value.getHours()).padStart(2, "0")}:${String(
    value.getMinutes(),
  ).padStart(2, "0")}`;
}

function formatDateRange(start: string, end: string) {
  return `${start} to ${end}`;
}

function formatHours(hours: number) {
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  return `${String(whole).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() || "ST";
}

const SCHEDULE_STYLES = `
  .schedule-page {
    display: grid;
    gap: 18px;
  }

  .schedule-toolbar {
    align-items: center;
    display: flex;
    gap: 12px;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .toolbar-left,
  .toolbar-right {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .toolbar-button-content {
    align-items: center;
    display: inline-flex;
    gap: 6px;
  }

  .period-select {
    min-width: 132px;
    width: 132px;
  }

  .year-select {
    min-width: 112px;
    width: 112px;
  }

  .color-select {
    width: 170px;
  }

  .view-select {
    width: 112px;
  }

  .schedule-date-wrap {
    position: relative;
  }

  .schedule-date-popover {
    background: #fff;
    border: 1px solid #d4d4d4;
    border-radius: 14px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
    left: 0;
    padding: 14px;
    position: absolute;
    top: calc(100% + 8px);
    width: max-content;
    z-index: 40;
  }

  .schedule-date-popover s-date-picker {
    display: block;
  }

  .schedule-card {
    background: #fff;
    border: 1px solid #dcdcdc;
    border-radius: 10px;
    overflow: hidden;
  }

  .schedule-scroll {
    overflow-x: auto;
  }

  .month-schedule {
    min-width: 980px;
  }

  .month-weekdays {
    background: #fff;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .month-weekdays div {
    border-bottom: 1px solid #e5e5e5;
    border-right: 1px solid #e5e5e5;
    color: #303030;
    font-size: 12px;
    font-weight: 650;
    padding: 12px 14px;
    text-align: center;
  }

  .month-weekdays div:last-child {
    border-right: 0;
  }

  .month-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .month-day {
    background: #fff;
    border-bottom: 1px solid #e5e5e5;
    border-right: 1px solid #e5e5e5;
    min-height: 118px;
    padding: 10px;
    position: relative;
  }

  .month-day:nth-child(7n) {
    border-right: 0;
  }

  .month-day.outside {
    background: #fbfbfb;
    color: #c1c1c1;
  }

  .month-day.today {
    box-shadow: inset 0 0 0 2px #008060;
  }

  .month-day-number {
    color: inherit;
    font-size: 12px;
    min-height: 18px;
  }

  .month-shifts {
    display: grid;
    gap: 6px;
    margin-top: 8px;
  }

  .month-shift {
    min-height: 54px;
  }

  .month-shift .shift-content {
    min-height: 54px;
    padding: 8px;
  }

  .month-add-slot {
    align-items: center;
    background: #fafafa;
    border: 1px dashed #e3e3e3;
    border-radius: 5px;
    color: #616161;
    cursor: pointer;
    display: inline-flex;
    justify-content: center;
    min-height: 34px;
    width: 100%;
  }

  .month-add-slot:hover {
    background: #f1f1f1;
    border-color: #c9c9c9;
  }

  .schedule-table {
    border-collapse: collapse;
    min-width: 1120px;
    table-layout: fixed;
    width: 100%;
  }

  .schedule-table th,
  .schedule-table td {
    border: 1px solid #e5e5e5;
    color: #303030;
    font-size: 12px;
    padding: 10px;
    text-align: left;
    vertical-align: top;
  }

  .schedule-table thead th {
    color: #8a8a8a;
    font-weight: 500;
    height: 56px;
    text-align: right;
  }

  .schedule-table thead th:first-child,
  .schedule-table tbody th,
  .schedule-table tfoot th {
    background: #fff;
    color: #303030;
    font-weight: 650;
    left: 0;
    position: sticky;
    width: 96px;
    z-index: 2;
  }

  .schedule-table thead th.today {
    background: #ececec;
    border-radius: 8px;
    color: #303030;
    position: relative;
  }

  .schedule-table thead th.today::after {
    background: #0096a4;
    border-radius: 999px;
    content: "";
    height: 8px;
    position: absolute;
    right: 8px;
    top: 8px;
    width: 8px;
  }

  .day-heading {
    display: inline-block;
    padding-right: 14px;
  }

  .schedule-table thead small {
    display: block;
    margin-top: 8px;
  }

  .schedule-table tbody td {
    background: #fff;
    height: 104px;
  }

  .schedule-cell {
    display: grid;
    gap: 7px;
    min-height: 80px;
  }

  .unavailable-pill {
    background: #fde2e2;
    border: 1px solid #f6c6c6;
    border-radius: 5px;
    color: #8e1f0b;
    cursor: pointer;
    font-size: 11px;
    font-weight: 700;
    min-height: 26px;
  }

  .empty-slot {
    align-items: center;
    background: #fafafa;
    border: 1px dashed #e3e3e3;
    border-radius: 5px;
    color: #616161;
    cursor: pointer;
    display: inline-flex;
    justify-content: center;
    min-height: 34px;
    width: 100%;
  }

  .empty-slot.muted {
    border: 0;
    cursor: pointer;
  }

  .add-slot:hover {
    background: #f1f1f1;
    border-color: #c9c9c9;
  }

  .shift-card {
    background: #000;
    border-radius: 5px;
    color: #fff;
    min-height: 58px;
    overflow: hidden;
    position: relative;
  }

  .shift-content {
    background: transparent;
    border: 0;
    color: inherit;
    cursor: pointer;
    display: grid;
    gap: 4px;
    min-height: 58px;
    padding: 9px;
    text-align: center;
    width: 100%;
  }

  .shift-content span {
    font-size: 11px;
  }

  .shift-actions {
    align-items: center;
    background: #000;
    border-radius: inherit;
    display: none;
    gap: 4px;
    inset: 0;
    justify-content: center;
    position: absolute;
    z-index: 2;
  }

  .shift-card:hover .shift-actions {
    display: flex;
  }

  .shift-actions button {
    align-items: center;
    background: #fff;
    border: 0;
    border-radius: 4px;
    color: #202223;
    cursor: pointer;
    display: inline-flex;
    height: 28px;
    justify-content: center;
    width: 28px;
  }

  .shift-actions form button {
    color: #d72c0d;
  }

  .totals-cell {
    display: grid;
    gap: 6px;
  }

  .totals-cell span {
    align-items: center;
    display: inline-flex;
    gap: 6px;
  }

  .dialog-backdrop {
    align-items: center;
    background: rgba(0, 0, 0, 0.52);
    display: flex;
    inset: 0;
    justify-content: center;
    padding: 24px;
    position: fixed;
    z-index: 100;
  }

  .schedule-dialog,
  .availability-dialog {
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.22);
    max-height: min(720px, calc(100vh - 48px));
    overflow: auto;
    width: min(680px, calc(100vw - 48px));
  }

  .availability-dialog {
    width: min(560px, calc(100vw - 48px));
  }

  .dialog-header {
    align-items: center;
    border-bottom: 1px solid #e3e3e3;
    display: flex;
    justify-content: space-between;
    padding: 22px 24px;
  }

  .dialog-header h2 {
    font-size: 24px;
    font-weight: 750;
    margin: 0;
  }

  .icon-button {
    background: transparent;
    border: 0;
    color: #616161;
    cursor: pointer;
    font-size: 30px;
    line-height: 1;
  }

  .dialog-body,
  .availability-body,
  .clear-body {
    display: grid;
    gap: 12px;
    padding: 24px;
  }

  .warning-box {
    align-items: flex-start;
    background: #fde2e2;
    border-radius: 10px;
    color: #8e1f0b;
    display: flex;
    gap: 12px;
    line-height: 1.5;
    padding: 14px 16px;
  }

  .warning-box svg {
    flex-shrink: 0;
    margin-top: 2px;
  }

  .clear-staff-list {
    display: grid;
    gap: 12px;
  }

  .selected-count {
    color: #616161;
    margin: 8px 0 0;
  }

  .dialog-body label,
  .availability-body label {
    color: #303030;
    display: grid;
    gap: 6px;
  }

  .dialog-body input,
  .dialog-body textarea {
    border: 1px solid #aeb4b9;
    border-radius: 9px;
    color: #303030;
    font: inherit;
    min-height: 42px;
    padding: 0 14px;
  }

  .dialog-body textarea {
    min-height: 92px;
    padding: 14px;
  }

  .time-grid {
    display: grid;
    gap: 20px;
    grid-template-columns: 1fr 1fr;
  }

  .form-help {
    color: #616161;
    margin: 0;
  }

  .checkbox-row {
    align-items: center;
    display: flex !important;
    gap: 10px !important;
  }

  .dialog-actions {
    align-items: center;
    border-top: 1px solid #e3e3e3;
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin: 12px -24px -24px;
    padding: 18px 24px;
  }

  .availability-days {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .availability-pill input {
    position: absolute;
    opacity: 0;
  }

  .availability-pill span {
    background: #fff;
    border: 1px solid #d4d4d4;
    border-radius: 999px;
    cursor: pointer;
    display: inline-flex;
    font-weight: 650;
    min-width: 86px;
    padding: 12px 18px;
    justify-content: center;
  }

  .availability-pill input:checked + span {
    background: #008060;
    border-color: #008060;
    color: #fff;
  }

  .empty-cell {
    padding: 22px;
    text-align: center;
  }

  @media (max-width: 860px) {
    .schedule-toolbar,
    .time-grid {
      align-items: stretch;
      grid-template-columns: 1fr;
    }

    .schedule-toolbar {
      display: grid;
    }
  }
`;

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
