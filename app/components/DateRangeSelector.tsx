import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export const DATE_RANGE_PRESETS = [
  { days: 1, label: "Today" },
  { days: 2, label: "Yesterday" },
  { days: 7, label: "Last 7 Days" },
  { days: 30, label: "Last 30 Days" },
  { days: 90, label: "Last 90 Days" },
  { days: 365, label: "Last 365 Days" },
] as const;

export type DateRangeValue = {
  start: string;
  end: string;
  label: string;
  custom: boolean;
  days: number;
};

type DateRangeSelectorProps = {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  namePrefix?: string;
  align?: "start" | "end";
  includeHiddenInputs?: boolean;
};

export function defaultDateRangeValue(
  days: number = 2,
): DateRangeValue {
  return rangeFromPreset(days);
}

export function DateRangeSelector({
  value,
  onChange,
  namePrefix = "period",
  align = "start",
  includeHiddenInputs = true,
}: DateRangeSelectorProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draftRange, setDraftRange] = useState(`${value.start}--${value.end}`);
  const [draftCustom, setDraftCustom] = useState(value.custom);
  const [draftDays, setDraftDays] = useState(value.days);
  const [calendarMonth, setCalendarMonth] = useState(() =>
    dateFromKey(value.start),
  );

  useEffect(() => {
    setDraftRange(`${value.start}--${value.end}`);
    setDraftCustom(value.custom);
    setDraftDays(value.days);
    setCalendarMonth(dateFromKey(value.start));
  }, [value.start, value.end, value.custom, value.days]);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  const applyPreset = (days: number) => {
    const next = rangeFromPreset(days);
    onChange(next);
    setDraftRange(`${next.start}--${next.end}`);
    setDraftCustom(false);
    setDraftDays(days);
    setCalendarMonth(dateFromKey(next.start));
    setOpen(false);
  };

  const applyCustomRange = () => {
    const range = parsePickerRange(draftRange);
    if (!range) return;
    onChange({
      start: range.start,
      end: range.end,
      label: `${formatNumericDate(range.start)} - ${formatNumericDate(range.end)}`,
      custom: true,
      days: 0,
    });
    setDraftCustom(true);
    setDraftDays(0);
    setOpen(false);
  };

  const selectCalendarDay = (dayKey: string) => {
    const range = parseDraftRange(draftRange);
    setDraftCustom(true);
    setDraftDays(0);

    if (!range.start || range.end) {
      setDraftRange(`${dayKey}--`);
      return;
    }

    if (dayKey < range.start) {
      setDraftRange(`${dayKey}--${range.start}`);
      return;
    }

    setDraftRange(`${range.start}--${dayKey}`);
  };

  const draftStart = draftRange.split("--")[0] || value.start;
  const draftEnd = draftRange.split("--")[1] || value.end;

  return (
    <div className={`drs-wrap${align === "end" ? " align-end" : ""}`} ref={wrapRef}>
      {includeHiddenInputs ? (
        <>
          <input type="hidden" name={`${namePrefix}Start`} value={value.start} />
          <input type="hidden" name={`${namePrefix}End`} value={value.end} />
          <input type="hidden" name={`${namePrefix}Label`} value={value.label} />
        </>
      ) : null}

      <button
        className="drs-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <CalendarDays aria-hidden="true" size={16} />
        {value.label}
        <ChevronDown className="drs-chevron" aria-hidden="true" size={16} />
      </button>

      {open && (
        <div className="drs-panel">
          <div className="drs-presets" role="menu" aria-label="Date presets">
            {DATE_RANGE_PRESETS.map((option) => (
              <button
                key={option.days}
                className={!draftCustom && draftDays === option.days ? "selected" : ""}
                type="button"
                role="menuitem"
                onClick={() => applyPreset(option.days)}
              >
                <span>{option.label}</span>
                {!draftCustom && draftDays === option.days && (
                  <span aria-hidden="true">✓</span>
                )}
              </button>
            ))}
            <button
              className={draftCustom ? "selected" : ""}
              type="button"
              role="menuitem"
              onClick={() => {
                setDraftCustom(true);
                setDraftDays(0);
                setDraftRange(`${value.start}--${value.end}`);
              }}
            >
              <span>Custom</span>
              {draftCustom && <span aria-hidden="true">✓</span>}
            </button>
          </div>

          <div className="drs-calendar">
            <div className="drs-input-row" aria-label="Selected date range">
              <DateDisplay value={draftStart} />
              <span aria-hidden="true" className="drs-arrow">
                →
              </span>
              <DateDisplay value={draftEnd || draftStart} />
            </div>
            <div className="drs-dual" aria-label="Choose date range">
              <CalendarMonth
                monthDate={calendarMonth}
                rangeValue={draftRange}
                onDayClick={selectCalendarDay}
                previousAction={() =>
                  setCalendarMonth(addMonths(calendarMonth, -1))
                }
              />
              <CalendarMonth
                monthDate={addMonths(calendarMonth, 1)}
                rangeValue={draftRange}
                onDayClick={selectCalendarDay}
                nextAction={() => setCalendarMonth(addMonths(calendarMonth, 1))}
              />
            </div>
            <div className="drs-actions">
              <s-button type="button" onClick={() => setOpen(false)}>
                Cancel
              </s-button>
              <s-button type="button" variant="primary" onClick={applyCustomRange}>
                Apply
              </s-button>
            </div>
          </div>
        </div>
      )}

      <style>{DATE_RANGE_SELECTOR_STYLES}</style>
    </div>
  );
}

function DateDisplay({ value }: { value: string }) {
  return (
    <div className="drs-display">
      <CalendarDays aria-hidden="true" size={18} />
      <span>{formatNumericDate(value)}</span>
    </div>
  );
}

function CalendarMonth({
  monthDate,
  rangeValue,
  onDayClick,
  previousAction,
  nextAction,
}: {
  monthDate: Date;
  rangeValue: string;
  onDayClick: (value: string) => void;
  previousAction?: () => void;
  nextAction?: () => void;
}) {
  const range = parseDraftRange(rangeValue);
  const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const days = monthGrid(monthDate);

  return (
    <div className="drs-month">
      <div className="drs-month-heading">
        {previousAction ? (
          <button
            className="drs-month-nav"
            type="button"
            aria-label="Previous month"
            onClick={previousAction}
          >
            <ChevronLeft aria-hidden="true" size={20} />
          </button>
        ) : (
          <span aria-hidden="true" />
        )}
        <strong>{monthLabel(monthDate)}</strong>
        {nextAction ? (
          <button
            className="drs-month-nav"
            type="button"
            aria-label="Next month"
            onClick={nextAction}
          >
            <ChevronRight aria-hidden="true" size={20} />
          </button>
        ) : (
          <span aria-hidden="true" />
        )}
      </div>
      <div className="drs-weekdays" aria-hidden="true">
        {weekdays.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className="drs-days">
        {days.map((day, index) =>
          day ? (
            <button
              key={toDateKey(day)}
              className={calendarDayClass(toDateKey(day), range)}
              type="button"
              onClick={() => onDayClick(toDateKey(day))}
            >
              {day.getDate()}
            </button>
          ) : (
            <span key={`empty-${index}`} />
          ),
        )}
      </div>
    </div>
  );
}

export function rangeFromPreset(days: number): DateRangeValue {
  const today = startOfDay(new Date());

  if (days === 2) {
    const yesterday = addDays(today, -1);
    return {
      custom: false,
      days,
      label: "Yesterday",
      start: toDateKey(yesterday),
      end: toDateKey(yesterday),
    };
  }

  const start = addDays(today, -(days - 1));
  return {
    custom: false,
    days,
    label:
      DATE_RANGE_PRESETS.find((option) => option.days === days)?.label ??
      "Last 30 Days",
    start: toDateKey(start),
    end: toDateKey(today),
  };
}

function parsePickerRange(value: string) {
  const [start, end] = value.split("--");
  if (!isDateKey(start) || !isDateKey(end)) return null;
  return { start, end };
}

function parseDraftRange(value: string) {
  const [start, end] = value.split("--");
  return {
    start: isDateKey(start) ? start : "",
    end: isDateKey(end) ? end : "",
  };
}

function addMonths(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function monthLabel(value: Date) {
  return value.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function monthGrid(value: Date) {
  const firstDay = new Date(value.getFullYear(), value.getMonth(), 1);
  const lastDay = new Date(value.getFullYear(), value.getMonth() + 1, 0);
  const days: Array<Date | null> = [];

  for (let index = 0; index < firstDay.getDay(); index += 1) {
    days.push(null);
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    days.push(new Date(value.getFullYear(), value.getMonth(), day));
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
}

function calendarDayClass(
  key: string,
  range: ReturnType<typeof parseDraftRange>,
) {
  const classes = ["drs-day"];
  const todayKey = toDateKey(new Date());
  const hasCompleteRange = Boolean(range.start && range.end);

  if (key === todayKey) classes.push("today");
  if (key === range.start) classes.push("range-start");
  if (key === range.end) classes.push("range-end");
  if (range.start && !range.end && key === range.start) {
    classes.push("range-pending");
  }
  if (hasCompleteRange && key > range.start && key < range.end) {
    classes.push("range-middle");
  }

  return classes.join(" ");
}

function isDateKey(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatNumericDate(value: string) {
  if (!isDateKey(value)) return value;
  const [year, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}/${year}`;
}

const DATE_RANGE_SELECTOR_STYLES = `
  .drs-wrap {
    position: relative;
    width: max-content;
    max-width: 100%;
  }

  .drs-wrap.align-end .drs-panel {
    left: auto;
    right: 0;
  }

  .drs-trigger {
    align-items: center;
    background: #fff;
    border: 1px solid #8a8a8a;
    border-radius: 8px;
    color: #303030;
    cursor: pointer;
    display: inline-flex;
    font: inherit;
    font-weight: 600;
    gap: 8px;
    min-height: 36px;
    min-width: 170px;
    padding: 0 12px;
  }

  .drs-trigger svg {
    color: #303030;
    display: block;
    flex-shrink: 0;
  }

  .drs-chevron {
    margin-left: auto;
  }

  .drs-panel {
    background: #fff;
    border: 1px solid #d4d4d4;
    border-radius: 14px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14);
    display: grid;
    grid-template-columns: 170px minmax(360px, 1fr);
    left: 0;
    overflow: hidden;
    padding: 10px;
    position: absolute;
    top: calc(100% + 8px);
    width: min(810px, calc(100vw - 48px));
    z-index: 40;
  }

  .drs-presets {
    align-content: start;
    display: grid;
    gap: 4px;
    padding: 2px 10px 2px 0;
  }

  .drs-presets button {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 8px;
    color: #303030;
    cursor: pointer;
    display: flex;
    font: inherit;
    justify-content: space-between;
    min-height: 40px;
    padding: 8px 10px;
    text-align: left;
  }

  .drs-presets button:hover,
  .drs-presets button.selected {
    background: #e9e9e9;
    font-weight: 650;
  }

  .drs-calendar {
    border-left: 1px solid #ebebeb;
    display: grid;
    gap: 14px;
    min-width: 0;
    padding-left: 16px;
  }

  .drs-input-row {
    align-items: center;
    display: grid;
    gap: 14px;
    grid-template-columns: minmax(150px, 1fr) auto minmax(150px, 1fr);
  }

  .drs-display {
    align-items: center;
    border: 1px solid #aeb4b9;
    border-radius: 8px;
    color: #303030;
    display: flex;
    gap: 10px;
    min-height: 40px;
    padding: 0 12px;
  }

  .drs-display svg {
    color: #616161;
  }

  .drs-arrow {
    color: #303030;
    font-size: 26px;
    line-height: 1;
  }

  .drs-dual {
    display: grid;
    gap: 22px;
    grid-template-columns: repeat(2, minmax(220px, 1fr));
  }

  .drs-month {
    display: grid;
    gap: 12px;
  }

  .drs-month-heading {
    align-items: center;
    color: #303030;
    display: grid;
    grid-template-columns: 32px 1fr 32px;
    text-align: center;
  }

  .drs-month-nav {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 8px;
    color: #8a8a8a;
    cursor: pointer;
    display: inline-flex;
    height: 32px;
    justify-content: center;
    width: 32px;
  }

  .drs-month-nav:hover {
    background: #f1f1f1;
    color: #303030;
  }

  .drs-weekdays,
  .drs-days {
    display: grid;
    grid-template-columns: repeat(7, minmax(28px, 1fr));
  }

  .drs-weekdays span {
    color: #616161;
    font-size: 13px;
    font-weight: 650;
    padding: 4px 0;
    text-align: center;
  }

  .drs-days {
    row-gap: 2px;
  }

  .drs-day {
    background: transparent;
    border: 0;
    color: #303030;
    cursor: pointer;
    font: inherit;
    min-height: 40px;
    position: relative;
    z-index: 0;
  }

  .drs-day:hover {
    background: #f1f1f1;
  }

  .drs-day.range-middle {
    background: #f1f1f1;
  }

  .drs-day.range-start,
  .drs-day.range-end {
    background: #303030;
    color: #fff;
    font-weight: 700;
  }

  .drs-day.range-start {
    border-radius: 8px 0 0 8px;
  }

  .drs-day.range-end {
    border-radius: 0 8px 8px 0;
  }

  .drs-day.range-start.range-end {
    border-radius: 8px;
  }

  .drs-day.range-pending {
    border-radius: 8px;
  }

  .drs-day.today:not(.range-start):not(.range-end) {
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px #303030;
  }

  .drs-actions {
    align-items: center;
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }

  @media (max-width: 760px) {
    .drs-panel {
      grid-template-columns: 1fr;
      width: min(520px, calc(100vw - 32px));
    }

    .drs-calendar {
      border-left: 0;
      border-top: 1px solid #ebebeb;
      padding-left: 0;
      padding-top: 14px;
    }

    .drs-dual {
      grid-template-columns: 1fr;
    }
  }
`;
