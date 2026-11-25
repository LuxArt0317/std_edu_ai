import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {readInternshipEvidence} from '../../server/accountInternshipEvidence.js';
import {runAnswerVerification} from '../../server/answerVerification.js';
import {internshipObservationHeader,openInternshipObservation} from '../../server/internshipObservation.js';
import {formatSupplementalAccountAnswers} from '../../server/supplementalAccountAnswers.js';
import {buildInternshipFixturePlan} from './internship-native-fixture.mjs';
import {internshipHostedCases,requestInternshipHostedCase} from './internship-native-hosted.mjs';

const origin='https://stdedu-abcdef012-v1-d286.vercel.app';
const sourceRevision='a'.repeat(40);
const runId='53010000-0000-4000-8000-000000007200';
const owners={A:'53010000-0000-4000-8000-000000007201',B:'53010000-0000-4000-8000-000000007202'};
const key='SYNTHETIC_INTERN_REVIEW_TEST_KEY_'.repeat(2),token='SYNTHETIC_CALLER';
const plan=buildInternshipFixturePlan({runId,owners});
const [testCase]=internshipHostedCases(['account:internship-native-contract-list']);
const env={VERCEL_ENV:'preview',VERCEL_URL:new URL(origin).host,VERCEL_GIT_COMMIT_SHA:sourceRevision,SUPABASE_SERVICE_ROLE_KEY:key};
const database='https://xiftudmvxphxcjtmfmib.supabase.co';
const columns=['id','user_id','service_key','record_type','title','status'];

async function replay({tamper,extraReadActivity=false,providerFailure=false,native=false,omitNativeActivity=false}={}){
  let reads=0;
  const answer=await requestInternshipHostedCase({testCase,plan,origin,sourceRevision,runId,token,key,privateMarkers:[token,owners.A,owners.B],
    correlations:new Set(),readResponse:response=>response.json(),fetchImpl:async(endpoint,request)=>{
      assert.equal(endpoint.href,origin+'/api/affairs-assistant');
      const input=JSON.parse(request.body),correlationId=randomUUID();
      const signed=openInternshipObservation({body:input,identity:{id:owners.A,email:'evaluation.student@example.invalid',runMarker:runId},correlationId},env);
      assert.ok(signed);
      const activity=new Map();
      const emit=step=>activity.set(step.kind,step);
      const load=async ordinal=>{
        const record=await signed.observe(({observeRead})=>readInternshipEvidence({url:database,key:'SYNTHETIC_PUBLISHABLE',
          token,user:{id:owners.A}},{question:input.question,route:input.route,history:input.history},{
          observeRead,
          fetchImpl:async(url,options)=>{
            reads++;
            assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
            assert.equal(url.origin,database);
            assert.equal(url.searchParams.get('user_id'),'eq.'+owners.A);
            assert.equal(url.searchParams.get('record_type'),'eq.contract');
            assert.equal(url.searchParams.get('select'),columns.join(','));
            const rows=plan.records.filter(row=>row.user_id===owners.A&&row.record_type==='contract')
              .map(row=>Object.fromEntries(columns.map(column=>[column,row[column]])));
            return Response.json(rows,{headers:{'content-range':'0-1/2'}});
          },
        }));
        emit({kind:'account-read:internshipRecords:'+ordinal,status:'complete',label:'Read own contract records',detail:'Exact scope'});
        return record;
      };
      const first=await load(1),initialAnswer=formatSupplementalAccountAnswers([first],{question:input.question});
      const result=await runAnswerVerification({question:input.question,initialAnswer,onProgress:emit,allowDeeperReview:true,
        loadEvidence:async({attempt})=>[(attempt===1?first:await load(attempt)).evidence],
        verify:async({attempt,candidate,evidence})=>{
          if(native){
            assert.equal(attempt,1);
            assert.deepEqual(evidence,[first.evidence]);
            assert.deepEqual(candidate,initialAnswer);
            return {ok:true};
          }
          if(providerFailure&&attempt===1)throw new Error('Controlled non-completion');
          signed.modelCompleted('answer_evidence_review');
          return {ok:attempt===(providerFailure?2:3),reason:'unsupported_claims',feedback:['Check the two saved contract statuses.']};
        },
        repair:async({candidate})=>{
          signed.modelCompleted('correct_grounded_answer');
          return candidate;
        }});
      if(native){
        assert.equal(result.verification?.status,'verified');
        signed.nativeCheckCompleted();
        if(!omitNativeActivity)emit({kind:'internship-evidence-check',status:'complete',label:'Verified exact saved records',detail:'Exact selected fields'});
      }
      const body={...result,grounding:{source:'account',webSearched:false},activity:[...activity.values()]};
      if(extraReadActivity)body.activity.push({kind:'account-read:internshipRecords:3',status:'complete'});
      const receipt=signed.finish(body,true);
      assert.ok(receipt);
      if(tamper)body.activity=body.activity.filter(step=>step.kind!=='verification-deeper-review');
      return Response.json(body,{headers:{'X-Assistant-Request-Id':correlationId,[internshipObservationHeader]:receipt}});
    }});
  return {answer,reads};
}

test('the exact protected grader credits a genuine third review of the same two scoped reads',async()=>{
  const {answer,reads}=await replay();
  assert.deepEqual(answer.failures,[]);
  assert.equal(answer.passed,true);
  assert.equal(answer.observed,true);
  assert.equal(reads,2);
  assert.equal(answer.readCount,2);
  assert.equal(answer.completedEvidenceReviews,3);
  assert.equal(answer.verificationChecks,3);
  assert.equal(answer.completedModelCalls,5);
  assert.equal(answer.readDigests.length,2);
  assert.equal(answer.readDigests[0],answer.readDigests[1]);
  assert.equal(answer.projectionDigests[0],answer.projectionDigests[1]);
});

test('a forged activity or a reported third private read cannot satisfy the exact protected grade',async()=>{
  const tampered=await replay({tamper:true});
  assert.equal(tampered.answer.passed,false);
  assert.ok(tampered.answer.failures.includes('observation.missing_or_mismatched'));
  assert.ok(tampered.answer.failures.includes('answer.verification.deeperObserved'));

  const extra=await replay({extraReadActivity:true});
  assert.equal(extra.answer.passed,false);
  assert.ok(extra.answer.failures.includes('observation.unrelated_activity'));
  assert.ok(extra.answer.failures.includes('answer.verification.deeperObserved'));
});

test('a verified answer with incomplete provider receipts remains diagnostic-only',async()=>{
  const {answer,reads}=await replay({providerFailure:true});
  assert.equal(reads,2);
  assert.equal(answer.observed,true);
  assert.equal(answer.verificationChecks,2);
  assert.equal(answer.completedEvidenceReviews,1);
  assert.equal(answer.passed,false);
  assert.deepEqual(answer.failures,['observation.model_review']);
});

test('the grade requires a signed native match and its actual terminal activity without a provider call',async()=>{
  const direct=await replay({native:true});
  assert.equal(direct.answer.passed,true);
  assert.equal(direct.answer.execution,'live-native');
  assert.equal(direct.answer.verificationMethod,'native-exact');
  assert.equal(direct.answer.completedNativeCheck,true);
  assert.equal(direct.answer.completedModelCalls,0);
  assert.equal(direct.answer.readCount,1);

  const missing=await replay({native:true,omitNativeActivity:true});
  assert.equal(missing.answer.passed,false);
  assert.equal(missing.answer.observed,true);
  assert.equal(missing.answer.completedNativeCheck,false);
  assert.ok(missing.answer.failures.includes('observation.native_check'));
});
