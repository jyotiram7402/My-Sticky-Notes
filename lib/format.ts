// Date and time formatting without a date library. All output uses the device's local time.

const DAY_MS = 86_400_000;

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Whole days from today to `date` (0 = today, -1 = yesterday, 1 = tomorrow). DST safe. */
export function dayOffset(date: Date, now: Date = new Date()): number {
  return Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS);
}

function numericDate(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** Card date line: "Today", "Yesterday", "Tomorrow" or dd/mm/yyyy. */
export function formatDayLabel(date: Date, now: Date = new Date()): string {
  const offset = dayOffset(date, now);
  if (offset === 0) return "Today";
  if (offset === -1) return "Yesterday";
  if (offset === 1) return "Tomorrow";
  return numericDate(date);
}

/** Card time, like 04:00PM. */
export function formatClock(date: Date): string {
  const hours = date.getHours();
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${pad(hour12)}:${pad(date.getMinutes())}${hours < 12 ? "AM" : "PM"}`;
}

/** Editor pill, like "Edited today, 2:23 pm". */
export function formatEdited(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Edited";
  const offset = dayOffset(date, now);
  const day = offset === 0 ? "today" : offset === -1 ? "yesterday" : numericDate(date);
  const hours = date.getHours();
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `Edited ${day}, ${hour12}:${pad(date.getMinutes())} ${hours < 12 ? "am" : "pm"}`;
}

export interface DueParts {
  day: string;
  month: string;
  year: string;
  hour: string;
  minute: string;
  period: "AM" | "PM";
}

/** Pieces for the big "29 - 04 - 2026" and "02 : 30 PM" display. */
export function dueParts(iso: string): DueParts | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const hours = date.getHours();
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return {
    day: pad(date.getDate()),
    month: pad(date.getMonth() + 1),
    year: String(date.getFullYear()),
    hour: pad(hour12),
    minute: pad(date.getMinutes()),
    period: hours < 12 ? "AM" : "PM",
  };
}

/** Value for <input type="date">: YYYY-MM-DD in local time. */
export function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Value for <input type="time">: HH:MM in local time. */
export function toTimeInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Today's date as YYYY-MM-DD in local time. */
export function todayInputValue(): string {
  return toDateInputValue(new Date().toISOString());
}

/** Combines local date and time input values into an ISO timestamp, or null when invalid. */
export function fromLocalInputs(dateValue: string, timeValue: string): string | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!dateMatch) return null;
  const timeMatch = /^(\d{2}):(\d{2})/.exec(timeValue);
  const hours = timeMatch ? Number(timeMatch[1]) : 9;
  const minutes = timeMatch ? Number(timeMatch[2]) : 0;
  const date = new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), hours, minutes, 0, 0);
  if (Number.isNaN(date.getTime()) || date.getFullYear() > 9999) return null;
  return date.toISOString();
}
