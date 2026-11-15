import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {prepare,runTutorEvaluationPreview} from './live-fixtures.mjs';
import {buildPlannedTutorEvaluationCases} from './tutor-evaluation-cases.mjs';
import {tutorEvaluationFamily,tutorEvaluationFixtureMode,tutorEvaluationHostedCases,tutorEvaluationHostedGaps} from './tutor-evaluation-hosted.mjs';
import {hasTutorTuitionProof,tutorTuitionCaseIds,tutorTuitionFixtureMode,tutorTuitionHostedCases,
  validateTutorTuitionHostedCases} from './tutor-tuition-hosted.mjs';
import {packetVerdict} from './run-health-counseling-preview.mjs';

const origin='https://stdedu-123456789-v1-d286.vercel.app',revision='1'.repeat(40);
const now='2026-11-15T00:00:00Z';

test('the protected Tutor tuition packet preserves every original question and permits only the exact three-case lifecycle',async()=>{
  const cases=tutorTuitionHostedCases(),planned=buildPlannedTutorEvaluationCases();
  assert.deepEqual(cases.map(row=>row.id),tutorTuitionCaseIds);
  for(const {id,question,expected} of cases){
    const oracle=planned.find(row=>row.id===id);
    assert.equal(question,oracle.question);
    assert.deepEqual(expected,oracle.expected);
  }
  const original=tutorEvaluationHostedCases(),gaps=tutorEvaluationHostedGaps();
  assert.equal(original.length,11);
  assert.equal(gaps.length,16);
  assert.deepEqual(gaps.filter(row=>row.reason==='separate_charge_fixture_required').map(row=>row.caseId),tutorTuitionCaseIds);
  for(const other of [[...cases].reverse(),cases.slice(0,2),original,
    cases.map((row,index)=>index?row:{...row,question:'What is my tuition?'}),
    cases.map((row,index)=>index?row:{...row,expected:{...row.expected,facts:[]}})])
    assert.throws(()=>validateTutorTuitionHostedCases(other),/exact three-case/u);
  const previewReadbackFetch=async()=>assert.fail('Invalid packets never reach the preview.');
  const args={runId:randomUUID(),now,origin,approvedPreviewOrigin:origin,expectedReleaseRevision:revision,
    caseFamily:tutorEvaluationFamily,fixtureMode:tutorTuitionFixtureMode,previewReadbackFetch};
  await assert.rejects(prepare({...args,cases:original}),/exact three-case/u);
  await assert.rejects(prepare({...args,cases,fixtureMode:tutorEvaluationFixtureMode}),/exact owned read-only/u);
  await assert.rejects(prepare({...args,cases,caseFamily:undefined}),{code:'fixture-target'});
  await assert.rejects(runTutorEvaluationPreview({origin:'https://stu.best',sourceRevision:revision,compound:true}),{code:'fixture-config'});
});

test('Tutor tuition verdict requires both cleanup flags, two unchanged caller proofs and distinct pinned streams',()=>{
  const readback={tutorDigest:'a'.repeat(64),tutorCallerRows:[1,1],chargeRowsDigest:'b'.repeat(64),
    chargeCallerDigest:'c'.repeat(64),chargeCallerChecks:8};
  const results=tutorTuitionCaseIds.map((caseId,index)=>({caseId,passed:true,failures:[],requestIndex:index+1,
    correlationId:randomUUID(),requestSha256:String(index+1).repeat(64),readback:{...readback},
    readers:index===2?['charges']:['tutorEvaluation','charges'],
    nativeCheck:index===2?'fee-balance-evidence-check':'tutor-evaluation-evidence-check'}));
  const report={sourceRevision:revision,terminal:true,liveAcceptance:true,egressObservation:false,
    deployment:{origin,sourceRevision:revision,status:'finished',issued:3,completed:3},results,
    cleanup:{verified:true,tutorEvaluationCleanup:true,tutorChargeCleanup:true,protectedOwnerUnchanged:true}};
  assert.ok(hasTutorTuitionProof(results));
  assert.equal(packetVerdict('tutor-tuition',report,origin,revision).status,'passed');
  for(const change of [
    row=>{row.cleanup.tutorChargeCleanup=false;},
    row=>{row.cleanup.tutorEvaluationCleanup=false;},
    row=>{row.cleanup.protectedOwnerUnchanged=false;},
    row=>{row.deployment.completed=2;},
    row=>{row.results[1].correlationId=row.results[0].correlationId;},
    row=>{row.results[1].requestSha256=row.results[0].requestSha256;},
    row=>{row.results[1].readback.chargeCallerDigest='d'.repeat(64);},
    row=>{row.results[2].readers.push('tutorEvaluation');},
    row=>{row.results[2].readback.chargeCallerChecks=7;},
  ]){
    const broken=structuredClone(report);change(broken);
    assert.equal(packetVerdict('tutor-tuition',broken,origin,revision).status,'incomplete');
  }
});
