import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toDateKey } from "./DateRangeSelector";

type InlineDateRangeCalendarProps = {
  start: string;
  end: string;
  onChange: (range: { start: string; end: string }) => void;
  startName?: string;
  endName?: string;
};

export function InlineDateRangeCalendar({
  start,
  end,
  onChange,
  startName = "startDate",
  endName = "endDate",
}: InlineDateRangeCalendarProps) {
  const [monthDate, setMonthDate] = useState(() =>
    dateFromKey(start || toDateKey(new Date())),
  );
  const days = monthGrid(monthDate);
  const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  const selectDay = (key: string) => {
    // Completing an open selection (start set, end not yet chosen).
    if (start && !end) {
      if (key < start) {
        onChange({ start: key, end: start });
      } else {
        // Same day is allowed: single-day time off.
        onChange({ start, end: key });
      }
      return;
    }

    // Complete single-day selection: clicking another day extends the range.
    if (start && end && start === end) {
      if (key < start) {
        onChange({ start: key, end: start });
      } else if (key > end) {
        onChange({ start, end: key });
      } else {
        onChange({ start: key, end: key });
      }
      return;
    }

    // Empty or multi-day range: start a new single-day selection immediately
    // so same-day time off works with one click.
    onChange({ start: key, end: key });
  };

  return (
    <div className="idrc">
      <input type="hidden" name={startName} value={start} />
      <input type="hidden" name={endName} value={end || start} />

      <div className="idrc-heading">
        <button
          className="idrc-nav"
          type="button"
          aria-label="Previous month"
          onClick={() => setMonthDate(addMonths(monthDate, -1))}
        >
          <ChevronLeft aria-hidden="true" size={20} />
        </button>
        <strong>{monthLabel(monthDate)}</strong>
        <button
          className="idrc-nav"
          type="button"
          aria-label="Next month"
          onClick={() => setMonthDate(addMonths(monthDate, 1))}
        >
          <ChevronRight aria-hidden="true" size={20} />
        </button>
      </div>

      <div className="idrc-weekdays" aria-hidden="true">
        {weekdays.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>

      <div className="idrc-days">
        {days.map((day, index) =>
          day ? (
            <button
              key={toDateKey(day)}
              className={dayClass(toDateKey(day), start, end)}
              type="button"
              onClick={() => selectDay(toDateKey(day))}
            >
              {day.getDate()}
            </button>
          ) : (
            <span key={`empty-${index}`} />
          ),
        )}
      </div>

      <style>{INLINE_DATE_RANGE_STYLES}</style>
    </div>
  );
}

function dayClass(key: string, start: string, end: string) {
  const classes = ["idrc-day"];
  const todayKey = toDateKey(new Date());
  const hasCompleteRange = Boolean(start && end);

  if (key === todayKey) classes.push("today");
  if (key === start) classes.push("range-start");
  if (key === end) classes.push("range-end");
  if (start && !end && key === start) classes.push("range-pending");
  if (hasCompleteRange && key > start && key < end) classes.push("range-middle");

  return classes.join(" ");
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addMonths(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
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

const INLINE_DATE_RANGE_STYLES = `
  .idrc {
    display: grid;
    gap: 12px;
    max-width: 320px;
  }

  .idrc-heading {
    align-items: center;
    color: #303030;
    display: grid;
    grid-template-columns: 32px 1fr 32px;
    text-align: center;
  }

  .idrc-nav {
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

  .idrc-nav:hover {
    background: #f1f1f1;
    color: #303030;
  }

  .idrc-weekdays,
  .idrc-days {
    display: grid;
    grid-template-columns: repeat(7, minmax(28px, 1fr));
  }

  .idrc-weekdays span {
    color: #616161;
    font-size: 13px;
    font-weight: 650;
    padding: 4px 0;
    text-align: center;
  }

  .idrc-days {
    row-gap: 2px;
  }

  .idrc-day {
    background: transparent;
    border: 0;
    color: #303030;
    cursor: pointer;
    font: inherit;
    min-height: 40px;
    position: relative;
  }

  .idrc-day:hover {
    background: #f1f1f1;
  }

  .idrc-day.range-middle {
    background: #f1f1f1;
  }

  .idrc-day.range-start,
  .idrc-day.range-end,
  .idrc-day.range-pending {
    background: #303030;
    color: #fff;
    font-weight: 700;
  }

  .idrc-day.range-start {
    border-radius: 8px 0 0 8px;
  }

  .idrc-day.range-end {
    border-radius: 0 8px 8px 0;
  }

  .idrc-day.range-start.range-end,
  .idrc-day.range-pending {
    border-radius: 8px;
  }

  .idrc-day.today:not(.range-start):not(.range-end):not(.range-pending) {
    box-shadow: inset 0 0 0 1px #303030;
    border-radius: 8px;
  }
`;
