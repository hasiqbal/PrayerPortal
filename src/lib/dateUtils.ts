// ─── British Summer Time (BST) ───────────────────────────────────────────────

/** Returns the date of the last Sunday of a given month/year (1-indexed month) */
export function lastSundayOf(year: number, month: number): number {
  const lastDay = new Date(year, month, 0).getDate(); // last day of month
  for (let d = lastDay; d >= 1; d--) {
    if (new Date(year, month - 1, d).getDay() === 0) return d;
  }
  return lastDay;
}

/**
 * Returns whether a given Gregorian date falls inside British Summer Time.
 * BST: last Sunday in March 01:00 UTC → last Sunday in October 01:00 UTC
 */
export function isBST(year: number, month: number, day: number): boolean {
  const bstStart = lastSundayOf(year, 3);  // last Sunday of March
  const bstEnd   = lastSundayOf(year, 10); // last Sunday of October

  if (month > 3 && month < 10) return true;
  if (month < 3 || month > 10) return false;
  if (month === 3)  return day >= bstStart;
  if (month === 10) return day < bstEnd;
  return false;
}

/** Returns the date of Jumu'ah (Friday) for each week in the month */
export function getFridaysInMonth(year: number, month: number): number[] {
  const days: number[] = [];
  const lastDay = new Date(year, month, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    if (new Date(year, month - 1, d).getDay() === 5) days.push(d);
  }
  return days;
}

// ─── Gregorian → Hijri conversion ────────────────────────────────────────────
// Based on the algorithmic approach by Dr. Irwin (Umm al-Qura calendar approximation).

const HIJRI_MONTHS = [
  'Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani',
  'Jumada al-Awwal', 'Jumada al-Thani', 'Rajab', "Sha'ban",
  'Ramadan', 'Shawwal', "Dhu al-Qi'dah", 'Dhu al-Hijjah',
];

export interface HijriDate {
  day: number;
  month: number;
  year: number;
  monthName: string;
  short: string;  // e.g. "14 Raj 1446"
  full: string;   // e.g. "14 Rajab 1446"
}

export function gregorianToHijri(gYear: number, gMonth: number, gDay: number): HijriDate {
  // Meeus / Borkowski algorithm
  const jd =
    Math.floor((1461 * (gYear + 4800 + Math.floor((gMonth - 14) / 12))) / 4) +
    Math.floor((367 * (gMonth - 2 - 12 * Math.floor((gMonth - 14) / 12))) / 12) -
    Math.floor((3 * Math.floor((gYear + 4900 + Math.floor((gMonth - 14) / 12)) / 100)) / 4) +
    gDay -
    32075;

  let l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  const j =
    Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) +
    Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l =
    l -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const hMonth = Math.floor((24 * l) / 709);
  const hDay   = l - Math.floor((709 * hMonth) / 24);
  const hYear  = 30 * n + j - 30;

  const monthName = HIJRI_MONTHS[(hMonth - 1 + 12) % 12] ?? '';
  const shortMonth = monthName.slice(0, 3);

  return {
    day: hDay,
    month: hMonth,
    year: hYear,
    monthName,
    short: `${hDay} ${shortMonth} ${hYear}`,
    full: `${hDay} ${monthName} ${hYear}`,
  };
}

// ─── Day-of-week helper ───────────────────────────────────────────────────────

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface DayInfo {
  dayOfWeek: number;    // 0 = Sun … 6 = Sat
  shortName: string;    // 'Mon'
  fullName: string;     // 'Monday'
  isFriday: boolean;
  isWeekend: boolean;   // Sat or Sun
  isBST: boolean;
  timezone: string;     // 'BST' | 'GMT'
  hijri: HijriDate;
  dateLabel: string;    // e.g. "Mon 3"  — no year/month (already shown in section header)
  isClockChange: boolean; // true on last Sunday of March or October
  clockChangeLabel: string; // e.g. 'Clocks go forward' | 'Clocks go back' | ''
}

export function getDayInfo(year: number, month: number, day: number, hijriOffset = 0): DayInfo {
  const date = new Date(year, month - 1, day);
  const dow = date.getDay();
  const bst = isBST(year, month, day);

  // Clock change: last Sunday of March (forward) or October (back)
  const isMarchOrOct = month === 3 || month === 10;
  const isLastSunday = dow === 0 && isMarchOrOct && day === lastSundayOf(year, month);
  const clockChangeLabel = isLastSunday
    ? month === 3
      ? 'Clocks go forward +1h'
      : 'Clocks go back -1h'
    : '';

  // Apply Hijri offset by shifting the Gregorian date used for Hijri calculation
  let hYear = year, hMonth = month, hDay = day;
  if (hijriOffset !== 0) {
    const shifted = new Date(year, month - 1, day + hijriOffset);
    hYear = shifted.getFullYear();
    hMonth = shifted.getMonth() + 1;
    hDay = shifted.getDate();
  }

  return {
    dayOfWeek: dow,
    shortName: DAY_NAMES_SHORT[dow],
    fullName: DAY_NAMES_FULL[dow],
    isFriday: dow === 5,
    isWeekend: dow === 0 || dow === 6,
    isBST: bst,
    timezone: bst ? 'BST' : 'GMT',
    hijri: gregorianToHijri(hYear, hMonth, hDay),
    dateLabel: `${DAY_NAMES_SHORT[dow]} ${day}`,
    isClockChange: isLastSunday,
    clockChangeLabel,
  };
}
