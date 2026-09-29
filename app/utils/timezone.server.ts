import type { Shop, StoreLocation } from "@prisma/client";

export const DEFAULT_TIME_ZONE = "UTC";

type TimeZoneSource = Pick<StoreLocation, "timezone"> | Pick<Shop, "timezone"> | null | undefined;

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>();

export function normalizeTimeZone(timezone: string | null | undefined) {
  const value = timezone?.trim();
  if (!value) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export function resolveTimeZone(
  ...sources: Array<string | TimeZoneSource>
) {
  for (const source of sources) {
    const value =
      typeof source === "string" ? source : source?.timezone;
    if (value && normalizeTimeZone(value) !== DEFAULT_TIME_ZONE) {
      return normalizeTimeZone(value);
    }
  }
  return DEFAULT_TIME_ZONE;
}

function formatterFor(timeZone: string) {
  const normalized = normalizeTimeZone(timeZone);
  const cached = dateTimeFormatCache.get(normalized);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: normalized,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  dateTimeFormatCache.set(normalized, formatter);
  return formatter;
}

export function zonedParts(value: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

export function toDateKeyInTimeZone(value: Date, timeZone: string) {
  const parts = zonedParts(value, timeZone);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

export function toTimeInputValueInTimeZone(value: Date, timeZone: string) {
  const parts = zonedParts(value, timeZone);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function formatClockTimeInTimeZone(
  value: Date | string,
  timeFormat: "24H" | "12H" = "24H",
  timeZone = DEFAULT_TIME_ZONE,
  includeSeconds = false,
) {
  const date = typeof value === "string" ? new Date(value) : value;
  const zone = normalizeTimeZone(timeZone);
  if (timeFormat === "24H") {
    const parts = zonedParts(date, zone);
    const base = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
    return includeSeconds
      ? `${base}:${String(parts.second).padStart(2, "0")}`
      : base;
  }
  return date.toLocaleTimeString(undefined, {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" as const } : {}),
  });
}

export function formatDateTimeInTimeZone(
  value: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
) {
  return value.toLocaleString(undefined, {
    ...options,
    timeZone: normalizeTimeZone(timeZone),
  });
}

function wallTimeToUtcMs(
  dateKey: string,
  time: string,
  timeZone: string,
  millisecond = 0,
) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute, second = 0] = time.split(":").map(Number);
  const targetWallMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let candidateMs = targetWallMs;

  for (let i = 0; i < 3; i += 1) {
    const parts = zonedParts(new Date(candidateMs), timeZone);
    const actualWallMs = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      millisecond,
    );
    const delta = targetWallMs - actualWallMs;
    if (delta === 0) break;
    candidateMs += delta;
  }

  return candidateMs;
}

export function parseZonedDateTime(
  dateKey: string,
  time: string,
  timeZone: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("Choose a valid date.");
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new Error("Choose a valid time.");
  }
  const value = new Date(wallTimeToUtcMs(dateKey, `${time}:00`, timeZone));
  if (Number.isNaN(value.getTime())) {
    throw new Error("Choose a valid date and time.");
  }
  return value;
}

export function startOfDayInTimeZone(value: Date | string, timeZone: string) {
  const dateKey =
    typeof value === "string" ? value : toDateKeyInTimeZone(value, timeZone);
  return new Date(wallTimeToUtcMs(dateKey, "00:00:00", timeZone));
}

export function endOfDayInTimeZone(value: Date | string, timeZone: string) {
  const dateKey =
    typeof value === "string" ? value : toDateKeyInTimeZone(value, timeZone);
  return new Date(wallTimeToUtcMs(dateKey, "23:59:59", timeZone, 999));
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

export function dayOfWeekInTimeZone(value: Date, timeZone: string) {
  const key = toDateKeyInTimeZone(value, timeZone);
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function startOfWeekInTimeZone(value: Date, timeZone: string) {
  const key = toDateKeyInTimeZone(value, timeZone);
  const startKey = addDaysToDateKey(key, -dayOfWeekInTimeZone(value, timeZone));
  return startOfDayInTimeZone(startKey, timeZone);
}

export function endOfWeekInTimeZone(value: Date, timeZone: string) {
  const startKey = toDateKeyInTimeZone(startOfWeekInTimeZone(value, timeZone), timeZone);
  return endOfDayInTimeZone(addDaysToDateKey(startKey, 6), timeZone);
}

export function startOfMonthInTimeZone(value: Date, timeZone: string) {
  const parts = zonedParts(value, timeZone);
  const key = `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-01`;
  return startOfDayInTimeZone(key, timeZone);
}

export function endOfMonthInTimeZone(value: Date, timeZone: string) {
  const parts = zonedParts(value, timeZone);
  const nextMonth = new Date(Date.UTC(parts.year, parts.month, 1));
  const nextKey = nextMonth.toISOString().slice(0, 10);
  return new Date(startOfDayInTimeZone(nextKey, timeZone).getTime() - 1);
}
