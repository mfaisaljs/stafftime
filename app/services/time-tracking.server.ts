import type { BreakEntry, Setting, TimeEntry } from "@prisma/client";

const MS_PER_HOUR = 1000 * 60 * 60;

export type TimeSummary = {
  totalWorkedMinutes: number;
  paidBreakMinutes: number;
  unpaidBreakMinutes: number;
  overtimeMinutes: number;
  paidMinutes: number;
};

export function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

/** Exact elapsed seconds (floor ms→s, no minute rounding). */
export function secondsBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

export type TimeSummarySeconds = {
  totalWorkedSeconds: number;
  paidBreakSeconds: number;
  unpaidBreakSeconds: number;
  paidSeconds: number;
};

export function calculateBreakSeconds(
  breaks: Pick<BreakEntry, "type" | "startedAt" | "endedAt">[],
  endReference: Date,
): { paidBreakSeconds: number; unpaidBreakSeconds: number } {
  let paidBreakSeconds = 0;
  let unpaidBreakSeconds = 0;

  for (const breakEntry of breaks) {
    const end = breakEntry.endedAt ?? endReference;
    const seconds = secondsBetween(breakEntry.startedAt, end);
    if (breakEntry.type === "PAID") {
      paidBreakSeconds += seconds;
    } else {
      unpaidBreakSeconds += seconds;
    }
  }

  return { paidBreakSeconds, unpaidBreakSeconds };
}

export function summarizeTimeEntrySeconds(
  entry: Pick<TimeEntry, "clockInAt" | "clockOutAt"> & {
    breaks: Pick<BreakEntry, "type" | "startedAt" | "endedAt">[];
  },
  referenceDate = new Date(),
): TimeSummarySeconds {
  const end = entry.clockOutAt ?? referenceDate;
  const totalWorkedSeconds = secondsBetween(entry.clockInAt, end);
  const { paidBreakSeconds, unpaidBreakSeconds } = calculateBreakSeconds(
    entry.breaks,
    end,
  );

  return {
    totalWorkedSeconds,
    paidBreakSeconds,
    unpaidBreakSeconds,
    paidSeconds: Math.max(0, totalWorkedSeconds - unpaidBreakSeconds),
  };
}

export function formatDurationHms(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${mins}m ${seconds}s`;
}

export function calculateBreakMinutes(
  breaks: Pick<BreakEntry, "type" | "startedAt" | "endedAt">[],
  endReference: Date,
): { paidBreakMinutes: number; unpaidBreakMinutes: number } {
  let paidBreakMinutes = 0;
  let unpaidBreakMinutes = 0;

  for (const breakEntry of breaks) {
    const end = breakEntry.endedAt ?? endReference;
    const minutes = minutesBetween(breakEntry.startedAt, end);
    if (breakEntry.type === "PAID") {
      paidBreakMinutes += minutes;
    } else {
      unpaidBreakMinutes += minutes;
    }
  }

  return { paidBreakMinutes, unpaidBreakMinutes };
}

export function summarizeTimeEntry(
  entry: TimeEntry & { breaks: BreakEntry[] },
  settings: Pick<Setting, "overtimeDailyHours">,
  referenceDate = new Date(),
): TimeSummary {
  const end = entry.clockOutAt ?? referenceDate;
  const totalWorkedMinutes = minutesBetween(entry.clockInAt, end);
  const { paidBreakMinutes, unpaidBreakMinutes } = calculateBreakMinutes(
    entry.breaks,
    end,
  );
  const paidMinutes = totalWorkedMinutes - unpaidBreakMinutes;
  const overtimeThresholdMinutes = settings.overtimeDailyHours * 60;
  const overtimeMinutes = Math.max(0, paidMinutes - overtimeThresholdMinutes);

  return {
    totalWorkedMinutes,
    paidBreakMinutes,
    unpaidBreakMinutes,
    overtimeMinutes,
    paidMinutes,
  };
}

export function summarizeWeeklyOvertime(
  entries: Array<TimeEntry & { breaks: BreakEntry[] }>,
  settings: Pick<Setting, "overtimeDailyHours" | "overtimeWeeklyHours">,
  referenceDate = new Date(),
): TimeSummary {
  const daily = entries.map((entry) =>
    summarizeTimeEntry(entry, settings, referenceDate),
  );

  const totalWorkedMinutes = daily.reduce(
    (sum, item) => sum + item.totalWorkedMinutes,
    0,
  );
  const paidBreakMinutes = daily.reduce(
    (sum, item) => sum + item.paidBreakMinutes,
    0,
  );
  const unpaidBreakMinutes = daily.reduce(
    (sum, item) => sum + item.unpaidBreakMinutes,
    0,
  );
  const paidMinutes = daily.reduce((sum, item) => sum + item.paidMinutes, 0);
  const dailyOvertimeMinutes = daily.reduce(
    (sum, item) => sum + item.overtimeMinutes,
    0,
  );
  const weeklyThresholdMinutes = settings.overtimeWeeklyHours * 60;
  const weeklyOvertimeMinutes = Math.max(
    0,
    paidMinutes - weeklyThresholdMinutes,
  );

  return {
    totalWorkedMinutes,
    paidBreakMinutes,
    unpaidBreakMinutes,
    paidMinutes,
    overtimeMinutes: Math.max(dailyOvertimeMinutes, weeklyOvertimeMinutes),
  };
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

export function isLate(clockInAt: Date, shiftStart: Date, graceMinutes = 5) {
  return clockInAt.getTime() > shiftStart.getTime() + graceMinutes * MS_PER_HOUR / 60 * 60;
}
