import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import {
  admitPreviewBenchmark,
  issuePreviewBenchmarkPermit,
  runPreviewBuildBenchmark,
} from './verification-escalation-preview-build.mjs';

const began = Date.UTC(2026, 10, 15);
const revision = '2173ea0f04d5f37e690f01bfa5756f848b50ee62';
const projectId = 'prj_testOperatorBinding';
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const authority = {
  branch: 'codex/dedicated-test-operator',
  publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'),
};
const signed = issuePreviewBenchmarkPermit({ projectId, revision, privateKey, now: began, authority });
const base = {
  VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'preview',
  VERCEL_PROJECT_ID: projectId, VERCEL_PROJECT_NAME: 'std_edu_ai',
  VERCEL_GIT_PROVIDER: 'github', VERCEL_GIT_REPO_OWNER: 'LuxArt0317', VERCEL_GIT_REPO_SLUG: 'std_edu_ai',
  VERCEL_GIT_COMMIT_SHA: revision, VERCEL_GIT_COMMIT_REF: authority.branch,
  VERCEL_URL: 'stdedu-abc123def-v1-d286.vercel.app', VERCEL_DEPLOYMENT_ID: 'dpl_pinned',
  STU_VERIFICATION_BENCHMARK_PERMIT: signed,
  OPENAI_API_KEY: 'private-unprinted-fixture',
};

test('only the dedicated Git Preview build can evaluate or require a permit', async () => {
  const skipped = [
    { VERCEL_ENV: 'production', VERCEL_TARGET_ENV: 'production' },
    { VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'production' },
    { VERCEL_ENV: 'development' },
    { VERCEL_TARGET_ENV: 'staging' },
    { VERCEL_GIT_COMMIT_REF: 'main' },
    { VERCEL: '' },
  ];
  for (const environment of skipped) {
    const result = await runPreviewBuildBenchmark({
      authority, now: () => began, env: { ...base, ...environment },
      evaluate: () => assert.fail('unexpected provider call'),
      log: () => assert.fail('unexpected operator log'),
    });
    assert.equal(result, null);
  }
});

test('rejects missing, altered, expired or mismatched permits before contacting the provider', async () => {
  const [payload, signature] = signed.split('.');
  const changed = (signature[0] === 'a' ? 'b' : 'a') + signature.slice(1);
  const mismatches = [
    { STU_VERIFICATION_BENCHMARK_PERMIT: undefined },
    { STU_VERIFICATION_BENCHMARK_PERMIT: payload + '.' + changed },
    { VERCEL_PROJECT_ID: 'prj_foreign' },
    { VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40) },
    { VERCEL_GIT_PROVIDER: 'gitlab' },
    { VERCEL_GIT_REPO_OWNER: 'foreign' },
    { VERCEL_URL: 'attacker.vercel.app' },
    { VERCEL_DEPLOYMENT_ID: 'missing' },
  ];
  for (const values of mismatches) {
    await assert.rejects(runPreviewBuildBenchmark({
      env: { ...base, ...values }, now: () => began, authority,
      evaluate: () => assert.fail('unexpected provider call'),
    }), /benchmark|deployment/iu);
  }
  await assert.rejects(runPreviewBuildBenchmark({
    env: { ...base, OPENAI_API_KEY: undefined }, now: () => began, authority,
    evaluate: () => assert.fail('unexpected provider call'),
  }), /managed verification credential/u);
  assert.throws(() => admitPreviewBenchmark(base, began - 1, authority), /expired or outside/u);
  assert.throws(() => admitPreviewBenchmark(base, began + (12 * 60 * 1000), authority), /expired or outside/u);
  assert.equal(admitPreviewBenchmark(base, began, authority).revision, revision);
  assert.throws(() => issuePreviewBenchmarkPermit({
    projectId, revision, privateKey: generateKeyPairSync('ed25519').privateKey, now: began, authority,
  }), /does not match/u);
});

test('compares exactly three frozen public cases with two model arms and logs measured facts only', async () => {
  const seen = [];
  const logs = [];
  const programOption = 'please-run-unreviewed-prompt';
  const unknownProviderData = 'never-log-provider-body';
  const result = await runPreviewBuildBenchmark({
    env: { ...base, UNREVIEWED_BENCHMARK_INPUT: programOption },
    now: () => began, authority, log: line => logs.push(line),
    evaluate(testCase, model) {
      seen.push({ caseId: testCase.id, model });
      const { id: chunkId, url } = testCase.evidence[0];
      const first = seen.length === 1;
      return {
        elapsedMs: 10_000, calls: [{ operation: 'repair', elapsedMs: 4_800 }, { operation: 'review', elapsedMs: 5_100 }],
        grade: { passed: !first, failures: first ? ['text.required.0'] : [] },
        answer: { answer: unknownProviderData, citations: [{ chunkId, url }], verification: { attempts: 3, status: 'verified' } },
        provider: [{ operation: 'correct_grounded_answer', inputSha256: 'a'.repeat(64), status: 200,
          resolvedModel: model + '-2026-11-01', inputTokens: 1000, outputTokens: 100 }],
      };
    },
  });
  assert.deepEqual(seen, [
    { caseId: 'escalation:synthetic-controlling-notice', model: 'gpt-5.6-terra' },
    { caseId: 'escalation:synthetic-controlling-notice', model: 'gpt-6.1-sol' },
    { caseId: 'escalation:institutional-history', model: 'gpt-6.1-sol' },
    { caseId: 'escalation:institutional-history', model: 'gpt-5.6-terra' },
    { caseId: 'escalation:unknown-storage-quota', model: 'gpt-5.6-terra' },
    { caseId: 'escalation:unknown-storage-quota', model: 'gpt-6.1-sol' },
  ]);
  assert.equal(result.complete, true);
  assert.equal(result.effort, 'medium');
  assert.equal(result.perArmBudgetMs, 32_000);
  assert.equal(result.pairs.length, 3);
  assert.ok(result.pairs.every(pair => pair.sameRepairRequest));
  const [first] = result.pairs[0].arms;
  assert.equal(first.remainingBudgetMs, 22_000);
  assert.equal(first.provider[0].resolvedModel, 'gpt-5.6-terra-2026-11-01');
  assert.deepEqual(first.requiredFacts[0], { terms: ['10:30'], found: false });
  assert.deepEqual(first.citedSourceIds, ['fictional-room-notice']);
  assert.match(result.digest, /^[0-9a-f]{64}$/u);
  assert.equal(logs.filter(line => line.startsWith('STU_VERIFICATION_BENCHMARK_ARM ')).length, 6);
  assert.equal(logs.filter(line => line.startsWith('STU_VERIFICATION_BENCHMARK_PAIR ')).length, 3);
  assert.ok(logs.at(-1).startsWith('STU_VERIFICATION_BENCHMARK_END '));
  for (const value of [programOption, unknownProviderData, base.OPENAI_API_KEY, signed]) {
    assert.ok(!logs.some(line => line.includes(value)));
  }
});

test('starts no new model arm when the authorized window cannot cover that arm', async () => {
  const logs = [];
  const time = began + 12 * 60 * 1000 - 31_999;
  const result = await runPreviewBuildBenchmark({
    env: base, now: () => time, authority,
    evaluate: () => assert.fail('unexpected provider call'),
    log: line => logs.push(line),
  });
  assert.equal(result.complete, false);
  assert.deepEqual(result.pairs, []);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /permit_limit/u);
});
