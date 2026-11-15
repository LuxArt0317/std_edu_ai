import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { maxAnswerVerificationChecks } from '../src/services/assistantVerificationLimits.js';

const VerificationState = Annotation.Root({
  attempt: Annotation(), verdict: Annotation(), previousFailure: Annotation(),
});
const standardChecks = 2;
const deeperReviewBudgetMs = 18_000;
const deeperReviewReasons = new Set(['unsupported_claims', 'no_supported_answer', 'snapshot_provenance_missing', 'verification_output_limit']);
const reviewFailureDetails = new Map([
  ['unsupported_claims', 'Some claims could not be matched to the available evidence.'],
  ['no_supported_answer', 'The available evidence did not answer the requested detail.'],
  ['snapshot_provenance_missing', 'The draft did not establish when the source was captured.'],
  ['evidence_unavailable', 'The evidence needed for this check was unavailable.'],
  ['verification_output_limit', 'The reviewer reached its output limit.'],
  ['verification_timeout', 'The reviewer ran out of time.'],
  ['verifier_unavailable', 'The reviewer could not complete this check.'],
]);
const stopDetails = {
  time_budget: ['There was too little time left for another evidence check.', '此請求已沒有足夠時間再次核對。'],
  reviewer_unavailable: ['The checker could not complete another verification.', '核對服務無法完成下一次查核。'],
  repair_unavailable: ['A corrected answer could not be prepared for another check.', '無法準備修正後的答案以再次查核。'],
  no_usable_evidence: ['There was no additional usable evidence for another check.', '沒有其他可用的證據可供再次查核。'],
  no_safe_continuation: ['The request had no eligible next evidence check.', '此請求沒有可進行的下一次證據查核。'],
  verification_limit: ['The available checks ended with details still unverified.', '已完成可用的查核，部分細節仍無法確認。'],
};

export function verificationStopActivity(question, cause = 'no_safe_continuation') {
  const chinese = /[\u3400-\u9fff]/u.test(question);
  return {
    kind: 'verification-stop',
    label: chinese ? '查核已結束' : 'Why verification stopped',
    detail: (Object.hasOwn(stopDetails, cause) ? stopDetails[cause] : stopDetails.no_safe_continuation)[chinese ? 1 : 0],
    status: 'unavailable',
  };
}

export function unverifiedAnswer(question, candidate, activity, attempts, reason) {
  const chinese = /[\u3400-\u9fff]/.test(question);
  return {
    status: 'abstained',
    answer: chinese
      ? '我已檢查可用的紀錄或來源，但這次仍無法驗證答案。請稍後重試，或提供更具體的課程、日期或問題。'
      : 'I checked the available records or sources, but I could not verify this answer. Please try again or specify the course, date, or detail you need.',
    citations: [], suggestedQuestions: [],
    grounding: { ...candidate?.grounding, degraded: true },
    verification: { status: 'unverified', attempts, reason },
    activity: [...(candidate?.activity || []), ...activity],
  };
}

/** Request-local graph. Its retry edge only reads evidence and revises text. */
export async function runAnswerVerification({
  question, initialAnswer, loadEvidence, verify, repair, onProgress, allowDeeperReview = false, deferTerminalProgress = false,
  previousChecks = 0, deadline = Date.now() + 50_000,
}) {
  if (!Number.isInteger(previousChecks) || previousChecks < 0 || previousChecks >= maxAnswerVerificationChecks)
    throw new RangeError('Invalid initial verification check count');
  // Keep account data out of graph traces/checkpoints. Every invocation owns its
  // evidence and draft; the graph state contains only bounded control metadata.
  let candidate = initialAnswer, evidence = [], feedback = [], checks = previousChecks;
  const activity = [];
  const emit = (kind, label, detail, status = 'complete') => {
    const step = { kind, label, detail, status };
    const existing = activity.findIndex(item => item.kind === kind);
    if (existing < 0) activity.push(step); else activity[existing] = step;
    try { onProgress?.(step); } catch { /* A closed stream cannot approve a draft. */ }
  };
  const withinBudget = () => Date.now() < deadline - 500;
  const safeToContinue = () => allowDeeperReview && !initialAnswer?.proposedAction && !candidate?.proposedAction;
  const enoughTimeToContinue = () => deadline - Date.now() >= deeperReviewBudgetMs;
  const shouldDeepen = verdict => safeToContinue()
    && evidence.length > 0 && deeperReviewReasons.has(verdict.reason)
    && (feedback.length > 0 || verdict.reason === 'verification_output_limit');
  const canRetryAfterSourceSwitch = verdict => safeToContinue()
    && (deeperReviewReasons.has(verdict.reason) || verdict.reason === 'evidence_unavailable');
  const stop = (attempts, reason, attempt) => {
    const cause = reason === 'timeout' || reason === 'verification_timeout' || !withinBudget()
      || (attempt + previousChecks < maxAnswerVerificationChecks && !enoughTimeToContinue()
        && (previousChecks > 0 ? canRetryAfterSourceSwitch({ reason }) : shouldDeepen({ reason })))
      ? 'time_budget'
      : ['verifier_unavailable', 'verification_unavailable'].includes(reason) ? 'reviewer_unavailable'
      : reason === 'repair_unavailable' ? 'repair_unavailable'
      : reason === 'evidence_unavailable' || !evidence.length ? 'no_usable_evidence'
      : attempts >= maxAnswerVerificationChecks ? 'verification_limit' : 'no_safe_continuation';
    const step = verificationStopActivity(question, cause);
    if (deferTerminalProgress) activity.push(step);
    else emit(step.kind, step.label, step.detail, step.status);
    return unverifiedAnswer(question, candidate, activity, attempts, reason);
  };
  const bounded = async (work, until = deadline) => {
    let timer;
    try {
      return await Promise.race([work(),new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(Object.assign(new Error('Verification time limit'), {code:'VERIFICATION_TIMEOUT'})),Math.max(1,until-Date.now()));
      })]);
    } finally { clearTimeout(timer); }
  };
  const graph = new StateGraph(VerificationState)
    .addNode('retrieve', async state => {
      if (!withinBudget()) return { verdict: { ok: false, reason: 'timeout' } };
      // A deeper review changes how the draft is reasoned through. It has no
      // authority to search again, widen the account scope or execute a write.
      if (state.attempt > standardChecks) return { verdict: null };
      try {
        evidence = await bounded(()=>loadEvidence({ attempt: state.attempt, deadline, feedback, previousFailure:state.previousFailure }));
        return { verdict: null };
      } catch (error) {
        evidence = [];
        const reason = error?.code === 'VERIFICATION_TIMEOUT' ? 'timeout' : 'evidence_unavailable';
        return { verdict: { ok: false, reason } };
      }
    })
    .addNode('draft', async state => {
      if (state.attempt === 1 || state.verdict || !withinBudget()) return {};
      try {
        const repairDeadline=state.attempt>standardChecks || previousChecks>0 ? deadline-8_000 : deadline;
        candidate = await bounded(()=>repair({ question, candidate, evidence, deadline:repairDeadline, feedback, attempt:state.attempt }),repairDeadline);
        return {};
      } catch (error) {
        // Missing sources or invented correction links are evidence failures,
        // distinct from a provider timeout/outage. All still withhold the draft.
        const reason=error?.code==='EVIDENCE_UNAVAILABLE'?'evidence_unavailable'
          :error?.code==='CORRECTION_UNSUPPORTED'?'unsupported_claims'
            :error?.code==='VERIFICATION_TIMEOUT'?'timeout':'repair_unavailable';
        return { verdict: { ok: false, reason } };
      }
    })
    .addNode('verify', async state => {
      let verdict = state.verdict;
      const ordinal = state.attempt + previousChecks;
      if (!verdict && withinBudget()) {
        checks++;
        emit(`verification-${ordinal}`, 'Checking answer against evidence', `Verification check ${checks}.`, 'running');
        try {
          const review = await bounded(()=>verify({ question, candidate, evidence, deadline, feedback, attempt:state.attempt }));
          feedback = Array.isArray(review.feedback) ? review.feedback.slice(0, 12) : [];
          verdict = { ok: review.ok === true, reason: review.reason || 'unsupported_claims' };
        } catch (error) {
          const reason = error?.code === 'VERIFICATION_OUTPUT_LIMIT' ? 'verification_output_limit'
            : error?.code === 'VERIFICATION_TIMEOUT' ? 'verification_timeout' : 'verifier_unavailable';
          verdict = { ok: false, reason };
        }
        emit(`verification-${ordinal}`, verdict.ok ? 'Answer checked against evidence' : 'Draft did not pass verification',
          verdict.ok ? 'The answer passed the evidence checks.' : reviewFailureDetails.get(verdict.reason) || 'This draft did not pass the evidence checks.',
          verdict.ok ? 'complete' : 'unavailable');
      } else {
        verdict ||= { ok: false, reason: 'timeout' };
        emit(`verification-preparation-${ordinal}`, 'Could not prepare an answer to check',
          'This attempt ended before a draft could be checked.', 'unavailable');
      }
      if (verdict?.ok !== true) verdict = { ok: false, reason: verdict?.reason || 'unsupported_claims' };
      return { verdict };
    })
    .addNode('retry', state => {
      if(previousChecks>0)emit('verification-source-retry','Checking the new evidence again',
        'Looking for the missing detail and revising the answer if the evidence supports it.');
      else if(state.attempt===standardChecks)emit('verification-deeper-review','Taking a closer look at the answer',
        'Reconsidering the unresolved claims using the same authorized evidence.');
      else emit('verification-retry', 'Rechecking and correcting the answer', 'Checking the available evidence again and preparing a correction.');
      return { attempt: state.attempt + 1, verdict: null, previousFailure:state.verdict.reason };
    })
    .addEdge(START, 'retrieve')
    .addEdge('retrieve', 'draft')
    .addEdge('draft', 'verify')
    .addConditionalEdges('verify', state => {
      if(state.verdict.ok || state.attempt + previousChecks >= maxAnswerVerificationChecks || !withinBudget())return END;
      if(previousChecks>0)return canRetryAfterSourceSwitch(state.verdict) && enoughTimeToContinue() ? 'retry' : END;
      return state.attempt < standardChecks || (shouldDeepen(state.verdict) && enoughTimeToContinue()) ? 'retry' : END;
    })
    .addEdge('retry', 'retrieve')
    .compile();
  let result;
  try {
    result = await graph.invoke({ attempt: 1, verdict: null }, { recursionLimit: 15, callbacks: [] });
  } catch {
    return stop(checks, 'verification_unavailable', maxAnswerVerificationChecks);
  }
  const attempts=allowDeeperReview || previousChecks > 0 ? checks : result.attempt;
  if (!result.verdict.ok) return stop(attempts, result.verdict.reason, result.attempt);
  return {
    ...candidate,
    verification: { status: 'verified', attempts },
    activity: [...(candidate.activity || []), ...activity],
  };
}
