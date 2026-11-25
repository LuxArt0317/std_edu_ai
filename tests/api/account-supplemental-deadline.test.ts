import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readSupplementalLookups} from '../../server/accountSupplementalLookup.js';
import {readCertificateEvidence} from '../../server/accountCertificateEvidence.js';
import {buildAccountFixture, EVAL_USER_ID} from '../evaluation/fixtures.mjs';

const account = {
  user: {id: EVAL_USER_ID},
  url: 'https://xiftudmvxphxcjtmfmib.supabase.co',
  token: 'synthetic-token',
  key: 'synthetic-key',
};
const request = {
  tools: ['enrollmentCertificate'],
  question: 'Show my enrollment certificate.',
  snapshot: buildAccountFixture(),
  deadline: 1050,
};

test('timer expiry is a deadline even if the wall clock reads earlier', async context => {
  context.mock.method(Date, 'now', () => 1000);
  context.mock.timers.enable({apis: ['setTimeout']});

  const pending = readSupplementalLookups({
    ...request,
    readers: {enrollmentCertificate: () => new Promise(() => {})},
  });
  context.mock.timers.tick(50);

  const [result] = await pending;
  assert.equal(result.reason, 'deadline_exceeded');
  assert.equal(result.readState, 'unavailable');
});

test('a shared timer expiry closes the queue of supplemental readers', async context => {
  context.mock.method(Date, 'now', () => 1000);
  context.mock.timers.enable({apis: ['setTimeout']});

  const tools = ['enrollmentCertificate', 'tuition', 'studentConduct'];
  const started: string[] = [];
  const pending = readSupplementalLookups({
    ...request,
    tools,
    readers: Object.fromEntries(tools.map(key => [key, () => {
      started.push(key);
      return new Promise(() => {});
    }])),
  });
  await Promise.resolve();
  assert.deepEqual(started, tools.slice(0, 2));

  context.mock.timers.tick(50);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, tools.slice(0, 2));
  assert.deepEqual((await pending).map(result => result.reason), tools.map(() => 'deadline_exceeded'));
});

test('a late successful read cannot claim an empty account record', async context => {
  let now = 1000;
  context.mock.method(Date, 'now', () => now);

  const [result] = await readSupplementalLookups({
    ...request,
    readers: {
      enrollmentCertificate: async () => {
        const evidence = await readCertificateEvidence(account, request, {
          load: async () => ({documents: [], assessments: []}),
        });
        assert.equal(evidence.readState, 'empty');
        now = request.deadline;
        return evidence;
      },
    },
  });

  assert.equal(result.reason, 'deadline_exceeded');
  assert.equal(result.readState, 'unavailable');
});
