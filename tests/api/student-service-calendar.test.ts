import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { answerDirectoryQuestion } from '../../server/schoolAffairsDirectory.js';
import {
  calendarPath, officialCalendarUrl, schoolServiceEntries, serviceDestination, studentServiceByKey,
} from '../../src/features/public/affairs/studentServices.js';

const calendar = schoolServiceEntries.find(entry => entry.id === '4-4');

test('the School Affairs calendar opens the captured calendar instead of a tracking service', () => {
  assert.ok(calendar);
  assert.equal(calendar.localUrl, calendarPath);
  assert.equal(studentServiceByKey('4-4'), undefined);
  const answer = answerDirectoryQuestion('Where is the academic calendar?');
  assert.ok(answer?.answer.includes(`](${calendarPath})`));
  assert.equal(answer?.citations[0].locator, calendarPath);
});

test('calendar routing preserves query parameters and anchors while matching only the observed source', () => {
  assert.ok(calendar);
  for (const sourcePath of [
    officialCalendarUrl,
    officialCalendarUrl.replace(/%[\dA-F]{2}/g, value => value.toLowerCase()),
    decodeURI(officialCalendarUrl).replace(/\/$/, ''),
  ]) {
    assert.equal(serviceDestination({...calendar, sourcePath: sourcePath + '?lang=en&year=115#student-calendar'}),
      calendarPath + '?lang=en&year=115#student-calendar');
  }
  assert.equal(serviceDestination({...calendar, sourcePath: 'https://www.aca.stu.edu.tw/another-calendar/'}),
    '/school-affairs/services/4-4');
  assert.equal(serviceDestination({...calendar, sourcePath: officialCalendarUrl.replace('www.aca.', 'other.')}),
    '/school-affairs/services/4-4');
});

test('the calendar destination is a real captured page with six locally available academic-year PDFs', () => {
  const pages = JSON.parse(readFileSync('src/features/public/mirror/pages.json', 'utf8')) as Array<{
    route: string; source: string; file: string;
  }>;
  const page = pages.find(entry => entry.route === calendarPath);
  assert.ok(page, 'Calendar must be present in the direct-page manifest');
  assert.equal(page.source, officialCalendarUrl);
  const html = readFileSync('public' + page.file, 'utf8');
  assert.match(html, /115學年度行事曆\(學生\)_1150415/);
  assert.match(html, /114學年度行事曆\(學生\)_1140618/);
  assert.doesNotMatch(html, /student-service-form|Track your next steps here/);
  const pdfs = [...new Set([...html.matchAll(/href="(\/school-assets\/[a-f\d]+\.pdf)"/g)].map(match => match[1]))];
  assert.equal(pdfs.length, 6);
  for (const pdf of pdfs) {
    const content = readFileSync('public' + pdf);
    assert.equal(content.subarray(0, 5).toString('ascii'), '%PDF-', pdf + ' must contain a PDF');
  }
});
