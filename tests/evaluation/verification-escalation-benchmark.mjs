import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { open, readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import captures from '../../src/features/public/mirror/pages.json' with { type: 'json' };
import { runAnswerVerification } from '../../server/answerVerification.js';
import { repairEvidenceAnswer, verifyEvidenceAnswer } from '../../server/answerVerificationModel.js';
import { readVerificationSources } from '../../server/answerVerificationSources.js';
import { gradeCase } from './grading.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const budgetMs = 32_000;
const baseline = 'gpt-5.6-terra';
const strongerModels = ['gpt-6.1-sol', 'gpt-5.6-sol'];
const operationNames = ['correct_grounded_answer', 'answer_evidence_review'];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const about = {
  id: 'about-stu',
  file: '/school-pages/0c1069db555be258e541.html',
  checksum: '35a83d1a73b6e64ad5b0046bff8b0cf80ff572cb79cd61e08f13a0a2b0143af9',
};
const sitemap = {
  id: 'campus-sitemap',
  file: '/school-pages/3be909d05cb9582ed6ae.html',
  checksum: 'd161ed6af97b6a2ce899ddb71c56984f6cbd3b90b0843065d3d5934a0ece0fd7',
};

async function readFrozenCapture({ id, file, checksum }) {
  const capture = captures.find(page => page.file === file);
  if (!capture || capture.checksum !== checksum || capture.capturedOn !== '2026-11-03')
    throw new Error('The pinned public evidence no longer matches its manifest.');
  const [evidence] = await readVerificationSources(
    [{ chunkId: id, url: capture.source, title: capture.title }],
    Date.now() + 5_000,
    {
      acquire: async () => { throw new Error('This comparison uses local capture bytes.'); },
      fetchCapture: async url => {
        if (url !== 'https://stu.best' + file) throw new Error('Unexpected capture request.');
        return new Response(await readFile(new URL('../../public' + file, import.meta.url)));
      },
    },
  );
  if (!evidence) throw new Error('The pinned capture could not be verified.');
  return evidence;
}

function makeCase(id, question, evidence, draft, feedback, expected, { missingStorage = false } = {}) {
  return {
    id, question, evidence, feedback, expected, missingStorage,
    candidate: { answer: draft, status: 'answered', citations: [], grounding: { source: 'web', webSearched: false } },
  };
}

export async function loadVerificationEscalationCases() {
  const [institution, directory] = await Promise.all([readFrozenCapture(about), readFrozenCapture(sitemap)]);
  const fictionalNotice = {
    id: 'fictional-room-notice',
    url: 'https://example.test/workshop-revision',
    title: 'Fictional Northbridge workshop notice',
    content: 'Fictional evaluation notice. The revised Northbridge workshop replaces the proposed 09:00 schedule. The confirmed workshop begins at 10:30 in Room B-214. The attendance deadline has not been announced.',
  };
  return [
    makeCase('escalation:synthetic-controlling-notice',
      'According to this fictional revision, what is the confirmed workshop time and room? Cite the revised notice.',
      [fictionalNotice], 'The workshop starts at 09:00 in Room A-110.',
      ['Use the confirmed time in the revised notice and cite the exact room.'],
      { behavior: 'answer', requiredText: ['10:30', 'B-214'], forbiddenText: ['A-110', '09:00'], requiredLinks: [fictionalNotice.url] }),
    makeCase('escalation:institutional-history',
      'In the supplied Shu-Te University About page, who are the three founders, which year was the school approved to recruit students, and on what date was the university formally renamed? Use the founders’ names as written in the source and write the dates in Gregorian ISO format.',
      [institution], 'Four founders started the university in 1996. The name changed in 2001.',
      ['Use the source’s exact list of founders. Keep recruitment approval separate from the date of the formal name change.'],
      {
        behavior: 'answer', requiredText: ['張佩玉', '嚴超', '李福芃', '1997', { anyOf: ['2000-08-01', 'August 1, 2000', '1 August 2000'] }],
        forbiddenText: ['1996', '2001'], requiredLinks: [institution.url], provenance: 'snapshot',
      }),
    makeCase('escalation:unknown-storage-quota',
      'What student OneDrive per-account quota and announcement date are established by the supplied campus sitemap snapshot? Say explicitly if either cannot be determined from that page.',
      [directory], 'The quota is 20 GB, announced March 1, 2026.',
      ['The campus sitemap names offices, but contains no announcement or numbers for OneDrive storage. State which requested details cannot be verified.'],
      {
        behavior: 'answer', requiredText: ['quota', 'date'],
        forbiddenText: ['20 GB', 'March 1, 2026'], requiredLinks: [directory.url], provenance: 'snapshot',
      }, { missingStorage: true }),
  ];
}

export function gradeVerificationEscalationCase(testCase, answer, elapsedMs) {
  const grade = gradeCase({
    id: testCase.id,
    expected: { ...testCase.expected, verification: 'verified', maxElapsedMs: budgetMs },
  }, {
    body: answer, events: answer.activity, execution: 'recorded', statusCode: 200, elapsedMs,
  });
  // The captured date can be stated as provenance. A newly asserted date or
  // numeric storage quantity cannot be inferred from a list of campus links.
  const content = answer.answer.normalize('NFKC').replace(/Source snapshot: 2026-11-03\.?/gi, '');
  const missingStorageStatement = !testCase.missingStorage
    || /\b(?:unavailable|unknown|no (?:storage|quota|announcement)|not (?:stated|shown|listed|given|specified|available|included|established|provided|recorded|mentioned)|(?:cannot|can.?t|could not|unable to) (?:be )?(?:determine|verify|confirm|establish)\w*|(?:does not|doesn.?t) (?:list|give|say|mention|contain|specify|include|establish|provide))\b/iu.test(content);
  const unexpectedStorageDetail = testCase.missingStorage && (
    /\b\d+(?:[.,]\d+)?\s*(?:(?:k|m|g|t|p)i?b|(?:kilo|mega|giga|tera|peta)bytes?)\b|\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/iu.test(content)
    || /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b/iu.test(content)
  );
  return {
    passed: grade.passed && missingStorageStatement && !unexpectedStorageDetail,
    failures: [...grade.failures.map(item => item.id),
      ...(!missingStorageStatement ? ['missingStorageLimitation'] : []),
      ...(unexpectedStorageDetail ? ['unsupportedStorageDetail'] : []),
    ],
    withheld: answer.status === 'abstained' && !answer.citations?.length,
  };
}

export async function runVerificationEscalationCase(testCase, {
  repair = repairEvidenceAnswer,
  verify = verifyEvidenceAnswer,
} = {}) {
  const { question, candidate, evidence, feedback } = structuredClone(testCase);
  const started = performance.now();
  const calls = [];
  let loads = 0;
  async function measure(operation, method, context) {
    const call = { operation, elapsedMs: null };
    calls.push(call);
    const dispatched = performance.now();
    try {
      return await method({ ...context, deeperReview: true });
    } finally {
      call.elapsedMs = Math.round(performance.now() - dispatched);
    }
  }
  const answer = await runAnswerVerification({
    question, initialAnswer: candidate, allowDeeperReview: true, deadline: Date.now() + budgetMs,
    loadEvidence: async () => {
      loads++;
      return evidence;
    },
    verify: context => context.attempt < 3
      ? { ok: false, reason: 'unsupported_claims', feedback }
      : measure('review', verify, context),
    repair: context => context.attempt < 3
      ? candidate
      : measure('repair', repair, context),
  });
  const elapsedMs = Math.round(performance.now() - started);
  if (loads !== 2) throw new Error('Frozen evidence was not used on both prelude checks.');
  return {
    inputSha256: hash({ question, candidate, evidence, feedback }),
    elapsedMs, calls, answer, grade: gradeVerificationEscalationCase(testCase, answer, elapsedMs),
  };
}

export async function evaluateLiveArm(testCase, model) {
  if (model !== baseline && !strongerModels.includes(model)) throw new Error('Unsupported comparison model.');
  const originalFetch = globalThis.fetch;
  const originalModel = process.env.OPENAI_VERIFICATION_ESCALATION_MODEL;
  const provider = [];
  process.env.OPENAI_VERIFICATION_ESCALATION_MODEL = model;
  // CLI arms run serially. Allow only the actual verifier transport, then
  // keep request/response metadata without printing headers or raw payloads.
  globalThis.fetch = async (input, init) => {
    const body = JSON.parse(init?.body ?? 'null');
    if (input !== 'https://api.openai.com/v1/responses' || init?.method !== 'POST'
      || body?.model !== model || body.reasoning?.effort !== 'medium' || body.store !== false
      || body.text?.format?.name !== operationNames[provider.length] || !body.text.format.strict
      || body.tools !== undefined) throw new Error('Unexpected verification benchmark provider request.');
    const { model: requestedModel, ...pairedFields } = body;
    const entry = { requestedModel, operation: body.text.format.name, inputSha256: hash(pairedFields), status: null };
    provider.push(entry);
    const response = await originalFetch(input, { ...init, redirect: 'error' });
    const payload = await response.clone().json().catch(() => null);
    entry.status = response.status;
    entry.resolvedModel = typeof payload?.model === 'string' ? payload.model : null;
    entry.inputTokens = Number.isSafeInteger(payload?.usage?.input_tokens) ? payload.usage.input_tokens : null;
    entry.outputTokens = Number.isSafeInteger(payload?.usage?.output_tokens) ? payload.usage.output_tokens : null;
    return response;
  };
  try {
    return { model, ...await runVerificationEscalationCase(testCase), provider };
  } finally {
    globalThis.fetch = originalFetch;
    if (originalModel === undefined) delete process.env.OPENAI_VERIFICATION_ESCALATION_MODEL;
    else process.env.OPENAI_VERIFICATION_ESCALATION_MODEL = originalModel;
  }
}

async function main() {
  const { values } = parseArgs({ options: {
    live: { type: 'boolean' }, revision: { type: 'string' }, report: { type: 'string' },
    stronger: { type: 'string', default: strongerModels[0] }, repeats: { type: 'string', default: '1' },
  } });
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const repeats = Number(values.repeats);
  if (!values.live || !process.env.OPENAI_API_KEY || !values.report
    || !/^[a-f0-9]{40}$/u.test(values.revision ?? '') || values.revision !== git(['rev-parse', 'HEAD'])
    || git(['status', '--porcelain', '--untracked-files=all']) || !strongerModels.includes(values.stronger)
    || !Number.isInteger(repeats) || repeats < 1 || repeats > 3)
    throw new Error('Pass --live, a clean exact --revision, a new --report path and an authorized process-provided API key. Allowed repeats are 1–3.');
  const cases = await loadVerificationEscalationCases();
  const handle = await open(values.report, 'wx', 0o600);
  try {
    const pairs = [];
    for (let repeat = 0; repeat < repeats; repeat++) {
      for (const [index, testCase] of cases.entries()) {
        const models = (repeat + index) % 2 ? [values.stronger, baseline] : [baseline, values.stronger];
        const arms = [];
        for (const model of models) arms.push(await evaluateLiveArm(testCase, model));
        const [left, right] = arms;
        pairs.push({ caseId: testCase.id, repeat: repeat + 1, arms,
          sameRepairRequest: left.provider[0]?.inputSha256 !== undefined
            && left.provider[0].inputSha256 === right.provider[0]?.inputSha256,
        });
      }
    }
    const report = { version: 1, revision: values.revision, budgetMs, effort: 'medium',
      scope: 'Only third-stage repair and verification. The first two reviews and source acquisition are controlled.',
      pairs,
    };
    await handle.writeFile(JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ pairs: pairs.length, report: values.report }));
  } finally {
    await handle.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch(error => {
    console.error(error instanceof Error ? error.message : 'Verification benchmark failed.');
    process.exitCode = 1;
  });
}
