import { createHash, createPrivateKey, createPublicKey, randomUUID, sign, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import buildAuthority from './verification-escalation-preview-authority.json' with { type: 'json' };
import { isEvaluationPreviewOrigin } from './vercel-preview-transport.mjs';
import { budgetMs, evaluateLiveArm, loadVerificationEscalationCases } from './verification-escalation-benchmark.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const projectName = 'std_edu_ai';
const repositoryOwner = 'luxart0317';
const models = ['gpt-5.6-terra', 'gpt-6.1-sol'];
const purpose = 'stu-verification-escalation';
const lifetimeSeconds = 12 * 60;
const permitVariable = 'STU_VERIFICATION_BENCHMARK_PERMIT';
const rev = /^[a-f0-9]{40}$/u;
const project = /^prj_[a-z0-9]+$/iu;
const run = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const b64url = /^[A-Za-z0-9_-]+$/u;
const sha256 = /^[a-f0-9]{64}$/u;
const permitKeys = ['branch', 'expiresAt', 'issuedAt', 'projectId', 'purpose', 'revision', 'runId', 'version'].join(',');
const safeCount = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const safeHash = value => typeof value === 'string' && sha256.test(value) ? value : null;
const same = (value, pattern) => typeof value === 'string' && pattern.test(value);

function validateBinding(projectId, revision) {
  if (!same(projectId, project) || !same(revision, rev)) throw new Error('An exact client project ID and full Git revision are required.');
}

export function issuePreviewBenchmarkPermit({ projectId, revision, privateKey, now = Date.now(), authority = buildAuthority }) {
  validateBinding(projectId, revision);
  if (createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).toString('base64url') !== authority.publicKey
    || !Number.isSafeInteger(now) || now <= 0) throw new Error('The supplied signing key does not match this Preview build authority.');
  const issuedAt = Math.floor(now / 1000);
  const payload = Buffer.from(JSON.stringify({
    version: 1, purpose, projectId, branch: authority.branch, revision, runId: randomUUID(),
    issuedAt, expiresAt: issuedAt + lifetimeSeconds,
  }));
  return payload.toString('base64url') + '.' + sign(null, payload, privateKey).toString('base64url');
}

/** Builds without this dedicated Preview ref take the regular build path. */
export function admitPreviewBenchmark(env, now = Date.now(), authority = buildAuthority) {
  if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'preview' || env.VERCEL_TARGET_ENV !== 'preview'
    || env.VERCEL_GIT_COMMIT_REF !== authority.branch) return null;
  const { VERCEL_PROJECT_ID: projectId, VERCEL_GIT_COMMIT_SHA: revision } = env;
  validateBinding(projectId, revision);
  if (env.VERCEL_PROJECT_NAME !== projectName || env.VERCEL_GIT_PROVIDER !== 'github'
    || env.VERCEL_GIT_REPO_SLUG !== projectName || env.VERCEL_GIT_REPO_OWNER?.toLowerCase() !== repositoryOwner
    || (env.VERCEL_URL && !isEvaluationPreviewOrigin('https://' + env.VERCEL_URL))
    || !same(env.VERCEL_DEPLOYMENT_ID, /^dpl_[a-z0-9]+$/iu))
    throw new Error('The benchmark requires the client Git Preview deployment.');

  const raw = env[permitVariable];
  if (typeof raw !== 'string' || raw.length > 1200) throw new Error('A signed benchmark permit is required.');
  const parts = raw.trim().split('.');
  if (parts.length !== 2 || parts.some(value => !b64url.test(value))) throw new Error('The benchmark permit is invalid.');
  const bytes = Buffer.from(parts[0], 'base64url');
  const signature = Buffer.from(parts[1], 'base64url');
  const publicKey = createPublicKey({ key: Buffer.from(authority.publicKey, 'base64url'), format: 'der', type: 'spki' });
  if (signature.length !== 64 || !verify(null, bytes, publicKey, signature)) throw new Error('The benchmark permit is invalid.');

  let permit;
  try { permit = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('The benchmark permit is invalid.'); }
  const seconds = Math.floor(now / 1000);
  if (!permit || Object.keys(permit).sort().join(',') !== permitKeys || permit.version !== 1 || permit.purpose !== purpose
    || permit.branch !== authority.branch || permit.projectId !== projectId || permit.revision !== revision
    || !same(permit.runId, run) || !Number.isSafeInteger(permit.issuedAt) || !Number.isSafeInteger(permit.expiresAt)
    || permit.expiresAt - permit.issuedAt !== lifetimeSeconds || !Number.isSafeInteger(seconds)
    || seconds < permit.issuedAt || seconds >= permit.expiresAt)
    throw new Error('The benchmark permit is expired or outside its deployment scope.');
  return Object.freeze(permit);
}

function makeArmRecord(testCase, model, arm) {
  const elapsedMs = safeCount(arm.elapsedMs);
  const citations = Array.isArray(arm.answer?.citations) ? arm.answer.citations : [];
  const verifiedSources = testCase.evidence.filter(evidence =>
    citations.some(citation => citation.chunkId === evidence.id && citation.url === evidence.url)).map(evidence => evidence.id);
  const failedChecks = [...new Set((arm.grade?.failures ?? []).filter(value => same(value, /^[a-z0-9_.-]{1,100}$/iu)))].slice(0, 20);
  const expected = testCase.expected.requiredText.map((required, index) => ({
    terms: typeof required === 'string' ? [required] : required.anyOf,
    found: !!arm.grade && !failedChecks.includes(`text.required.${index}`),
  }));
  // The report contains only fixed evidence labels, measured values and
  // verdicts. It carries no arbitrary model text, payloads or headers.
  return {
    model, elapsedMs, remainingBudgetMs: elapsedMs === null ? null : Math.max(0, budgetMs - elapsedMs),
    factualRubricPassed: arm.grade?.passed === true, withheld: arm.grade?.withheld === true,
    failedChecks,
    requiredFacts: expected, citedSourceIds: verifiedSources, unexpectedCitations: citations.length - verifiedSources.length,
    outcomes: (arm.calls ?? []).slice(0, 2).map(call => ({ operation: call.operation === 'review' ? 'review' : 'repair', elapsedMs: safeCount(call.elapsedMs) })),
    verification: { status: ['verified', 'unverified'].includes(arm.answer?.verification?.status) ? arm.answer.verification.status : null,
      attempts: safeCount(arm.answer?.verification?.attempts) },
    provider: (arm.provider ?? []).slice(0, 2).map(entry => ({
      operation: entry.operation === 'answer_evidence_review' ? 'answer_evidence_review' : 'correct_grounded_answer',
      inputSha256: safeHash(entry.inputSha256), status: safeCount(entry.status),
      resolvedModel: same(entry.resolvedModel, /^gpt-(?:5\.6-terra|6\.1-sol)(?:-\d{4}-\d{2}-\d{2})?$/u) ? entry.resolvedModel : null,
      inputTokens: safeCount(entry.inputTokens), outputTokens: safeCount(entry.outputTokens),
    })),
  };
}

/** This entry runs only as a serial build task and has no HTTP interface. */
export async function runPreviewBuildBenchmark({
  env = process.env, now = Date.now, evaluate = evaluateLiveArm, log = console.log, authority = buildAuthority,
} = {}) {
  const permit = admitPreviewBenchmark(env, now(), authority);
  if (!permit) return null;
  if (!env.OPENAI_API_KEY) throw new Error('The approved Preview build lacks its managed verification credential.');
  const cases = await loadVerificationEscalationCases();
  const binding = { release: permit.revision, runId: permit.runId, deploymentId: env.VERCEL_DEPLOYMENT_ID,
    origin: env.VERCEL_URL ? 'https://' + env.VERCEL_URL : null, effort: 'medium', perArmBudgetMs: budgetMs };
  const pairs = [];
  for (const [index, testCase] of cases.entries()) {
    const order = index % 2 ? [...models].reverse() : models;
    const arms = [];
    for (const model of order) {
      if (permit.expiresAt * 1000 - now() < budgetMs) {
        log('STU_VERIFICATION_BENCHMARK_END ' + JSON.stringify({ ...binding, pairs: pairs.length, complete: false, reason: 'permit_limit' }));
        return { ...binding, pairs, complete: false };
      }
      const arm = makeArmRecord(testCase, model, await evaluate(testCase, model));
      arms.push(arm);
      log('STU_VERIFICATION_BENCHMARK_ARM ' + JSON.stringify({ ...binding, caseId: testCase.id, ...arm }));
    }
    const matched = arms[0].provider[0]?.inputSha256;
    const pair = { caseId: testCase.id, arms, sameRepairRequest: !!matched && matched === arms[1].provider[0]?.inputSha256 };
    pairs.push(pair);
    log('STU_VERIFICATION_BENCHMARK_PAIR ' + JSON.stringify({ ...binding, ...pair }));
  }
  const digest = createHash('sha256').update(JSON.stringify(pairs)).digest('hex');
  log('STU_VERIFICATION_BENCHMARK_END ' + JSON.stringify({ ...binding, pairs: pairs.length, complete: true, digest }));
  return { ...binding, pairs, complete: true, digest };
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    const result = await runPreviewBuildBenchmark();
    if (result && !result.complete) process.exitCode = 1;
    return;
  }
  const { values } = parseArgs({ args, options: {
    sign: { type: 'boolean' }, 'project-id': { type: 'string' }, revision: { type: 'string' },
    'private-key': { type: 'string' }, output: { type: 'string' },
  } });
  const git = params => execFileSync('git', params, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (!values.sign || !values.output || !values['private-key'] || values.revision !== git(['rev-parse', 'HEAD'])
    || git(['status', '--porcelain', '--untracked-files=all']))
    throw new Error('Signing requires the exact clean candidate Git checkout, a private signing key and a new output file.');
  const metadata = await lstat(values['private-key']);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.uid !== process.getuid() || (metadata.mode & 0o077))
    throw new Error('The signing key must be an owner-only regular file.');
  const privateKey = createPrivateKey(await readFile(values['private-key']));
  const permit = issuePreviewBenchmarkPermit({ projectId: values['project-id'], revision: values.revision, privateKey });
  await writeFile(values.output, permit, { flag: 'wx', mode: 0o600 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch(() => {
    console.error('The Preview verification benchmark did not complete. Check the build target, signing permit and managed credential.');
    process.exitCode = 1;
  });
}
