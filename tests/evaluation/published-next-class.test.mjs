import assert from 'node:assert/strict';
import test from 'node:test';
import {publishedSampleNextClass, buildPublishedNextClassExpectation, assertPublishedNextClassClock} from './published-next-class.mjs';

const rejects = (work, reason) => assert.throws(work, error => error.code === 'fixture-clock-invalid' && error.reason === reason);
const tuple = now => {
  const {next} = publishedSampleNextClass(now);
  return next && [next.code, next.date, next.startsAt, next.room];
};

test('Saturday actual-time golden selects the next Monday literal sample class', () => {
  const actual = publishedSampleNextClass('2026-11-14T02:00:00Z');
  assert.deepEqual(actual, {
    asOf: '2026-11-14T02:00:00.000Z', campusDate: '2026-11-14', timeZone: 'Asia/Taipei',
    next: {code: 'SAMP101', title: 'Campus Orientation', date: '2026-11-16', startsAt: '09:00:00', endsAt: '10:30:00',
      room: 'Sample Room 101', instructor: 'Sample instructor', termCode: 'SAMPLE-2026-FALL', termLabel: 'Sample Fall 2026',
      sourceMode: 'sample', startsAtInstant: '2026-11-16T01:00:00.000Z', endsAtInstant: '2026-11-16T02:30:00.000Z'},
  });
});

test('next means strictly after now, not the ongoing class or a previous weekly meeting', () => {
  assert.deepEqual(tuple('2026-11-16T00:59:59.999Z'), ['SAMP101', '2026-11-16', '09:00:00', 'Sample Room 101']);
  assert.deepEqual(tuple('2026-11-16T01:00:00Z'), ['SAMP102', '2026-11-18', '13:00:00', 'Sample Room 203']);
  assert.deepEqual(tuple('2026-11-16T01:30:00Z'), ['SAMP102', '2026-11-18', '13:00:00', 'Sample Room 203']);
  assert.deepEqual(tuple('2026-11-18T05:00:00Z'), ['SAMP103', '2026-11-20', '10:00:00', 'Sample Room 305']);
  assert.deepEqual(tuple('2026-11-20T03:31:00Z'), ['SAMP101', '2026-11-23', '09:00:00', 'Sample Room 101']);
});

test('Taipei date and equivalent offset instants do not depend on machine timezone', () => {
  const before = publishedSampleNextClass('2026-11-15T15:59:59.999Z');
  const after = publishedSampleNextClass('2026-11-16T00:00:00+08:00');
  assert.equal(before.campusDate, '2026-11-15');
  assert.equal(after.campusDate, '2026-11-16');
  assert.deepEqual(after, publishedSampleNextClass('2026-11-15T16:00:00Z'));
  assert.deepEqual(after, publishedSampleNextClass('2026-11-15T11:00:00-05:00'));
  assert.deepEqual(before.next, after.next);
});

test('term boundaries never invent meetings in the break or repeat the ended term', () => {
  assert.deepEqual(tuple('2026-09-06T15:59:59Z'), ['SAMP101', '2026-09-07', '09:00:00', 'Sample Room 101']);
  assert.deepEqual(tuple('2027-01-15T01:59:59.999Z'), ['SAMP103', '2027-01-15', '10:00:00', 'Sample Room 305']);
  assert.deepEqual(tuple('2027-01-15T02:00:00Z'), ['SAMP201', '2027-02-16', '14:00:00', 'Sample Lab 202']);
  assert.deepEqual(tuple('2027-02-15T00:00:00Z'), ['SAMP201', '2027-02-16', '14:00:00', 'Sample Lab 202']);
  assert.deepEqual(tuple('2027-06-22T05:59:59.999Z'), ['SAMP201', '2027-06-22', '14:00:00', 'Sample Lab 202']);
  assert.equal(tuple('2027-06-22T06:00:00Z'), null);
  assert.equal(tuple('2027-06-26T00:00:00Z'), null);
});

test('completed historical course never becomes a future enrolled meeting', () => {
  assert.deepEqual(tuple('2026-02-16T00:00:00Z'), ['SAMP101', '2026-09-07', '09:00:00', 'Sample Room 101']);
});

test('binding admits only literal Fall evaluation window, with explicit expiry', () => {
  const start = buildPublishedNextClassExpectation({now: '2026-09-06T16:00:00Z'});
  assert.equal(start.campusDate, '2026-09-07');
  assert.equal(start.validUntil, '2026-09-07T01:00:00.000Z');
  const last = buildPublishedNextClassExpectation({now: '2027-01-15T15:59:59.999Z'});
  assert.equal(last.next.code, 'SAMP201');
  assert.equal(last.validUntil, '2027-01-15T16:00:00.000Z');
  assert.equal(last.validUntilExclusive, true);
  rejects(() => buildPublishedNextClassExpectation({now: '2026-09-06T15:59:59.999Z'}), 'fixture-window-not-started');
  rejects(() => buildPublishedNextClassExpectation({now: '2027-01-15T16:00:00Z'}), 'fixture-window-expired');
});

test('before/after request proof rejects an occurrence crossed during the run without changing its golden', () => {
  const binding = buildPublishedNextClassExpectation({now: '2026-11-16T00:59:58Z'});
  assert.equal(assertPublishedNextClassClock(binding, {now: '2026-11-16T00:59:59.999Z'}).valid, true);
  rejects(() => assertPublishedNextClassClock(binding, {now: '2026-11-16T01:00:00Z'}), 'next-occurrence-changed');
  rejects(() => assertPublishedNextClassClock(binding, {now: '2026-11-16T00:59:57Z'}), 'clock-moved-backwards');
  assert.equal(binding.next.code, 'SAMP101');
  assert.equal(binding.asOf, '2026-11-16T00:59:58.000Z');
});

test('proof allows midnight only when the exact occurrence stays the same; expiry cannot be bypassed', () => {
  const midnight = buildPublishedNextClassExpectation({now: '2026-11-15T15:59:59Z'});
  const proof = assertPublishedNextClassClock(midnight, {now: '2026-11-15T16:00:01Z'});
  assert.equal(proof.campusDate, '2026-11-16');
  assert.equal(midnight.campusDate, '2026-11-15');
  const last = buildPublishedNextClassExpectation({now: '2027-01-15T15:59:59Z'});
  rejects(() => assertPublishedNextClassClock(last, {now: '2027-01-15T16:00:00Z'}), 'fixture-window-expired');
});

test('tampered expectations, additional fields and forged validity are rejected', () => {
  const original = buildPublishedNextClassExpectation({now: '2026-11-14T02:00:00Z'});
  for (const mutate of [value => {value.next.code = 'DB301';}, value => {value.next.room = 'Wrong room';},
    value => {value.validUntil = '2027-12-31T00:00:00Z';}, value => {value.validity.expiresExclusive = false;},
    value => {value.extra = 'not a binding field';}, value => {value.next = null;}]) {
    const invalid = structuredClone(original); mutate(invalid);
    rejects(() => assertPublishedNextClassClock(invalid, {now: original.asOf}), 'invalid-binding');
  }
  assert.equal(Object.isFrozen(original), true);
  assert.equal(Object.isFrozen(original.next), true);
  assert.equal(Object.isFrozen(original.validity), true);
  assert.equal(assertPublishedNextClassClock(structuredClone(original), {now: original.asOf}).valid, true);
});

test('invalid or ambiguous clocks cannot be silently normalized', () => {
  for (const now of [undefined, null, 0, new Date(), '', '2026-11-14', '2026-11-14T02:00:00',
    '2026-11-31T02:00:00Z', '2026-02-29T02:00:00Z', '2026-11-14T24:00:00Z', '2026-11-14T02:60:00Z',
    '2026-11-14T02:00:60Z', '2026-11-14T02:00:00+14:01', '2026-11-14T02:00:00+15:00',
    '2026-11-14T02:00:00.0000Z', '0000-11-14T02:00:00Z']) {
    rejects(() => publishedSampleNextClass(now), 'invalid-clock');
  }
});
