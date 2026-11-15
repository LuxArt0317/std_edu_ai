import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {buildPlannedTutorEvaluationCases,tutorEvaluationVisibleChecks} from './tutor-evaluation-cases.mjs';
import {gradeCase} from './grading.mjs';

export const tutorTuitionFixtureMode='tutor-evaluation-tuition-only';
const prefix='account:tutor-evaluation-';
export const tutorTuitionCaseIds=Object.freeze(['mixed-tuition','mixed-reversed','negative-tutor'].map(id=>prefix+id));
const sha256=/^[a-f0-9]{64}$/u;
const requestId=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function tutorTuitionHostedCases(){
  const selected=structuredClone(buildPlannedTutorEvaluationCases().filter(row=>tutorTuitionCaseIds.includes(row.id)));
  if(!isDeepStrictEqual(selected.map(row=>row.id),tutorTuitionCaseIds)
    ||selected.some(row=>!isDeepStrictEqual(row.plannedFixture.requiresAdditionalFixtures,['charges'])))
    throw new Error('The three original Tutor and tuition cases could not be bound.');
  return selected.map(({plannedFixture,...row})=>({...row,executionContract:'live-native',
    fixtureRequirement:'tutor_tuition_disposable',fixtureKey:'live:tutorEvaluation',capability:{level:'native',gap:false}}));
}

export function validateTutorTuitionHostedCases(cases){
  if(!isDeepStrictEqual(cases,tutorTuitionHostedCases()))
    throw new Error('Tutor and tuition requires the exact three-case protected packet.');
}

function readbackProof(before,after){
  if(!before||!isDeepStrictEqual(before,after)||!sha256.test(before.rowsDigest??'')
    ||!Array.isArray(before.callers)||before.callers.length!==2||before.callers.some((row,index)=>
      row?.role!==['A','B'][index]||row.visibleRows!==1||!sha256.test(row.projectionSha256??''))
    ||before.callers[0].projectionSha256===before.callers[1].projectionSha256
    ||before.charges?.checks!==8||!sha256.test(before.charges.digest??'')||!sha256.test(before.charges.rowsDigest??''))return null;
  return {tutorDigest:before.rowsDigest,tutorCallerRows:before.callers.map(row=>row.visibleRows),
    chargeRowsDigest:before.charges.rowsDigest,chargeCallerDigest:before.charges.digest,chargeCallerChecks:before.charges.checks};
}

export function gradeHostedTutorTuition(testCase,envelope,before,after){
  const expected=tutorTuitionHostedCases().find(row=>row.id===testCase?.id);
  if(!isDeepStrictEqual(testCase,expected))throw new Error('Unexpected Tutor and tuition case.');
  const proof=readbackProof(before,after);
  const projection=proof?digest(proof):null;
  const enriched={...envelope,stateBefore:{ownedRecordsDigest:projection},stateAfterProposal:{ownedRecordsDigest:projection},
    fixtureReadback:{verified:Boolean(proof),independentGolden:Boolean(proof)}};
  const failures=[...gradeCase(testCase,enriched).failures,...tutorEvaluationVisibleChecks(testCase,envelope.body).filter(check=>!check.passed)].map(row=>row.id);
  const excluded=testCase.id===prefix+'negative-tutor';
  const events=envelope.events??[];
  const reads=events.filter(row=>String(row.kind).startsWith('account-read:')).map(row=>[row.kind,row.status]).sort();
  const expectedReads=[['account-read:charges:1','complete'],...(excluded?[]:[
    ['account-read:tutorEvaluation:1','complete'],['account-read:tutorEvaluation:1','running'],
  ])].sort();
  const nativeCheck=excluded?'fee-balance-evidence-check':'tutor-evaluation-evidence-check';
  if(!isDeepStrictEqual(reads,expectedReads)||!isDeepStrictEqual(envelope.body?.verification,{status:'verified',attempts:1})
    ||envelope.body?.grounding?.degraded===true||!events.some(row=>row.kind==='verification-1'&&row.status==='complete')
    ||events.filter(row=>row.kind===nativeCheck&&row.status==='complete').length!==1)
    failures.push('tutor-tuition.scoped-activity');
  if(events.some(row=>/^(?:public-|web-|knowledge-|account-replan)|storage|download|confirmed.action/iu.test(String(row.kind))))
    failures.push('tutor-tuition.unexpected-activity');
  if(!proof)failures.push('tutor-tuition.paired-readback');
  return {caseId:testCase.id,passed:failures.length===0,failures,readers:excluded?['charges']:['tutorEvaluation','charges'],
    nativeCheck,readback:proof};
}

export function hasTutorTuitionProof(results){
  return Array.isArray(results)&&results.length===tutorTuitionCaseIds.length&&results.every((row,index)=>
    row?.caseId===tutorTuitionCaseIds[index]&&row.passed===true&&row.failures?.length===0
    &&row.requestIndex===index+1&&requestId.test(row.correlationId??'')&&sha256.test(row.requestSha256??'')
    &&isDeepStrictEqual(row.readers,index===2?['charges']:['tutorEvaluation','charges'])
    &&row.nativeCheck===(index===2?'fee-balance-evidence-check':'tutor-evaluation-evidence-check')
    &&isDeepStrictEqual(row.readback?.tutorCallerRows,[1,1])&&row.readback.chargeCallerChecks===8
    &&['tutorDigest','chargeRowsDigest','chargeCallerDigest'].every(key=>sha256.test(row.readback[key]??''))
    &&isDeepStrictEqual(row.readback,results[0].readback))
    &&new Set(results.map(row=>row.correlationId)).size===tutorTuitionCaseIds.length
    &&new Set(results.map(row=>row.requestSha256)).size===tutorTuitionCaseIds.length;
}
