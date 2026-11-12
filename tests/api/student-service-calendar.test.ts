import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { test } from 'node:test';
import { answerDirectoryQuestion } from '../../server/schoolAffairsDirectory.js';
import {
  calendarPath, officialCalendarUrl, schoolServiceEntries, serviceDestination, studentServiceByKey,
} from '../../src/features/public/affairs/studentServices.js';

const calendar = schoolServiceEntries.find(entry => entry.id === '4-4');
type DocumentAsset = {file:string;checksum:string;bytes:number};

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

test('the calendar destination has six verified academic-year PDFs in the committed bundle', {timeout:180000}, async () => {
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
  const {documents,documentKey,sha} = await import(new URL('../../scripts/lib/school-document-bundle.mjs', import.meta.url).href) as {
    documents:()=>Promise<DocumentAsset[]>;
    documentKey:(documents:DocumentAsset[])=>string;
    sha:(bytes:Uint8Array)=>string;
  };
  const manifest = await documents();
  const calendarDocuments = pdfs.map(file => {
    const document = manifest.find(entry => entry.file === file);
    assert.ok(document, file + ' must be in the reviewed document manifest');
    return document;
  });
  const bundle = JSON.parse(await readFile('vendor/school-documents/manifest.json', 'utf8')) as {
    version:number;documents:number;documentKey:string;archiveBytes:number;archiveChecksum:string;
    parts:Array<{file:string;bytes:number;checksum:string}>;
  };
  assert.equal(bundle.version, 1);
  assert.equal(bundle.documents, manifest.length);
  assert.equal(bundle.documentKey, documentKey(manifest));
  assert.match(bundle.archiveChecksum, /^[a-f\d]{64}$/);
  assert.ok(Number.isSafeInteger(bundle.archiveBytes) && bundle.archiveBytes > 0);
  assert.ok(Array.isArray(bundle.parts) && bundle.parts.length > 0);
  // CI runs before prepare:school-assets. Stream verified committed parts into
  // tar and extract only these six files; do not create a second full archive
  // or extract the hundreds of unrelated documents into temporary storage.
  const temp = await mkdtemp(join(tmpdir(), 'stu-calendar-documents-'));
  const target = join(temp, 'documents');
  try {
    await mkdir(target);
    async function* archiveParts() {
      const checksum = createHash('sha256');
      let bytes = 0;
      for (const [index,part] of bundle.parts.entries()) {
        assert.equal(part.file, `part-${String(index).padStart(3, '0')}.bin`);
        assert.ok(Number.isSafeInteger(part.bytes) && part.bytes > 0 && part.bytes <= 32 * 1024 * 1024);
        assert.match(part.checksum, /^[a-f\d]{64}$/);
        const content = await readFile(join('vendor/school-documents', part.file));
        assert.equal(content.length, part.bytes, part.file + ' byte size');
        assert.equal(sha(content), part.checksum, part.file + ' checksum');
        checksum.update(content);bytes += content.length;
        yield content;
      }
      assert.equal(bytes, bundle.archiveBytes, 'Full document archive byte size');
      assert.equal(checksum.digest('hex'), bundle.archiveChecksum, 'Full document archive checksum');
    }
    const tar = spawn('tar', ['--no-same-owner', '--no-same-permissions', '-xzf', '-', '-C', target,
      '--', ...calendarDocuments.map(document => basename(document.file))],
    {stdio:['pipe','ignore','pipe'],timeout:120000,killSignal:'SIGKILL'});
    let stderr = '';
    tar.stderr.on('data', (chunk:Buffer) => {stderr += chunk.toString('utf8').slice(0, Math.max(0, 4000 - stderr.length));});
    const extracted = new Promise<void>((resolve,reject) => {
      tar.once('error', reject);
      tar.once('close', code => code === 0 ? resolve() : reject(new Error('Calendar bundle extraction failed: ' + stderr)));
    });
    const streamed = pipeline(Readable.from(archiveParts()), tar.stdin);
    try {await Promise.all([streamed,extracted]);}
    catch (error) {
      tar.kill('SIGKILL');
      await Promise.allSettled([streamed,extracted]);
      throw error;
    }
    for (const document of calendarDocuments) {
      const content = await readFile(join(target, basename(document.file)));
      assert.equal(content.length, document.bytes, document.file + ' must match its reviewed byte size');
      assert.equal(sha(content), document.checksum, document.file + ' must match its reviewed checksum');
      assert.equal(content.subarray(0, 5).toString('ascii'), '%PDF-', document.file + ' must contain a PDF');
    }
  } finally {
    await rm(temp, {recursive:true,force:true});
  }
});
