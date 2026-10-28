/** Gregorian date-only helpers. No local-time conversion of stored workshop dates. */
export function dateOnly(value: unknown): Date | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value.startsWith("0000")
  )
    return null;
  const result = new Date(value + "T12:00:00Z");
  return Number.isFinite(result.getTime()) &&
    result.toISOString().slice(0, 10) === value
    ? result
    : null;
}
export function calendarDate(year: number, month: number, day = 1) {
  const date = new Date(0);
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCFullYear(year, month, day);
  return date;
}
export function dateString(date: Date) {
  return date.toISOString().slice(0, 10);
}
