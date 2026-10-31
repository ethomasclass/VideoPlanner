// Dates are handled as local "YYYY-MM-DD" strings so nothing shifts across time zones.

export const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const fromISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (s: string, n: number) => {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

export const todayISO = () => toISO(new Date());

/** Monday-first weeks covering the whole month. */
export function monthGrid(year: number, month: number): string[][] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // days since Monday
  let cursor = addDays(toISO(first), -offset);
  const weeks: string[][] = [];
  do {
    const week = Array.from({ length: 7 }, (_, i) => addDays(cursor, i));
    weeks.push(week);
    cursor = addDays(cursor, 7);
  } while (fromISO(cursor).getMonth() === month);
  return weeks;
}

/** Monday of the week containing the date. */
export const weekStart = (s: string) => addDays(s, -((fromISO(s).getDay() + 6) % 7));

export const fmtShort = (s: string) =>
  fromISO(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
