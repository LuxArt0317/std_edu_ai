import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {leaveObservationHeader} from '../../server/studentLeaveObservation.js';
import {requestObservedStudentLeave,studentLeaveHostedSelection} from './student-leave-hosted-observation.mjs';
import {buildStudentLeaveFixturePlan,leaveFixtureProject,leaveFixtureTables} from './student-leave-fixture-plan.mjs';
import {runStudentLeaveHostedEvaluation} from './live-fixtures.mjs';

const origin='https://stdedu-1234abcde-v1-d286.vercel.app',sourceRevision='a'.repeat(40);
const prefix='account:student-leave-native-';

test('hosted admission selects eighteen native read cases and excludes other targets and unavailable oracles',async()=>{
  const selected=studentLeaveHostedSelection();
  assert.equal(selected.length,18);
  assert.deepEqual([...new Set(selected.map(row=>row.family))].sort(),['archive','ordinary','prior-date','sibling']);
  assert.throws(()=>studentLeaveHostedSelection([prefix+'taipei-today']),/Invalid Student Leave/);
  assert.throws(()=>studentLeaveHostedSelection([prefix+'dates',prefix+'dates']),/Invalid Student Leave/);
  await assert.rejects(runStudentLeaveHostedEvaluation({origin:'https://stu.best',sourceRevision}),{code:'fixture-config'});
});

test('hosted grading compares the actual handler projection and model review with fixture expectations',async t=>{
  const runId=randomUUID(),ownerId=randomUUID(),key='OFFLINE_LEAVE_OBSERVATION_KEY_'+randomUUID(),token='OFFLINE_FIXTURE_OWNER_TOKEN';
  const env={VERCEL_ENV:'preview',VERCEL_URL:new URL(origin).hostname,VERCEL_GIT_COMMIT_SHA:sourceRevision,
    SUPABASE_SERVICE_ROLE_KEY:key,OPENAI_API_KEY:'OFFLINE_PROVIDER_TEST_KEY'};
  for(const [name,value] of Object.entries(env)){
    const original=process.env[name];
    process.env[name]=value;
    t.after(()=>{if(original===undefined)delete process.env[name];else process.env[name]=original;});
  }
  const binding={runId,projectRef:leaveFixtureProject,origin,sourceRevision,suiteHash:'c'.repeat(64),
    owners:{A:{id:ownerId,email:'evaluation.student@example.invalid',runMarker:runId},
      B:{id:randomUUID(),email:'evaluation.school@example.invalid',runMarker:runId}}};
  const [{testCase,family}]=studentLeaveHostedSelection([prefix+'dates']);
  const plan=buildStudentLeaveFixturePlan({binding,family});
  const base='https://'+binding.projectRef+'.supabase.co';
  const handler=createAffairsAssistantHandler({
    verifyToken:async returned=>{
      assert.equal(returned,token);
      return {url:base,key:'OFFLINE_PUBLIC',token,user:{id:ownerId,email:binding.owners.A.email,user_metadata:{assistant_evaluation_run:runId}}};
    },
    loadSnapshot:async()=>assert.fail('Broad snapshot was entered'),
    publicResearch:async()=>assert.fail('Public research was entered'),
  });
  const originalFetch=globalThis.fetch;
  t.after(()=>{globalThis.fetch=originalFetch;});
  const providerFailures=[];
  globalThis.fetch=async (input,init)=>{
    try{
      const url=new URL(input);
      if(url.origin===base){
        assert.equal(url.pathname,'/rest/v1/'+leaveFixtureTables.forms);
        assert.equal(init.method,'GET');
        assert.equal(init.headers.Authorization,'Bearer '+token);
        assert.equal(url.searchParams.get('user_id'),'eq.'+ownerId);
        const selected=url.searchParams.get('select').split(',');
        assert.deepEqual(selected,['id','user_id','service_key','record_type','starts_on','ends_on']);
        const rows=plan.rows[leaveFixtureTables.forms].filter(row=>row.user_id===ownerId)
          .map(row=>Object.fromEntries(selected.map(field=>[field,row[field]])));
        assert.equal(rows.length,1);
        return Response.json(rows,{headers:{'content-range':'0-0/1'}});
      }
      assert.equal(url.href,'https://api.openai.com/v1/responses');
      const body=JSON.parse(init.body);
      assert.equal(body.text.format.name,'answer_evidence_review');
      assert.doesNotMatch(init.body,/evaluationLeaveProbe|PRIVATE|OFFLINE_FIXTURE_OWNER_TOKEN/u);
      const expected={supported:true,answersQuestion:true,claims:[{claim:'Saved leave dates',supported:true,evidenceId:'account:leaveRecords',
        jsonPaths:['/records/0/startsOn','/records/0/endsOn'],quotes:[]}]};
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(expected)}]}]});
    }catch(error){providerFailures.push(error);throw error;}
  };
  const calls={plan,testCase,key,token,seenCorrelations:new Set()};
  const endpoint=({stripReceipt=false,changeAnswer=false}={})=>async(url,init)=>{
    assert.equal(url,origin+'/api/affairs-assistant');
    const headers=new Headers(),result={};
    const response={setHeader(name,value){headers.set(name,value);},status(status){result.status=status;return response;},json(body){result.body=body;}};
    await handler({method:init.method,headers:{authorization:init.headers.Authorization,host:new URL(url).hostname},body:init.body},response);
    if(stripReceipt)headers.delete(leaveObservationHeader);
    if(changeAnswer)result.body.answer='A different answer from the verified response.';
    return Response.json(result.body,{status:result.status,headers});
  };
  const verified=await requestObservedStudentLeave({...calls,fetchImpl:endpoint()});
  assert.deepEqual(providerFailures,[]);
  assert.equal(verified.passed,true,JSON.stringify(verified.failures));
  assert.equal(verified.observed,true);
  assert.equal(verified.attempts,1);
  assert.equal(verified.reads,1);
  assert.equal(verified.completedModelCalls,1);
  assert.equal(verified.completedReview,true);
  assert.match(verified.receiptDigest,/^[a-f0-9]{64}$/u);
  assert.doesNotMatch(JSON.stringify(verified),/OFFLINE|example\.invalid|2026-11-09|2026-11-10/u);
  for(const failure of [{stripReceipt:true},{changeAnswer:true}]){
    const proof=await requestObservedStudentLeave({...calls,fetchImpl:endpoint(failure)});
    assert.equal(proof.passed,false);
    assert.equal(proof.observed,false);
    assert.deepEqual(proof.failures,['observation.missing_or_invalid']);
  }
});
