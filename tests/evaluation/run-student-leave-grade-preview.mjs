import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {runStudentLeaveHostedEvaluation} from './live-fixtures.mjs';
import {studentLeaveHostedGradeCompanionCaseIds} from './student-leave-hosted-observation.mjs';
import {isEvaluationPreviewOrigin} from './vercel-preview-transport.mjs';

const [origin, sourceRevision, ...extra] = process.argv.slice(2);
const caseIds = studentLeaveHostedGradeCompanionCaseIds();

if (origin === '--preflight' && sourceRevision === undefined) {
  console.log(JSON.stringify({caseIds, expectedExecution: 'live-native', expectedModelCalls: 0}));
} else {
  if (extra.length || !isEvaluationPreviewOrigin(origin) || !/^[a-f0-9]{40}$/u.test(sourceRevision ?? '')) {
    throw new Error('Supply the exact protected Preview origin and full source revision.');
  }

  const root = resolve('artifacts/assistant-evaluation');
  await mkdir(root, {recursive: true, mode: 0o700});
  const path = join(await mkdtemp(join(root, 'student-leave-grade-')), 'report.json');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);

  let report;
  try {
    report = await runStudentLeaveHostedEvaluation({
      origin,
      sourceRevision,
      previewToken: process.env.VERCEL_OIDC_TOKEN,
      caseIds,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6 * 60_000)]),
    });
  } catch (error) {
    const code = typeof error?.code === 'string' && /^fixture-[a-z-]{1,48}$/u.test(error.code)
      ? error.code
      : 'unexpected';
    report = {origin, sourceRevision, results: [], failure: code, cleanup: {verified: false}};
  } finally {
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
  }

  const passed = report.liveAcceptance === true
    && report.deployment?.status === 'finished'
    && report.completedNativeChecks === caseIds.length
    && report.completedModelCalls === 0
    && report.results.length === caseIds.length
    && report.results.every((row, index) => row.caseId === caseIds[index] && row.passed === true)
    && report.cleanup?.verified === true;

  await writeFile(path, JSON.stringify({...report, terminal: true, passed}, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
  console.log(JSON.stringify({path, passed, cases: report.results.length, cleanupVerified: report.cleanup?.verified === true,
    ...(report.failure ? {failure: report.failure} : {})}));
  if (!passed) process.exitCode = 1;
}
