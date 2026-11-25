import {isDeepStrictEqual} from 'node:util';
import {sampleEnrollmentManifest} from './published-sample-enrollments.mjs';

// Independent, offline oracle. Only the reviewed literal migration manifest is
// shared with the fixture binder; no production schedule or answer helper runs.
// These recurring meetings do not establish holidays, cancellations or attendance.
const DAY = 86_400_000;
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const messages = Object.freeze({
  'invalid-clock': 'An explicit valid ISO timestamp with a timezone is required.',
  'invalid-binding': 'The next-class binding differs from the independent literal oracle.',
  'clock-moved-backwards': 'The evaluation clock moved before the original binding.',
  'fixture-window-not-started': 'The literal published sample evaluation window has not started.',
  'fixture-window-expired': 'The literal published sample evaluation window has expired; dates cannot be rebased.',
  'next-occurrence-changed': 'The next class changed during evaluation; the original answer cannot be graded against a new expectation.',
});
function fail(reason) {
  const error = new Error(messages[reason]);
  error.name = 'PublishedNextClassClockError';
  error.code = 'fixture-clock-invalid';
  error.reason = reason;
  throw error;
}
function instant(value) {
  if (typeof value !== 'string' || value.length > 29) fail('invalid-clock');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(Z|([+-])(\d{2}):(\d{2}))$/u.exec(value);
  if (!match) fail('invalid-clock');
  const [, year, month, day, hour, minute, second, millisecond = '000', zone, sign, zoneHour = '0', zoneMinute = '0'] = match;
  if (+year < 1 || +hour > 23 || +minute > 59 || +second > 59 || +zoneHour > 14 || +zoneMinute > 59 || (+zoneHour === 14 && +zoneMinute !== 0)) fail('invalid-clock');
  const time = Date.parse(value);
  const offset = zone === 'Z' ? 0 : (sign === '+' ? 1 : -1) * (+zoneHour * 60 + +zoneMinute);
  const local = new Date(time + offset * 60_000);
  if (!Number.isFinite(time) || local.getUTCFullYear() !== +year || local.getUTCMonth() + 1 !== +month || local.getUTCDate() !== +day
    || local.getUTCHours() !== +hour || local.getUTCMinutes() !== +minute || local.getUTCSeconds() !== +second || local.getUTCMilliseconds() !== +millisecond) fail('invalid-clock');
  return time;
}
const iso = time => new Date(time).toISOString();
const campusDay = time => new Date(time + 8 * 3_600_000).toISOString().slice(0, 10);
function requireWindow(time) {
  if (time < Date.parse(sampleEnrollmentManifest.validity.startsAt)) fail('fixture-window-not-started');
  if (time >= Date.parse(sampleEnrollmentManifest.validity.expiresAt)) fail('fixture-window-expired');
}

/**
 * Return the earliest strictly future enrolled meeting from the literal five
 * sample rows. Taipei is UTC+08:00 throughout these fixed 2026/2027 terms.
 * Raw calculation intentionally supports times outside the evaluation window
 * so term edges can be checked; buildPublishedNextClassExpectation enforces it.
 */
export function publishedSampleNextClass(now) {
  const time = instant(now);
  const candidates = [];
  for (const course of sampleEnrollmentManifest.courses) {
    if (course.status !== 'enrolled') continue;
    const term = sampleEnrollmentManifest.terms.find(row => row.code === course.termCode);
    for (let day = Date.parse(`${term.startsOn}T00:00:00Z`); day <= Date.parse(`${term.endsOn}T00:00:00Z`); day += DAY) {
      if ((new Date(day).getUTCDay() || 7) !== course.weekday) continue;
      const date = iso(day).slice(0, 10);
      const start = Date.parse(`${date}T${course.startsAt}+08:00`);
      if (start <= time) continue;
      candidates.push({
        code: course.code, title: course.title, date, startsAt: course.startsAt, endsAt: course.endsAt,
        room: course.room, instructor: course.instructor, termCode: term.code, termLabel: term.label,
        sourceMode: 'sample', startsAtInstant: iso(start), endsAtInstant: iso(Date.parse(`${date}T${course.endsAt}+08:00`)),
      });
    }
  }
  candidates.sort((left, right) => left.startsAtInstant.localeCompare(right.startsAtInstant) || left.code.localeCompare(right.code));
  return freeze({asOf: iso(time), campusDate: campusDay(time), timeZone: 'Asia/Taipei', next: candidates[0] ?? null});
}

/** Freeze one run's golden before its request. Never rebuild it after an answer. */
export function buildPublishedNextClassExpectation({now} = {}) {
  const time = instant(now);
  requireWindow(time);
  const result = publishedSampleNextClass(now);
  return freeze({
    version: 1, source: 'published-sample-enrollment-manifest-v1', ...result,
    validity: {...sampleEnrollmentManifest.validity},
    validUntil: iso(Math.min(Date.parse(sampleEnrollmentManifest.validity.expiresAt), result.next ? Date.parse(result.next.startsAtInstant) : Infinity)),
    validUntilExclusive: true,
  });
}

/**
 * Use immediately before transport and after readback. A failure is a clock /
 * setup failure, not a chatbot failure. No golden mutation or silent rebinding.
 * A midnight crossing is allowed if the exact next occurrence is unchanged.
 */
export function assertPublishedNextClassClock(binding, {now} = {}) {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) fail('invalid-binding');
  let original;
  try { original = buildPublishedNextClassExpectation({now: binding.asOf}); } catch { fail('invalid-binding'); }
  if (!isDeepStrictEqual(binding, original)) fail('invalid-binding');
  const time = instant(now);
  if (time < Date.parse(original.asOf)) fail('clock-moved-backwards');
  requireWindow(time);
  const current = publishedSampleNextClass(now);
  if (time >= Date.parse(original.validUntil) || !isDeepStrictEqual(original.next, current.next)) fail('next-occurrence-changed');
  return freeze({valid: true, checkedAt: current.asOf, campusDate: current.campusDate, next: current.next});
}
