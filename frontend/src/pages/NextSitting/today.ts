/** Today's date as YYYY-MM-DD in the browser's local time (the Operator's day). */
export function localToday(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** The current time as HH:MM in the browser's local time (stamped on a result at Save). */
export function localTime(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(now.getHours())}:${p(now.getMinutes())}`;
}
