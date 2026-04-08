/**
 * Prayer time utilities
 * Pure functions — no side effects, no Supabase calls.
 */

// ─── Time parsing ─────────────────────────────────────────────────────────────

/** Convert "HH:MM" or "HH:MM:SS" to total seconds. Returns null for invalid input. */
export function timeToSeconds(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const parts = timeStr.split(':').map(Number);
  const [h, m, s = 0] = parts;
  if (isNaN(h) || isNaN(m)) return null;
  return h * 3600 + m * 60 + s;
}

/** Convert "HH:MM" to total minutes. Returns null for invalid input. */
export function timeToMinutes(timeStr: string | null | undefined): number | null {
  const secs = timeToSeconds(timeStr);
  return secs === null ? null : Math.floor(secs / 60);
}

/** Format a total-seconds duration as "Xh MMm SSs" or "MMm SSs" or "SSs". */
export function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'Now';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** Return the current time as total seconds since midnight. */
export function nowInSeconds(): number {
  const n = new Date();
  return n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds();
}

/** Return the current time as total minutes since midnight. */
export function nowInMinutes(): number {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

export const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export const DAYS_FULL = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

/** Simple approximate Hijri date string (accurate within ±1 day). */
export function getSimpleHijriDate(): string {
  const HIJRI_MONTHS = [
    'Muharram', 'Safar', "Rabi' al-Awwal", "Rabi' al-Akhir",
    'Jumada al-Ula', 'Jumada al-Akhira', 'Rajab', "Sha'ban",
    'Ramadan', 'Shawwal', "Dhu al-Qi'dah", 'Dhu al-Hijjah',
  ];
  const gregorianDate = new Date();
  const epochDiff = 1948438.5;
  const jd = gregorianDate.getTime() / 86400000 + 2440587.5;
  const daysSinceEpoch = jd - epochDiff;
  const yearsSinceEpoch = daysSinceEpoch / 354.367;
  const hijriYear = Math.floor(yearsSinceEpoch) + 1;
  const daysInYear = (yearsSinceEpoch - Math.floor(yearsSinceEpoch)) * 354.367;
  const monthIdx = Math.min(Math.floor(daysInYear / 29.5), 11);
  const hijriDay = Math.floor(daysInYear % 29.5) + 1;
  return `${hijriDay} ${HIJRI_MONTHS[monthIdx]} ${hijriYear} AH`;
}

// ─── Relative time ────────────────────────────────────────────────────────────

/** Format an ISO timestamp as a human-readable relative string (e.g. "3h ago"). */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Returns true if a string matches HH:MM (24-hour) format. */
export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value.trim());
}

/** Returns a list of missing required prayer time fields for a given row. */
export function getMissingPrayerFields(row: Record<string, unknown>): string[] {
  const required = ['fajr', 'sunrise', 'zuhr', 'asr', 'maghrib', 'isha'];
  return required.filter((f) => !row[f]);
}
