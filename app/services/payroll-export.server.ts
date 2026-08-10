import type { BreakEntry, Employee, Setting, TimeEntry } from "@prisma/client";
import { formatMinutes, summarizeTimeEntry } from "./time-tracking.server";

type ExportRow = {
  employeeId: string;
  employeeName: string;
  department: string;
  location: string;
  clockIn: string;
  clockOut: string;
  totalWorked: string;
  paidHours: string;
  unpaidBreaks: string;
  overtime: string;
  hourlyRate: number;
  laborCost: number;
};

export function buildPayrollCsv(
  entries: Array<
    TimeEntry & {
      employee: Employee;
      breaks: BreakEntry[];
      location: { name: string };
    }
  >,
  settings: Pick<Setting, "overtimeDailyHours" | "deductBreakTime">,
): string {
  const rows: ExportRow[] = entries.map((entry) => {
    const summary = summarizeTimeEntry(entry, settings);
    const paidHours = summary.paidMinutes / 60;
    const hourlyRate = entry.hourlyRateSnapshot ?? entry.employee.hourlyRate;
    const laborCost = paidHours * hourlyRate;

    return {
      employeeId: entry.employee.id,
      employeeName: `${entry.employee.firstName} ${entry.employee.lastName}`,
      department: entry.employee.department ?? "",
      location: entry.location.name,
      clockIn: entry.clockInAt.toISOString(),
      clockOut: entry.clockOutAt?.toISOString() ?? "",
      totalWorked: formatMinutes(summary.totalWorkedMinutes),
      paidHours: paidHours.toFixed(2),
      unpaidBreaks: formatMinutes(summary.unpaidBreakMinutes),
      overtime: formatMinutes(summary.overtimeMinutes),
      hourlyRate,
      laborCost: Number(laborCost.toFixed(2)),
    };
  });

  const headers = Object.keys(
    rows[0] ?? {
      employeeId: "",
      employeeName: "",
      department: "",
      location: "",
      clockIn: "",
      clockOut: "",
      totalWorked: "",
      paidHours: "",
      unpaidBreaks: "",
      overtime: "",
      hourlyRate: 0,
      laborCost: 0,
    },
  );

  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header as keyof ExportRow];
          const stringValue = String(value ?? "");
          return stringValue.includes(",")
            ? `"${stringValue.replace(/"/g, '""')}"`
            : stringValue;
        })
        .join(","),
    ),
  ];

  return lines.join("\n");
}
