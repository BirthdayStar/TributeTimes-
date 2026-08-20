'use strict';

// ============================================================
// NZ "TODAY" — timezone-safe date-of-record for age/counter math
// (new_changes.md, 7 Aug 2026 QA session, bug #6: "years married"
// counter off by one)
//
// Root cause: every "how many years since X" calculation in this app
// (Birthday age, Anniversary "years married", New Baby "days old")
// compared against `new Date()` — i.e. whatever timezone the Node
// process itself happens to be running in. Confirmed directly: this
// sandbox's own system clock runs in Pakistan Standard Time (UTC+5);
// Render.com (the actual production host) almost certainly runs UTC by
// default. New Zealand (UTC+12/+13) is this app's primary market — for
// several hours of every single NZ day, the server's own calendar date
// is still "yesterday" relative to a customer physically in NZ. On the
// customer's actual wedding anniversary, testing during that window
// produces exactly the client's reported symptom: a wedding date that
// is genuinely, exactly N years ago today (NZ time) computes as N-1,
// because the server's own "today" hadn't rolled over yet.
//
// Fix: never use the server process's own timezone for these
// calculations. Always resolve "today" as a New Zealand calendar date
// via Intl (which carries its own timezone database, independent of the
// server's OS/process timezone), regardless of where this code is
// actually running.
// ============================================================

const NZ_TIMEZONE = 'Pacific/Auckland';

// Returns { year, month, day } for "today" in New Zealand, right now —
// month is 1-indexed, matching every other date field in this codebase.
function getNzTodayParts() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: NZ_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const map = {};
  for (const part of parts) map[part.type] = part.value;
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

// Whole years elapsed from (year, month, day) to "today" in NZ — the
// shared formula behind Birthday's age, Anniversary's "years married",
// and any other "how many years since this date" counter. Never counts
// a year as complete until the anniversary's month+day has actually
// passed in NZ, and never depends on the server's own timezone.
function yearsElapsedToNzToday(year, month, day) {
  const nz = getNzTodayParts();
  const hasHadAnniversaryThisYear = nz.month > month || (nz.month === month && nz.day >= day);
  return nz.year - year - (hasHadAnniversaryThisYear ? 0 : 1);
}

// Whole days elapsed from (year, month, day) to "today" in NZ — used for
// the Birthday/New Baby "you are X days old" counter. Constructed via
// Date.UTC on both sides so the day-count is a pure calendar-date diff,
// unaffected by daylight saving or the server's own local time-of-day.
function daysElapsedToNzToday(year, month, day) {
  const nz = getNzTodayParts();
  const startUtc = Date.UTC(year, month - 1, day);
  const nowUtc = Date.UTC(nz.year, nz.month - 1, nz.day);
  return Math.floor((nowUtc - startUtc) / (1000 * 60 * 60 * 24));
}

module.exports = { getNzTodayParts, yearsElapsedToNzToday, daysElapsedToNzToday };
