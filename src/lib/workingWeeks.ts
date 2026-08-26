import { formatWeek } from "@/lib/kpi";

export type WorkingWeekRange = { from: string; to: string };

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function dateOnlyLocal(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function localDateFromIso(iso: string) {
  const [yearValue, monthValue, dayValue] = iso.split("-").map(Number);
  return new Date(
    Number.isFinite(yearValue) ? yearValue : new Date().getFullYear(),
    Number.isFinite(monthValue) ? monthValue - 1 : new Date().getMonth(),
    Number.isFinite(dayValue) ? dayValue : 1,
  );
}

function isoFromLocalDate(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function addDaysLocal(iso: string, days: number) {
  const date = localDateFromIso(iso);
  date.setDate(date.getDate() + days);
  return isoFromLocalDate(date);
}

export function workingWeekStartForDate(iso = dateOnlyLocal()) {
  const date = localDateFromIso(iso);
  const day = date.getDay();
  if (day === 6) {
    date.setDate(date.getDate() + 2);
  } else if (day === 0) {
    date.setDate(date.getDate() + 1);
  } else if (day !== 1) {
    date.setDate(date.getDate() - (day - 1));
  }
  return isoFromLocalDate(date);
}

export function workingWeekRangeForDate(iso = dateOnlyLocal()): WorkingWeekRange {
  const from = workingWeekStartForDate(iso);
  return { from, to: addDaysLocal(from, 4) };
}

export function formatWorkingWeekRange(range: WorkingWeekRange) {
  return `${formatWeek(range.from)} - ${formatWeek(range.to)}`;
}
