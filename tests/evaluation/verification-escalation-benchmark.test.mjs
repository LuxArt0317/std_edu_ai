import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateLiveArm, gradeVerificationEscalationCase, loadVerificationEscalationCases, runVerificationEscalationCase,
} from './verification-escalation-benchmark.mjs';

const providerResult = (value, model) => Response.json({
  model, status: 'completed', usage: { input_tokens: 1200, output_tokens: 67 },
  output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
});
const verifiedActivity = [
  { kind: 'verification-deeper-review', status: 'complete' },
  { kind: 'verification-3', status: 'complete' },
];

test('frozen public evidence comes from two exact manifested captures and no network', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('Capture loading must stay offline.'));
  const cases = await loadVerificationEscalationCases();
  assert.equal(cases.length, 3);
  const [fictional, institutional, absent] = cases;
  assert.match(fictional.evidence[0].title, /Fictional/u);
  assert.equal(institutional.evidence[0].capturedOn, '2026-11-03');
  const content = JSON.parse(institutional.evidence[0].content).content;
  assert.match(content, /張佩玉、嚴超、李福芃/u);
  assert.match(content, /民國86年奉准設校招生/u);
  assert.match(content, /民國89年8月1日起/u);
  assert.doesNotMatch(JSON.parse(absent.evidence[0].content).content, /OneDrive/iu);
});

test('both models receive the same production repair payload and execute the medium third-stage adapters', async t => {
  const [testCase] = await loadVerificationEscalationCases();
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'mock-provider-only';
  t.after(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(init.redirect, 'error');
    const request = JSON.parse(init.body);
    requests.push(request);
    const name = request.text.format.name;
    const inputs = JSON.parse(request.input[0].content[0].text);
    assert.deepEqual(inputs.evidence, testCase.evidence);
    assert.equal(inputs.question, testCase.question);
    assert.equal(request.reasoning.effort, 'medium');
    if (name === 'correct_grounded_answer') {
      assert.equal(request.max_output_tokens, 4096);
      return providerResult({
        status: 'answered', answer: 'The workshop starts at 10:30 in Room B-214.',
        sourceIds: [testCase.evidence[0].id],
      }, request.model);
    }
    assert.equal(name, 'answer_evidence_review');
    assert.equal(request.max_output_tokens, 8192);
    return providerResult({
      supported: true, answersQuestion: true, claims: [{
        supported: true, claim: 'The workshop time and room',
        evidenceId: testCase.evidence[0].id, jsonPaths: [],
        quotes: ['The confirmed workshop begins at 10:30 in Room B-214.'],
      }],
    }, request.model);
  });
  const terra = await evaluateLiveArm(testCase, 'gpt-5.6-terra');
  const sol = await evaluateLiveArm(testCase, 'gpt-6.1-sol');
  assert.deepEqual(requests.map(request => request.model), ['gpt-5.6-terra', 'gpt-5.6-terra', 'gpt-6.1-sol', 'gpt-6.1-sol']);
  assert.equal(terra.provider[0].inputSha256, sol.provider[0].inputSha256);
  assert.equal(terra.inputSha256, sol.inputSha256);
  for (const arm of [terra, sol]) {
    assert.deepEqual(arm.calls.map(call => call.operation), ['repair', 'review']);
    assert.ok(arm.calls.every(call => Number.isFinite(call.elapsedMs)));
    assert.deepEqual(arm.answer.verification, { status: 'verified', attempts: 3 });
    assert.equal(arm.grade.passed, true, arm.grade.failures.join(','));
    assert.equal(arm.provider[1].resolvedModel, arm.model);
    assert.equal(arm.provider[1].outputTokens, 67);
  }
});

test('third-stage rejection withholds the corrupt answer and records a quality failure', async () => {
  const [, testCase] = await loadVerificationEscalationCases();
  const result = await runVerificationEscalationCase(testCase, {
    repair: async context => ({ ...context.candidate, answer: 'Wrong draft survives repair.' }),
    verify: async () => ({ ok: false, reason: 'unsupported_claims' }),
  });
  assert.equal(result.answer.verification.attempts, 3);
  assert.equal(result.answer.status, 'abstained');
  assert.doesNotMatch(result.answer.answer, /Wrong draft/u);
  assert.equal(result.grade.passed, false);
  assert.equal(result.grade.withheld, true);
});

test('factual and missing-data scoring stays independent of the verification verdict', async () => {
  const [, positive, missing] = await loadVerificationEscalationCases();
  function checked(testCase, answer) {
    return {
      status: 'answered', answer: answer + '\n\nSource snapshot: 2026-11-03.',
      citations: [{ chunkId: testCase.evidence[0].id, url: testCase.evidence[0].url }],
      activity: verifiedActivity, verification: { status: 'verified', attempts: 3 },
    };
  }
  const facts = 'The founders were 張佩玉、嚴超、李福芃. Recruitment was approved in 1997. The formal renaming was on 2000-08-01.';
  assert.equal(gradeVerificationEscalationCase(positive, checked(positive, facts), 100).passed, true);
  assert.equal(gradeVerificationEscalationCase(positive, checked(positive, facts.replace('1997', '1996')), 100).passed, false);
  const limitation = 'The student storage quota and announcement date cannot be determined from this snapshot.';
  assert.equal(gradeVerificationEscalationCase(missing, checked(missing, limitation), 100).passed, true);
  for (const unsupported of ['The quota is 128 GB.', 'It was announced on 2025-04-15.', 'It was posted July 4.']) {
    assert.equal(gradeVerificationEscalationCase(missing, checked(missing, limitation + ' ' + unsupported), 100).passed, false);
  }
});


test('the missing quota rubric accepts only the isolated capture date of the cited pinned sitemap', async () => {
  const [, , missing] = await loadVerificationEscalationCases();
  const limitation = 'The student quota and announcement date cannot be determined from this snapshot.';
  const answerFor = (testCase, answer, citations = [{ chunkId: testCase.evidence[0].id, url: testCase.evidence[0].url }]) => ({
    answer, status: 'answered', citations, activity: verifiedActivity, verification: { status: 'verified', attempts: 3 },
  });
  for (const provenance of [
    'The campus sitemap snapshot was captured on 2026-11-03.',
    'The snapshot was captured on November 3, 2026.',
    'The source snapshot was taken on 3 Nov. 2026.',
    'The campus sitemap was last captured on 2026/11/03.',
    '- **Source snapshot:** `2026-11-03`',
    '(sitemap snapshot dated November 3, 2026)',
  ]) {
    assert.equal(gradeVerificationEscalationCase(missing, answerFor(missing, limitation + '\n' + provenance), 100).passed, true, provenance);
  }

  const changedCapture = { ...missing, evidence: [{ ...missing.evidence[0], capturedOn: '2026-11-04' }] };
  assert.equal(gradeVerificationEscalationCase(changedCapture, answerFor(changedCapture, limitation + ' Snapshot dated 4 November 2026.'), 100).passed, true);
  const falseCitation = [{ chunkId: 'other-snapshot', url: missing.evidence[0].url }];
  assert.ok(gradeVerificationEscalationCase(missing, answerFor(missing, limitation + ' Source snapshot: 2026-11-03.', falseCitation), 100)
    .failures.includes('unsupportedStorageDetail'));
});

test('the capture-date allowance preserves mixed, status and glued unsupported claims', async () => {
  const [, , missing] = await loadVerificationEscalationCases();
  const limitation = 'The student quota and announcement date cannot be determined from this snapshot.';
  const date = '2026-11-03';
  for (const claim of [
    'The snapshot was captured on November 4, 2026.',
    `The announcement was posted on ${date}.`,
    'The announcement was posted on 3 November 2026.',
    `Source snapshot: ${date}. The announcement was posted on ${date}.`,
    `Source snapshot: ${date}. The quota is 128 GB.`,
    `Announcement status: Published (snapshot captured on ${date}).`,
    `Source snapshot: ${date}. The announcement was officially published.`,
    `Announcement date:\nSnapshot: ${date}.`,
    `The announcement date is (snapshot captured on ${date}).`,
    `Publication date: (source snapshot: ${date}).`,
    `The announcement and source snapshot: ${date}.`,
    `The campus sitemap snapshot was captured on ${date} and is the announcement date.`,
    `Source snapshot: ${date}and the quota announcement appeared.`,
    `Source snapshot: ${date}.The announcement was published.`,
  ]) {
    const grade = gradeVerificationEscalationCase(missing, {
      answer: limitation + '\n\n' + claim, status: 'answered',
      citations: [{ chunkId: missing.evidence[0].id, url: missing.evidence[0].url }],
      activity: verifiedActivity, verification: { status: 'verified', attempts: 3 },
    }, 100);
    assert.equal(grade.passed, false, claim);
    assert.ok(grade.failures.includes('unsupportedStorageDetail'), claim);
  }
});
