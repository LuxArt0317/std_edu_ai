import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMoodleCalendar } from '../../src/features/public/dtm/calendarImport';

test('calendar import unfolds summaries, converts Taipei deadlines and skips private metadata and cancelled events', async () => {
  const data = [
    'BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:moodle-course-1@example.invalid',
    'DTSTART;TZID=Asia/Taipei:20261120T093000','SUMMARY:Design worksheet\\, part',
    '  two','DESCRIPTION:Private note','URL:https://dtm.stu.edu.tw/calendar/export_execute.php?authtoken=example',
    'END:VEVENT','BEGIN:VEVENT','UID:bad','DTSTART:20260230T090000Z','SUMMARY:Invalid day','END:VEVENT',
    'BEGIN:VEVENT','UID:cancelled','DTSTART:20261121T000000Z','STATUS:CANCELLED','SUMMARY:Cancelled item','END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const parsed = await parseMoodleCalendar(data);
  assert.equal(parsed.skipped, 2);
  assert.equal(parsed.events.length, 1);
  assert.equal(parsed.events[0].due_at, '2026-11-20T01:30:00.000Z');
  assert.equal(parsed.events[0].title, 'Design worksheet, part two');
  assert.match(parsed.events[0].import_key, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(JSON.stringify(parsed), /authtoken|Private note|example\.invalid/);
  assert.deepEqual(await parseMoodleCalendar(data), parsed);
});
