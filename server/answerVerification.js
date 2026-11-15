import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { maxAnswerVerificationChecks } from '../src/services/assistantVerificationLimits.js';

const VerificationState = Annotation.Root({
  attempt: Annotation(), verdict: Annotation(), previousFailure: Annotation(),
});
const standardChecks = 2;
const deeperReviewBudgetMs = 18_000;
const deeperReviewReasons = new Set(['unsupported_claims', 'no_supported_answer', 'snapshot_provenance_missing', 'verification_output_limit']);

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
  question, initialAnswer, loadEvidence, verify, repair, onProgress, allowDeeperReview = false, deadline = Date.now() + 50_000,
}) {
  // Keep account data out of graph traces/checkpoints. Every invocation owns its
  // evidence and draft; the graph state contains only bounded control metadata.
  let candidate = initialAnswer, evidence = [], feedback = [], checks = 0;
  const activity = [];
  const emit = (kind, label, detail, status = 'complete') => {
    const step = { kind, label, detail, status };
    const existing = activity.findIndex(item => item.kind === kind);
    if (existing < 0) activity.push(step); else activity[existing] = step;
    try { onProgress?.(step); } catch { /* A closed stream cannot approve a draft. */ }
  };
  const withinBudget = () => Date.now() < deadline - 500;
  const shouldDeepen = verdict => allowDeeperReview && !initialAnswer?.proposedAction && !candidate?.proposedAction
    && evidence.length > 0 && deeperReviewReasons.has(verdict.reason)
    && (feedback.length > 0 || verdict.reason === 'verification_output_limit') && deadline - Date.now() >= deeperReviewBudgetMs;
  const bounded = async (work, until = deadline) => {
    let timer;
    try {
      return await Promise.race([work(),new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(new Error('Verification time limit')),Math.max(1,until-Date.now()));
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
      } catch {
        evidence = [];
        return { verdict: { ok: false, reason: 'evidence_unavailable' } };
      }
    })
    .addNode('draft', async state => {
      if (state.attempt === 1 || state.verdict || !withinBudget()) return {};
      try {
        const repairDeadline=state.attempt>standardChecks?deadline-8_000:deadline;
        candidate = await bounded(()=>repair({ question, candidate, evidence, deadline:repairDeadline, feedback, attempt:state.attempt }),repairDeadline);
        return {};
      } catch (error) {
        // Missing sources or invented correction links are evidence failures,
        // distinct from a provider timeout/outage. All still withhold the draft.
        const reason=error?.code==='EVIDENCE_UNAVAILABLE'?'evidence_unavailable'
          :error?.code==='CORRECTION_UNSUPPORTED'?'unsupported_claims':'repair_unavailable';
        return { verdict: { ok: false, reason } };
      }
    })
    .addNode('verify', async state => {
      let verdict = state.verdict;
      if (!verdict && withinBudget()) {
        checks++;
        emit(`verification-${state.attempt}`, 'Checking answer against evidence', `Verification check ${checks}.`, 'running');
        try {
          const review = await bounded(()=>verify({ question, candidate, evidence, deadline, feedback, attempt:state.attempt }));
          feedback = Array.isArray(review.feedback) ? review.feedback.slice(0, 12) : [];
          verdict = { ok: review.ok === true, reason: review.reason || 'unsupported_claims' };
        } catch (error) {
          const reason = error?.code === 'VERIFICATION_OUTPUT_LIMIT' ? 'verification_output_limit'
            : error?.code === 'VERIFICATION_TIMEOUT' ? 'verification_timeout' : 'verifier_unavailable';
          verdict = { ok: false, reason };
        }
        emit(`verification-${state.attempt}`, verdict.ok ? 'Answer checked against evidence' : 'Answer could not be verified',
          verdict.ok ? 'The answer passed the evidence checks.' : 'The current draft was withheld.', verdict.ok ? 'complete' : 'unavailable');
      } else {
        verdict ||= { ok: false, reason: 'timeout' };
        emit(`verification-preparation-${state.attempt}`, 'Could not prepare an answer to check',
          'This attempt ended before a draft could be checked.', 'unavailable');
      }
      if (verdict?.ok !== true) verdict = { ok: false, reason: verdict?.reason || 'unsupported_claims' };
      return { verdict };
    })
    .addNode('retry', state => {
      if(state.attempt===standardChecks)emit('verification-deeper-review','Taking a closer look at the answer',
        'Reconsidering the unresolved claims using the same authorized evidence.');
      else emit('verification-retry', 'Rechecking and correcting the answer', 'Reloading the evidence and preparing one corrected draft.');
      return { attempt: state.attempt + 1, verdict: null, previousFailure:state.verdict.reason };
    })
    .addEdge(START, 'retrieve')
    .addEdge('retrieve', 'draft')
    .addEdge('draft', 'verify')
    .addConditionalEdges('verify', state => {
      if(state.verdict.ok || state.attempt >= maxAnswerVerificationChecks || !withinBudget())return END;
      return state.attempt < standardChecks || shouldDeepen(state.verdict) ? 'retry' : END;
    })
    .addEdge('retry', 'retrieve')
    .compile();
  let result;
  try {
    result = await graph.invoke({ attempt: 1, verdict: null }, { recursionLimit: 15, callbacks: [] });
  } catch {
    return unverifiedAnswer(question, candidate, activity, checks, 'verification_unavailable');
  }
  const attempts=allowDeeperReview?checks:result.attempt;
  if (!result.verdict.ok) return unverifiedAnswer(question, candidate, activity, attempts, result.verdict.reason);
  return {
    ...candidate,
    verification: { status: 'verified', attempts },
    activity: [...(candidate.activity || []), ...activity],
  };
}
