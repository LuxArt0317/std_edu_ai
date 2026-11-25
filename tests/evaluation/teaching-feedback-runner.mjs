import {isDeepStrictEqual} from 'node:util';
import {buildTeachingFeedbackNativeCases,gradeTeachingFeedbackNativeCase} from './teaching-feedback-native-cases.mjs';
import {gradeCase} from './grading.mjs';

const prefix='account:teaching-native-';
const requirement='offline_native_teaching_feedback';
const reason='teaching_fixture_and_request_observation_unmounted';
const detail='Teaching feedback has independent offline oracles, but no isolated live fixture and trusted request-bound raw-read/selected-evidence observation. No assistant request is authorized by this case registration.';

/** Declaration in the main denominator is not fixture or execution proof.
 * coveredTools describes the existing independent tool policy; it does not
 * manufacture an event, result, fixture binding or successful read. */
export function teachingFeedbackRunnerCases(){
  return structuredClone(buildTeachingFeedbackNativeCases()).map(row=>({...row,coveredTools:[...row.toolPolicy.required],
    coveragePurpose:'Independent teaching question and tool inventory; not proof of live fixture setup, model behavior or browser acceptance.'}));
}
const canonical=new Map(teachingFeedbackRunnerCases().map(row=>[row.id,row]));

export function teachingFeedbackCaseAdmission(testCase){
  if(!(typeof testCase?.id==='string'&&testCase.id.startsWith(prefix))&&testCase?.fixtureRequirement!==requirement)return null;
  const original=canonical.get(testCase.id);
  return {caseId:testCase.id,eligible:false,reason:original&&isDeepStrictEqual(testCase,original)?reason:'teaching_case_definition_changed',
    detail:original&&isDeepStrictEqual(testCase,original)?detail:'The independent teaching case definition was changed or is unknown.'};
}

export function assertTeachingFeedbackCaseReady(testCase){
  const admission=teachingFeedbackCaseAdmission(testCase);
  if(admission)throw Object.assign(new Error(admission.detail),{code:admission.reason});
}

/** Use the independent teaching oracle, not only the generic answer grader.
 * There is deliberately no observation option here yet. Runtime JSON, SSE,
 * adapter goldens and model self-verdicts are not trusted read observations.
 * A later mounted collector must bind request/caller/revision and compare raw
 * DTOs and selected evidence separately before this setup gate can be removed. */
export function gradeEvaluationCase(testCase,envelope,options={}){
  const admission=teachingFeedbackCaseAdmission(testCase);
  if(!admission)return gradeCase(testCase,envelope,options);
  const original=canonical.get(testCase.id);
  const result=original?gradeTeachingFeedbackNativeCase(original,envelope):gradeCase(testCase,envelope);
  const check={id:'teaching.setupUnavailable',passed:false,detail:admission.detail};
  const definition={id:'teaching.caseDefinition',passed:admission.reason===reason,detail:'The question, independent facts, privacy boundaries and tool policy remain unchanged.'};
  const checks=[...result.checks,definition,check];
  return {...result,passed:false,checks,failures:checks.filter(item=>!item.passed)};
}

export function teachingFeedbackSetupSummary(cases){
  const admissions=cases.map(teachingFeedbackCaseAdmission).filter(Boolean);
  return {registered:admissions.length,liveEligible:0,observationsMounted:false,admissions};
}
