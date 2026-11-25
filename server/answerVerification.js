import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { maxAnswerVerificationChecks, maxPublicAnswerVerificationChecks } from '../src/services/assistantVerificationLimits.js';

const VerificationState = Annotation.Root({
  attempt: Annotation(), verdict: Annotation(), previousFailure: Annotation(),
});
const standardChecks = 2;
const deeperReviewBudgetMs = 18_000;
const deeperReviewReasons = new Set(['unsupported_claims', 'no_supported_answer', 'snapshot_provenance_missing', 'verification_output_limit']);
const preparationInterruptions = new Set(['repair_timeout', 'transient_repair_unavailable']);
const reviewInterruptions = new Set(['verification_timeout', 'transient_verifier_unavailable']);
const sourceReadTimeLimit = 'source_read_time_limit';
export const publicEvidenceInterruption = reason => preparationInterruptions.has(reason) || reviewInterruptions.has(reason);
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
  ['transient_verifier_unavailable', 'The reviewer was temporarily unavailable.'],
  ['provider_quota_exhausted', 'The automatic evidence reviewer is unavailable right now.'],
]);
const stopDetails = {
  time_budget: ['There was too little time left for another evidence check.', '此請求已沒有足夠時間再次核對。'],
  [sourceReadTimeLimit]: ['The source-reading time limit was reached while school pages were still queued.', '讀取來源的時間已用完，仍有候選頁面尚未核對。'],
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
  const unavailable = ['provider_quota_exhausted','verifier_unavailable','transient_verifier_unavailable',
    'verification_unavailable','repair_unavailable','transient_repair_unavailable'].includes(reason);
  const timeout = ['timeout','verification_timeout','repair_timeout','source_read_time_limit'].includes(reason);
  const noSource = ['evidence_unavailable','source_exhausted','no_supported_answer'].includes(reason);
  const quota = reason === 'provider_quota_exhausted';
  const answer = quota
    ? (chinese ? '抱歉，AI 服務目前的額度已用完。單純等待不一定會恢復，需要網站管理員處理額度；你仍可使用不需要 AI 的帳戶查詢。'
      : 'Sorry, the AI service has run out of credits. Waiting alone won’t necessarily fix it—the site administrator needs to restore the service’s credits. Basic account lookups can still work without it.')
    : chinese
    ? unavailable ? '抱歉，我現在暫時無法核對這項資訊。可以稍後再試一次嗎？'
      : timeout ? '抱歉，這次查詢花了太久，還沒能確認答案。要不要再試一次？'
        : noSource ? '抱歉，我還沒找到足夠可靠的資料來回答這個問題。如果你有相關網頁、公告或截圖，可以傳給我，我再幫你看看。'
          : '抱歉，目前找到的資訊還不足以讓我確定答案。你可以傳一下相關的網頁、公告或截圖嗎？我可以再幫你核對。'
    : unavailable ? 'Sorry, I’m having trouble checking that information right now. Could you try again in a moment?'
      : timeout ? 'Sorry, the lookup took too long, so I couldn’t finish checking that. Would you like me to try again?'
        : noSource ? 'Sorry, I couldn’t find enough reliable information to answer that yet. If you have a related page, notice or screenshot, send it here and I can take a closer look.'
          : 'Sorry, I couldn’t confidently confirm that from the information I found. Could you share the page, notice or screenshot you’re referring to? I can take a closer look.';
  const accountMissing=candidate?.grounding?.source==='account'&&noSource;
  const scopedAnswer=accountMissing
    ? chinese?'抱歉，我目前無法核實你選取的已儲存紀錄。這不代表沒有紀錄，也不能據此判定結果。':'Sorry, I could not verify the saved records you selected. That does not establish that no records exist or confirm their status.'
    :answer;
  const receivedImage=candidate?.grounding?.source==='attached-image';
  const imageAnswer=receivedImage
    ? chinese ? reason==='provider_quota_exhausted'
      ? '我收到你的截圖了，但 AI 服務的額度已用完，所以這次無法讀取圖片。需要管理員恢復額度；你不必重新上傳同一張圖。'
      : '我收到你的截圖了，但這次沒能完成圖片判讀。我還不能確認圖中的細節，不是你漏傳了圖片。'
    : reason==='provider_quota_exhausted'
      ? 'I received your screenshot, but the AI service has run out of credits, so I couldn’t read it. The administrator needs to restore the credits; you don’t need to resend the same image.'
      : 'I received your screenshot, but I couldn’t finish checking its contents. I can’t confirm the details yet—you didn’t miss the attachment.'
    : scopedAnswer;
  return {
    status: 'abstained',
    answer:imageAnswer,
    citations: [], suggestedQuestions: [],
    grounding: { ...candidate?.grounding, degraded: true },
    verification: { status: 'unverified', attempts, reason },
    activity: [...(candidate?.activity || []), ...activity],
  };
}

/** Request-local graph. Its retry edge only reads evidence and revises text. */
export async function runAnswerVerification({
  question, initialAnswer, loadEvidence, loadDeeperEvidence, verify, repair, onProgress, allowDeeperReview = false, deferTerminalProgress = false,
  previousChecks = 0, maxChecks = maxAnswerVerificationChecks, canExtendReview, canRetryScopedRead, lookForMissingPublicDetails, hasUnreadPublicLead, priorVerifiedPartial,
  hasLocalCorrection = false, replanEvidence, deadline = Date.now() + 50_000,
}) {
  if (maxChecks !== maxAnswerVerificationChecks && maxChecks !== maxPublicAnswerVerificationChecks)
    throw new RangeError('Invalid verification check limit');
  if (!Number.isInteger(previousChecks) || previousChecks < 0 || previousChecks >= maxChecks)
    throw new RangeError('Invalid initial verification check count');
  // Keep account data out of graph traces/checkpoints. Every invocation owns its
  // evidence and draft; the graph state contains only bounded control metadata.
  let candidate = initialAnswer, evidence = [], feedback = [], checks = previousChecks;
  const activity = [];
  let verifiedPartial, missingRequestedDetails, partialFollowUps = 0, reviewOnlyRetries = 0;
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
  const continuationBudget = attempt => publicRecovery && attempt + previousChecks >= maxAnswerVerificationChecks
    ? 14_000 : deeperReviewBudgetMs;
  const enoughTimeToContinue = attempt => deadline - Date.now() >= continuationBudget(attempt);
  const shouldDeepen = verdict => safeToContinue() && (
    (evidence.length > 0 && deeperReviewReasons.has(verdict.reason)
      && (feedback.length > 0 || verdict.reason === 'verification_output_limit'))
    || (loadDeeperEvidence && ['unsupported_claims', 'no_supported_answer', 'evidence_unavailable'].includes(verdict.reason))
    || (verdict.reason === 'evidence_unavailable' && canRetryScopedRead?.() === true)
  );
  const canRetryAfterSourceSwitch = verdict => safeToContinue()
    && (deeperReviewReasons.has(verdict.reason) || verdict.reason === 'evidence_unavailable');
  const canFollowLead = attempt => attempt + previousChecks < maxAnswerVerificationChecks || canExtendReview?.() === true;
  const canRecoverFromInterruption = attempt => publicRecovery && safeToContinue() && attempt + previousChecks < maxChecks
    && hasUnreadPublicLead?.() === true && canFollowLead(attempt) && enoughTimeToContinue(attempt);
  const canRecheckInterruptedReview = attempt => publicRecovery && safeToContinue() && reviewOnlyRetries===0
    && candidate?.status==='answered' && evidence.length>0 && attempt+previousChecks<maxChecks
    && deadline-Date.now()>=25_000;
  const nextSourceDeadline = attempt => deadline - continuationBudget(attempt) - 1_000;
  const reviewDeadlineFor = attempt => {
    // Leave a review window for a concrete, unread public source.
    if (!canRecoverFromInterruption(attempt)) return deadline;
    const reserved = nextSourceDeadline(attempt);
    return reserved - Date.now() >= 5_000 ? reserved : deadline;
  };
  // A smaller set can still lose a fact if it adds a newly missing detail.
  const improvesPartial = () => missingRequestedDetails && missingRequestedDetails.length < verifiedPartial.missing.length
    && missingRequestedDetails.every(detail => verifiedPartial.missing.includes(detail));
  const retainsSameGaps = () => missingRequestedDetails.length === verifiedPartial.missing.length
    && missingRequestedDetails.every(detail => verifiedPartial.missing.includes(detail));
  const stop = (attempts, reason, attempt) => {
    const cause = reason === sourceReadTimeLimit ? sourceReadTimeLimit
      : reason === 'provider_quota_exhausted' ? 'reviewer_unavailable'
      : ['timeout', 'verification_timeout', 'repair_timeout'].includes(reason) || !withinBudget()
      || (attempt + previousChecks < maxChecks && canFollowLead(attempt) && !enoughTimeToContinue(attempt)
        && (previousChecks > 0 ? canRetryAfterSourceSwitch({ reason }) : shouldDeepen({ reason })))
      ? 'time_budget'
      : ['verifier_unavailable', 'transient_verifier_unavailable', 'verification_unavailable'].includes(reason) ? 'reviewer_unavailable'
      : ['repair_unavailable', 'transient_repair_unavailable'].includes(reason) ? 'repair_unavailable'
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
    .addNode('plan', async state => {
      if (!allowDeeperReview) return {};
      const ordinal = state.attempt + previousChecks;
      const kind = `agent-plan-${ordinal}`;
      if (!withinBudget()) return { verdict: { ok:false, reason:'timeout' } };
      if (state.attempt === 1) {
        emit(kind, 'Plan the evidence checks',
          'Read the selected sources, inspect their results, prepare an answer and independently verify it. Revise the plan if a needed detail is missing.');
      } else {
        // The planner receives bounded control feedback inside this request.
        // It cannot change the caller, execute actions or approve its own draft.
        const canReplan = safeToContinue() && replanEvidence
          && ['unsupported_claims','no_supported_answer','evidence_unavailable','verified_partial'].includes(state.previousFailure)
          && enoughTimeToContinue(state.attempt);
        if (canReplan) {
          emit(kind, 'Revising the evidence plan', 'Checking which authorized sources can resolve the remaining details.', 'running');
          try {
            await bounded(() => replanEvidence({attempt:state.attempt,feedback:[...feedback],
              previousFailure:state.previousFailure,deadline:Math.min(deadline - deeperReviewBudgetMs, Date.now() + 3_000)}),
              Math.min(deadline - deeperReviewBudgetMs, Date.now() + 3_000));
            emit(kind, 'Revised the evidence plan', 'The next read uses the selected authorized sources. Its answer still requires independent verification.');
          } catch {
            emit(kind, 'Kept the evidence plan', 'Replanning was unavailable. Continuing with the previously selected authorized sources.', 'unavailable');
          }
        } else emit(kind, 'Continue the evidence plan',
          state.attempt > standardChecks && !loadDeeperEvidence && !replanEvidence
            ? 'Reconsider the unresolved claims against the selected evidence, then check the revised answer.'
            : 'Refresh the selected evidence, inspect the result and check a revised answer.');
      }
      return {};
    })
    .addNode('retrieve', async state => {
      if (state.verdict || !withinBudget()) return { verdict: state.verdict || { ok: false, reason: 'timeout' } };
      // The supplied loader controls scope. An explicit scoped retry reloads
      // the same account selection, with the original deadline.
      const retryScopedRead = state.previousFailure === 'evidence_unavailable' && canRetryScopedRead?.() === true;
      const load = state.attempt > standardChecks
        ? loadDeeperEvidence ?? (retryScopedRead || (replanEvidence && safeToContinue()) ? loadEvidence : undefined)
        : loadEvidence;
      if (!load) return { verdict: null };
      try {
        evidence = await bounded(()=>load({ attempt: state.attempt, deadline, feedback, previousFailure:state.previousFailure }));
        return { verdict: null };
      } catch (error) {
        evidence = [];
        const reason = error?.code === 'PUBLIC_SOURCE_READ_TIMEOUT' ? sourceReadTimeLimit
          : error?.code === 'VERIFICATION_TIMEOUT' ? 'timeout'
          : error?.code === 'NO_MORE_EVIDENCE' ? 'source_exhausted' : 'evidence_unavailable';
        return { verdict: { ok: false, reason } };
      }
    })
    .addNode('observe', state => {
      if (allowDeeperReview) {
        const failed = Boolean(state.verdict);
        emit(`agent-observe-${state.attempt + previousChecks}`, 'Inspecting the source results',
          failed ? 'The source read did not complete. No missing record is inferred from this failure.'
            : evidence.length ? 'Source results are available for the answer check. Availability alone does not establish that they answer the question.'
              : 'No source evidence was returned. A draft cannot establish personal facts without records.',
          failed ? 'unavailable' : 'complete');
      }
      return {};
    })
    .addNode('draft', async state => {
      if (state.attempt === 1 || state.verdict || !withinBudget()) return {};
      try {
        const reviewDeadline = canRecoverFromInterruption(state.attempt) ? nextSourceDeadline(state.attempt) : deadline;
        const reserveReview = state.attempt > standardChecks || previousChecks > 0 || reviewDeadline < deadline
          || reviewInterruptions.has(state.previousFailure);
        const repairDeadline = reserveReview ? reviewDeadline - (publicRecovery ? 6_000 : 8_000) : deadline;
        if (reviewDeadline < deadline && repairDeadline - Date.now() < 750) {
          // Read the already queued page directly when there is only enough
          // time left for one evidence-based rewrite and review.
          return { verdict: { ok: false, reason: 'repair_timeout' } };
        }
        candidate = await bounded(()=>repair({ question, candidate, evidence, deadline:repairDeadline, feedback, attempt:state.attempt,
          ...(verifiedPartial?{afterVerifiedPartial:true}:{}) }),repairDeadline);
        return {};
      } catch (error) {
        // Missing sources or invented correction links are evidence failures,
        // distinct from a provider timeout/outage. All still withhold the draft.
        const reason=error?.code==='VERIFICATION_QUOTA_EXHAUSTED'?'provider_quota_exhausted'
          :error?.code==='EVIDENCE_UNAVAILABLE'?'evidence_unavailable'
          :error?.code==='CORRECTION_UNSUPPORTED'?'unsupported_claims'
            :error?.code==='VERIFICATION_TIMEOUT'?'repair_timeout'
              :error?.retryable===true?'transient_repair_unavailable':'repair_unavailable';
        return { verdict: { ok: false, reason } };
      }
    })
    .addNode('verify', async state => {
      let verdict = state.verdict;
      const ordinal = state.attempt + previousChecks;
      if (!verdict && withinBudget()) {
        checks++;
        const kind = `verification-${publicRecovery ? checks : ordinal}`;
        emit(kind, 'Checking answer against evidence', `Verification check ${checks}.`, 'running');
        try {
          const reviewDeadline = reviewDeadlineFor(state.attempt);
          const review = await bounded(()=>verify({ question, candidate, evidence, deadline:reviewDeadline, feedback, attempt:state.attempt,
            ...(verifiedPartial?{previousMissingRequestedDetails:verifiedPartial.missing}:{}) }),reviewDeadline);
          feedback = Array.isArray(review.feedback) ? review.feedback.slice(0, 12) : [];
          if (publicRecovery) missingRequestedDetails = normalizeMissingDetails(review.missingRequestedDetails);
          verdict = { ok: review.ok === true, reason: review.reason || 'unsupported_claims' };
        } catch (error) {
          const reason = error?.code === 'VERIFICATION_OUTPUT_LIMIT' ? 'verification_output_limit'
            : error?.code === 'VERIFICATION_QUOTA_EXHAUSTED' ? 'provider_quota_exhausted'
              : error?.code === 'VERIFICATION_TIMEOUT' ? 'verification_timeout'
              : error?.retryable === true ? 'transient_verifier_unavailable' : 'verifier_unavailable';
          if (reviewInterruptions.has(reason) || (verifiedPartial && reason === 'verification_output_limit')) feedback = [];
          verdict = { ok: false, reason };
        }
        const label = verdict.ok ? 'Answer checked against evidence'
          : verdict.reason === 'provider_quota_exhausted' ? 'Answer checker unavailable' : 'Draft did not pass verification';
        emit(kind, label,
          verdict.ok ? 'The answer passed the evidence checks.' : reviewFailureDetails.get(verdict.reason) || 'This draft did not pass the evidence checks.',
          verdict.ok ? 'complete' : 'unavailable');
      } else {
        verdict ||= { ok: false, reason: 'timeout' };
        const detail = verdict.reason === 'repair_timeout' ? 'The rewrite could not finish within its time budget.'
          : verdict.reason === 'transient_repair_unavailable' ? 'The rewrite provider was temporarily unavailable.'
            : 'This attempt ended before a draft could be checked.';
        emit(`verification-preparation-${ordinal}`, 'Could not prepare an answer to check', detail, 'unavailable');
      }
      if (verdict?.ok !== true) verdict = { ok: false, reason: verdict?.reason || 'unsupported_claims' };
      return { verdict };
    })
    .addNode('recheck', state => {
      reviewOnlyRetries++;
      emit('verification-review-retry','Retrying the interrupted answer check',
        'Checking the same draft against the same evidence again; no new answer or source is assumed verified.');
      return {attempt:state.attempt+1,verdict:null};
    })
    .addNode('retry', state => {
      const nextCheck = state.attempt + previousChecks + 1;
      if (verifiedPartial) candidate = verifiedPartial.candidate;
      const timedOut = state.verdict.reason === 'verification_timeout';
      const interrupted = !timedOut && publicEvidenceInterruption(state.verdict.reason);
      if (timedOut && publicRecovery) emit(`verification-timeout-recovery-${nextCheck}`, 'Checking another source after a timeout',
        'The previous review timed out. Checking an available school page for the missing detail.');
      if (interrupted && publicRecovery) emit(nextCheck === maxAnswerVerificationChecks ? 'verification-deeper-review' : `verification-interruption-recovery-${nextCheck}`,
        'Checking another source after an interruption', 'An unread school page is available for the remaining detail.');
      if (!timedOut && nextCheck > maxAnswerVerificationChecks) emit('verification-extended-review', 'Looking for another source',
        'Looking for an unread school page or another publication that can verify the remaining detail.');
      if (state.verdict.ok) {
        const step = partialFollowUps++ === 0 ? 'verification-partial-follow-up' : `verification-partial-follow-up-${nextCheck}`;
        emit(step, 'Checking a source for the missing details', 'The current answer has supported information. Looking for evidence that can answer the rest.');
      } else if (nextCheck <= maxAnswerVerificationChecks && !((timedOut || interrupted) && publicRecovery)) {
        if(previousChecks>0)emit('verification-source-retry','Checking the new evidence again',
          'Looking for the missing detail and revising the answer if the evidence supports it.');
        else if(state.attempt===standardChecks){
          if (state.verdict.reason === 'evidence_unavailable' && canRetryScopedRead?.() === true) {
            emit('verification-deeper-review','Retrying the temporarily unavailable records',
              'Reading the same account records again after a temporary service error.');
          } else emit('verification-deeper-review','Taking a closer look at the answer',
            loadDeeperEvidence ? 'Checking whether a more specific source can resolve the missing detail.' : 'Reconsidering the unresolved claims using the same authorized evidence.');
        }
        else emit('verification-retry', 'Rechecking and correcting the answer', 'Checking the available evidence again and preparing a correction.');
      }
      return { attempt: state.attempt + 1, verdict: null,
        previousFailure:verifiedPartial&&!timedOut&&!interrupted?'verified_partial':state.verdict.reason };
    })
    .addEdge(START, 'plan')
    .addEdge('plan', 'retrieve')
    .addEdge('retrieve', 'observe')
    .addEdge('observe', 'draft')
    .addEdge('draft', 'verify')
    .addConditionalEdges('verify', state => {
      if(state.attempt + previousChecks >= maxChecks || !withinBudget()
        || ['source_exhausted',sourceReadTimeLimit].includes(state.verdict.reason))return END;
      if(state.verdict.reason==='provider_quota_exhausted')return hasLocalCorrection&&state.attempt===1?'retry':END;
      if(reviewInterruptions.has(state.verdict.reason)&&canRecheckInterruptedReview(state.attempt))return 'recheck';
      if(publicRecovery&&publicEvidenceInterruption(state.verdict.reason))
        return canRecoverFromInterruption(state.attempt)?'retry':END;
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
    .addEdge('recheck','verify')
    .addEdge('retry', 'plan')
    .compile();
  function verified(candidate,attempts){
    return {...candidate,verification:{status:'verified',attempts},activity:[...(candidate.activity||[]),...activity]};
  }
  function keepPartial(reason){
    const detail = reason === sourceReadTimeLimit ? verificationStopActivity(question, sourceReadTimeLimit).detail
      : 'The extra lookup did not verify more of the requested information.';
    emit('verification-kept-partial','Kept the verified details',detail);
    return verified(verifiedPartial.candidate,checks);
  }
  let result;
  try {
    result = await graph.invoke({ attempt: 1, verdict: null }, { recursionLimit: maxChecks * 6 + 3, callbacks: [] });
  } catch {
    return verifiedPartial?keepPartial():stop(checks, 'verification_unavailable', maxChecks);
  }
  const attempts=allowDeeperReview || previousChecks > 0 ? checks : result.attempt;
  if(verifiedPartial&&(!result.verdict.ok||!improvesPartial()))return keepPartial(result.verdict.reason);
  if (!result.verdict.ok) return stop(attempts, result.verdict.reason, result.attempt);
  return verified(candidate,attempts);
}
