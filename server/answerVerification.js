import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { maxAnswerVerificationChecks, maxPublicAnswerVerificationChecks } from '../src/services/assistantVerificationLimits.js';

const VerificationState = Annotation.Root({
  attempt: Annotation(), verdict: Annotation(), previousFailure: Annotation(),
});
const standardChecks = 2;
const deeperReviewBudgetMs = 18_000;
const deeperReviewReasons = new Set(['unsupported_claims', 'no_supported_answer', 'snapshot_provenance_missing', 'verification_output_limit']);
export function normalizeMissingDetails(details) {
  if (!Array.isArray(details) || details.length > 12 || details.some(detail => typeof detail !== 'string' || !detail.trim() || detail.length > 160)) return null;
  return [...new Set(details.map(detail => detail.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()))];
}
const reviewFailureDetails = new Map([
  ['unsupported_claims', 'Some claims could not be matched to the available evidence.'],
  ['no_supported_answer', 'The available evidence did not answer the requested detail.'],
  ['snapshot_provenance_missing', 'The draft did not establish when the source was captured.'],
  ['evidence_unavailable', 'The evidence needed for this check was unavailable.'],
  ['verification_output_limit', 'The reviewer reached its output limit.'],
  ['verification_timeout', 'The reviewer ran out of time.'],
  ['verifier_unavailable', 'The reviewer could not complete this check.'],
  ['provider_quota_exhausted', 'The automatic evidence reviewer is unavailable right now.'],
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
  const answer = reason === 'provider_quota_exhausted'
    ? (chinese ? '答案查核服務暫時無法使用，因此這次無法確認答案。請稍後再試。'
      : 'The answer checker is temporarily unavailable. I couldn’t verify an answer to this question. Please try again later.')
    : (chinese ? '我已檢查可用的紀錄或來源，但這次仍無法驗證答案。請稍後重試，或提供更具體的課程、日期或問題。'
      : 'I checked the available records or sources, but I could not verify this answer. Please try again or specify the course, date, or detail you need.');
  return {
    status: 'abstained',
    answer,
    citations: [], suggestedQuestions: [],
    grounding: { ...candidate?.grounding, degraded: true },
    verification: { status: 'unverified', attempts, reason },
    activity: [...(candidate?.activity || []), ...activity],
  };
}

/** Request-local graph. Its retry edge only reads evidence and revises text. */
export async function runAnswerVerification({
  question, initialAnswer, loadEvidence, loadDeeperEvidence, verify, repair, onProgress, allowDeeperReview = false, deferTerminalProgress = false,
  previousChecks = 0, maxChecks = maxAnswerVerificationChecks, canExtendReview, lookForMissingPublicDetails, hasUnreadPublicLead, priorVerifiedPartial,
  hasLocalCorrection = false, deadline = Date.now() + 50_000,
}) {
  if (maxChecks !== maxAnswerVerificationChecks && maxChecks !== maxPublicAnswerVerificationChecks)
    throw new RangeError('Invalid verification check limit');
  if (!Number.isInteger(previousChecks) || previousChecks < 0 || previousChecks >= maxChecks)
    throw new RangeError('Invalid initial verification check count');
  // Keep account data out of graph traces/checkpoints. Every invocation owns its
  // evidence and draft; the graph state contains only bounded control metadata.
  let candidate = initialAnswer, evidence = [], feedback = [], checks = previousChecks;
  const activity = [];
  let verifiedPartial, missingRequestedDetails, partialFollowUps = 0;
  const emit = (kind, label, detail, status = 'complete') => {
    const step = { kind, label, detail, status };
    const existing = activity.findIndex(item => item.kind === kind);
    if (existing < 0) activity.push(step); else activity[existing] = step;
    try { onProgress?.(step); } catch { /* A closed stream cannot approve a draft. */ }
  };
  const withinBudget = () => Date.now() < deadline - 500;
  const safeToContinue = () => allowDeeperReview && !initialAnswer?.proposedAction && !candidate?.proposedAction;
  const publicRecovery = maxChecks === maxPublicAnswerVerificationChecks && Boolean(loadDeeperEvidence);
  if (priorVerifiedPartial) {
    const { candidate: priorCandidate } = priorVerifiedPartial;
    const missing = normalizeMissingDetails(priorVerifiedPartial.missing);
    if (!publicRecovery || !previousChecks || priorCandidate?.status !== 'answered'
      || priorCandidate.proposedAction || priorCandidate.verification?.status !== 'verified'
      || priorCandidate.verification.attempts !== previousChecks || !missing?.length)
      throw new TypeError('Invalid retained public answer');
    verifiedPartial = { candidate: priorCandidate, missing };
  }
  const enoughTimeToContinue = attempt => deadline - Date.now() >= (
    publicRecovery && attempt + previousChecks >= maxAnswerVerificationChecks ? 14_000 : deeperReviewBudgetMs
  );
  const shouldDeepen = verdict => safeToContinue() && (
    (evidence.length > 0 && deeperReviewReasons.has(verdict.reason)
      && (feedback.length > 0 || verdict.reason === 'verification_output_limit'))
    || (loadDeeperEvidence && ['unsupported_claims', 'no_supported_answer', 'evidence_unavailable'].includes(verdict.reason))
  );
  const canRetryAfterSourceSwitch = verdict => safeToContinue()
    && (deeperReviewReasons.has(verdict.reason) || verdict.reason === 'evidence_unavailable');
  const canFollowLead = attempt => attempt + previousChecks < maxAnswerVerificationChecks || canExtendReview?.() === true;
  // A smaller set can still lose a fact if it adds a newly missing detail.
  const improvesPartial = () => missingRequestedDetails && missingRequestedDetails.length < verifiedPartial.missing.length
    && missingRequestedDetails.every(detail => verifiedPartial.missing.includes(detail));
  const retainsSameGaps = () => missingRequestedDetails.length === verifiedPartial.missing.length
    && missingRequestedDetails.every(detail => verifiedPartial.missing.includes(detail));
  const stop = (attempts, reason, attempt) => {
    const cause = reason === 'provider_quota_exhausted' ? 'reviewer_unavailable'
      : reason === 'timeout' || reason === 'verification_timeout' || !withinBudget()
      || (attempt + previousChecks < maxChecks && canFollowLead(attempt) && !enoughTimeToContinue(attempt)
        && (previousChecks > 0 ? canRetryAfterSourceSwitch({ reason }) : shouldDeepen({ reason })))
      ? 'time_budget'
      : ['verifier_unavailable', 'verification_unavailable'].includes(reason) ? 'reviewer_unavailable'
      : reason === 'repair_unavailable' ? 'repair_unavailable'
      : ['evidence_unavailable', 'source_exhausted'].includes(reason) || !evidence.length
        || (publicRecovery && attempts >= maxAnswerVerificationChecks && !canFollowLead(attempt)) ? 'no_usable_evidence'
      : attempts >= maxChecks ? 'verification_limit' : 'no_safe_continuation';
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
      // Only an explicitly supplied public loader can acquire additional evidence
      // in a deeper pass. Account answers retain the earlier scoped evidence.
      const load = state.attempt > standardChecks ? loadDeeperEvidence : loadEvidence;
      if (!load) return { verdict: null };
      try {
        evidence = await bounded(()=>load({ attempt: state.attempt, deadline, feedback, previousFailure:state.previousFailure }));
        return { verdict: null };
      } catch (error) {
        evidence = [];
        const reason = error?.code === 'VERIFICATION_TIMEOUT' ? 'timeout'
          : error?.code === 'NO_MORE_EVIDENCE' ? 'source_exhausted' : 'evidence_unavailable';
        return { verdict: { ok: false, reason } };
      }
    })
    .addNode('draft', async state => {
      if (state.attempt === 1 || state.verdict || !withinBudget()) return {};
      try {
        const deeperAttempt = state.attempt > standardChecks || previousChecks > 0;
        const repairDeadline = deeperAttempt ? deadline - (publicRecovery ? 6_000 : 8_000) : deadline;
        candidate = await bounded(()=>repair({ question, candidate, evidence, deadline:repairDeadline, feedback, attempt:state.attempt,
          ...(state.previousFailure==='verified_partial'?{afterVerifiedPartial:true}:{}) }),repairDeadline);
        return {};
      } catch (error) {
        // Missing sources or invented correction links are evidence failures,
        // distinct from a provider timeout/outage. All still withhold the draft.
        const reason=error?.code==='VERIFICATION_QUOTA_EXHAUSTED'?'provider_quota_exhausted'
          :error?.code==='EVIDENCE_UNAVAILABLE'?'evidence_unavailable'
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
          const review = await bounded(()=>verify({ question, candidate, evidence, deadline, feedback, attempt:state.attempt,
            ...(verifiedPartial?{previousMissingRequestedDetails:verifiedPartial.missing}:{}) }));
          feedback = Array.isArray(review.feedback) ? review.feedback.slice(0, 12) : [];
          if (publicRecovery) missingRequestedDetails = normalizeMissingDetails(review.missingRequestedDetails);
          verdict = { ok: review.ok === true, reason: review.reason || 'unsupported_claims' };
        } catch (error) {
          const reason = error?.code === 'VERIFICATION_OUTPUT_LIMIT' ? 'verification_output_limit'
            : error?.code === 'VERIFICATION_QUOTA_EXHAUSTED' ? 'provider_quota_exhausted'
              : error?.code === 'VERIFICATION_TIMEOUT' ? 'verification_timeout' : 'verifier_unavailable';
          if (verifiedPartial && reason === 'verification_output_limit') feedback = [];
          verdict = { ok: false, reason };
        }
        const label = verdict.ok ? 'Answer checked against evidence'
          : verdict.reason === 'provider_quota_exhausted' ? 'Answer checker unavailable' : 'Draft did not pass verification';
        emit(`verification-${ordinal}`, label,
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
      const nextCheck = state.attempt + previousChecks + 1;
      if (verifiedPartial) candidate = verifiedPartial.candidate;
      if (nextCheck > maxAnswerVerificationChecks) emit('verification-extended-review', 'Looking for another source',
        'Looking for an unread school page or another publication that can verify the remaining detail.');
      if (state.verdict.ok) {
        const step = partialFollowUps++ === 0 ? 'verification-partial-follow-up' : `verification-partial-follow-up-${nextCheck}`;
        emit(step, 'Checking a source for the missing details', 'The current answer has supported information. Looking for evidence that can answer the rest.');
      } else if (nextCheck <= maxAnswerVerificationChecks) {
        if(previousChecks>0)emit('verification-source-retry','Checking the new evidence again',
          'Looking for the missing detail and revising the answer if the evidence supports it.');
        else if(state.attempt===standardChecks)emit('verification-deeper-review','Taking a closer look at the answer',
          loadDeeperEvidence ? 'Checking whether a more specific source can resolve the missing detail.' : 'Reconsidering the unresolved claims using the same authorized evidence.');
        else emit('verification-retry', 'Rechecking and correcting the answer', 'Checking the available evidence again and preparing a correction.');
      }
      return { attempt: state.attempt + 1, verdict: null, previousFailure:verifiedPartial?'verified_partial':state.verdict.reason };
    })
    .addEdge(START, 'retrieve')
    .addEdge('retrieve', 'draft')
    .addEdge('draft', 'verify')
    .addConditionalEdges('verify', state => {
      if(state.attempt + previousChecks >= maxChecks || !withinBudget() || state.verdict.reason === 'source_exhausted')return END;
      if(state.verdict.reason==='provider_quota_exhausted')return hasLocalCorrection&&state.attempt===1?'retry':END;
      if(state.verdict.ok){
        if (!publicRecovery || !missingRequestedDetails?.length || !safeToContinue()
          || !canFollowLead(state.attempt) || !enoughTimeToContinue(state.attempt)
          || lookForMissingPublicDetails?.() !== true) return END;
        if (!verifiedPartial || improvesPartial()) verifiedPartial = {candidate, missing:missingRequestedDetails};
        else if (!retainsSameGaps() || hasUnreadPublicLead?.() !== true) return END;
        return 'retry';
      }
      if(verifiedPartial){
        const hasActionableFeedback = ['unsupported_claims', 'no_supported_answer', 'snapshot_provenance_missing'].includes(state.verdict.reason)
          && feedback.some(detail => typeof detail === 'string' && detail.trim());
        const canRecoverReview = hasActionableFeedback || state.verdict.reason === 'verification_output_limit';
        return canRecoverReview && checks === state.attempt + previousChecks
          && safeToContinue() && canFollowLead(state.attempt) && enoughTimeToContinue(state.attempt)
          &&lookForMissingPublicDetails?.()===true?'retry':END;
      }
      if(!canFollowLead(state.attempt))return END;
      if(previousChecks>0)return canRetryAfterSourceSwitch(state.verdict) && enoughTimeToContinue(state.attempt) ? 'retry' : END;
      return (state.attempt < standardChecks && (!publicRecovery || enoughTimeToContinue(state.attempt))) || (shouldDeepen(state.verdict) && enoughTimeToContinue(state.attempt)) ? 'retry' : END;
    })
    .addEdge('retry', 'retrieve')
    .compile();
  function verified(candidate,attempts){
    return {...candidate,verification:{status:'verified',attempts},activity:[...(candidate.activity||[]),...activity]};
  }
  function keepPartial(){
    emit('verification-kept-partial','Kept the verified details','The extra lookup did not verify more of the requested information.');
    return verified(verifiedPartial.candidate,checks);
  }
  let result;
  try {
    result = await graph.invoke({ attempt: 1, verdict: null }, { recursionLimit: maxChecks * 4 + 3, callbacks: [] });
  } catch {
    return verifiedPartial?keepPartial():stop(checks, 'verification_unavailable', maxChecks);
  }
  const attempts=allowDeeperReview || previousChecks > 0 ? checks : result.attempt;
  if(verifiedPartial&&(!result.verdict.ok||!improvesPartial()))return keepPartial();
  if (!result.verdict.ok) return stop(attempts, result.verdict.reason, result.attempt);
  return verified(candidate,attempts);
}
