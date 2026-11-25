import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {prepare,runTutorEvaluationPreview} from './live-fixtures.mjs';
import {createTutorEvaluationFixture,buildTutorEvaluationHostedFixture,observeTutorEvaluationCallers,
  gradeHostedTutorEvaluation,requestTutorEvaluation,tutorEvaluationFamily,tutorEvaluationFixtureMode,
  tutorEvaluationHostedCases,tutorEvaluationHostedGaps,validateTutorEvaluationHostedCases} from './tutor-evaluation-hosted.mjs';
import {tutorEvaluationCaseManifest} from './tutor-evaluation-cases.mjs';

const runId=randomUUID(),origin='https://stdedu-123456789-v1-d286.vercel.app';
const supabase='https://xiftudmvxphxcjtmfmib.supabase.co';
const owners=Object.fromEntries(['A','B'].map(role=>[role,{id:randomUUID(),email:role.toLowerCase()+'@example.invalid',runMarker:runId}]));
const users=Object.values(owners).map(owner=>({id:owner.id,token:'synthetic-'+owner.id}));
const plan=fixtureKey=>buildTutorEvaluationHostedFixture({runId,owners,fixtureKey});
const cases=tutorEvaluationHostedCases();
const now='2026-11-15T00:00:00Z';
const keys=['user_id','questionnaire_version','ratings','comment','request_id','submitted_at'];
const dbFormat=stamp=>stamp.replace(/Z$/u,'+00:00');

test('operator admits only its own eleven immutable read cases and reports the remaining sixteen plans',async()=>{
  assert.equal(cases.length,11);
  const gaps=tutorEvaluationHostedGaps();
  assert.equal(gaps.length,16);
  assert.deepEqual([...cases.map(row=>row.id),...gaps.map(row=>row.caseId)].sort(),[...tutorEvaluationCaseManifest.eligibleCaseIds].sort());
  assert.equal(gaps.filter(row=>row.reason==='separate_charge_fixture_required').length,3);
  assert.equal(gaps.filter(row=>row.reason==='saved_questionnaire_has_no_requested_detail').length,7);
  assert.doesNotThrow(()=>validateTutorEvaluationHostedCases(cases));
  const drift=structuredClone(cases);drift[0].route='/school-affairs/records';
  assert.throws(()=>validateTutorEvaluationHostedCases(drift),/exact owned read-only/);
  await assert.rejects(prepare({runId,cases,now,origin:'https://stu.best',
    caseFamily:tutorEvaluationFamily,fixtureMode:tutorEvaluationFixtureMode}),{code:'fixture-target'});
  await assert.rejects(prepare({runId,cases,now,origin}),{code:'fixture-target'});
  await assert.rejects(runTutorEvaluationPreview({origin:'https://stu.best',sourceRevision:'a'.repeat(40)}),{code:'fixture-config'});
});

function store(){
  let rows=[],loseCommit=false;
  const journals=[],writes=[];
  const sql=(parts,...values)=>{
    if(!parts?.raw)return parts;
    const text=parts.join('?');
    if(text.includes('from auth.users'))return Object.values(owners);
    if(text.includes('from public.affairs_tutor_evaluations where user_id'))
      return rows.filter(row=>values[0].includes(row.user_id)||values[1].includes(row.request_id));
    if(text.includes('insert into public.affairs_tutor_evaluations')){
      assert.ok(journals.at(-1).pendingFamily);
      assert.ok(values[0].every(row=>journals.at(-1).requestIds.includes(row.request_id)));
      writes.push('insert');rows.push(...structuredClone(values[0]));return [];
    }
    if(text.includes('delete from public.affairs_tutor_evaluations')){
      assert.match(text,/where user_id=\? and questionnaire_version=\? and request_id=\?/u);
      const [owner,version,requestId]=values;
      const row=rows.find(item=>item.user_id===owner&&item.questionnaire_version===version&&item.request_id===requestId);
      if(!row)return [];
      writes.push('delete');rows=rows.filter(item=>item!==row);return [{request_id:row.request_id}];
    }
    if(!text.trim()||text.trim()==='for update')return text;
    assert.fail('Unexpected SQL statement');
  };
  const fixture=createTutorEvaluationFixture({sql,runId,owners,assertLease:async()=>{},
    persist:async journal=>journals.push(structuredClone(journal)),transaction:async work=>{
      const before=structuredClone(rows);
      try{await work();}catch(error){rows=before;throw error;}
      if(loseCommit){loseCommit=false;throw new Error('synthetic lost COMMIT response');}
    }});
  return {fixture,rows:()=>rows,writes,journals,replace:next=>{rows=structuredClone(next);},loseCommit:()=>{loseCommit=true;}};
}

test('the reserved composite keys reconcile normal, blank and empty families and a lost commit',async()=>{
  const {fixture,writes,journals,rows,replace,loseCommit}=store();
  await fixture.transition('tutorEvaluation');
  assert.match(await fixture.observe(),/^[a-f0-9]{64}$/u);
  const oldDigest=await fixture.observe(),prior=writes.length;
  await fixture.transition('tutorEvaluation');assert.equal(writes.length,prior);
  await fixture.transition('blank:tutorEvaluation');
  assert.notEqual(await fixture.observe(),oldDigest);
  assert.equal(rows().find(row=>row.user_id===owners.A.id).comment,'');
  loseCommit();
  await assert.rejects(fixture.transition('empty:tutorEvaluation'),/lost COMMIT/);
  assert.equal(journals.at(-1).pendingFamily,'empty:tutorEvaluation');
  assert.equal(rows().length,1);assert.equal(rows()[0].user_id,owners.B.id);
  await assert.rejects(fixture.observe(),/established/);
  const safe=structuredClone(rows()),attempts=writes.length;
  rows()[0].questionnaire_version=2;
  await assert.rejects(fixture.cleanup(),/safely reconciled/);
  assert.equal(writes.length,attempts);
  replace(safe);
  await fixture.cleanup();
  await fixture.verifyAbsent();
  assert.deepEqual(rows(),[]);
  assert.equal(journals.at(-1).requestIds.length,5);
});

test('unknown composite rows and globally collided request IDs never become disposable',async()=>{
  const storage=store();
  storage.replace([{...plan('tutorEvaluation').rows[0],user_id:randomUUID()}]);
  await assert.rejects(storage.fixture.transition('tutorEvaluation'),/exact disposable/);
  await storage.fixture.cleanup();
  assert.deepEqual(storage.journals,[]);
  assert.deepEqual(storage.writes,[]);
  assert.equal(storage.rows().length,1);
});

function observations(fixture,{directLeak=false,nativeLeak=false,extraVersion=false}={}){
  const identify=init=>users.findIndex(user=>init.headers.Authorization==='Bearer '+user.token)===0?'A':'B';
  return observeTutorEvaluationCallers(fixture,{users,publishable:'synthetic-publishable',origin,readResponse:response=>response.json(),
    previewFetch:async(url,init)=>{
      assert.equal(url.href,origin+'/api/affairs-data?scope=tutor-evaluation');
      assert.equal(init.method,'GET');assert.equal(init.headers.apikey,undefined);
      const expected=structuredClone(fixture.expected[identify(init)]);
      if(expected.evaluation){
        // The jsonb RPC response and the hosted API preserve this key order.
        const {ratings,comment,submittedAt}=expected.evaluation;
        expected.evaluation={comment,ratings,submittedAt:dbFormat(submittedAt)};
      }
      if(nativeLeak)expected.student={number:'PRIVATE STUDENT PROFILE'};
      return Response.json(expected);
    },
    directFetch:async(url,init)=>{
      assert.equal(url.origin,supabase);
      assert.equal(url.pathname,'/rest/v1/affairs_tutor_evaluations');
      assert.equal(url.searchParams.get('select'),keys.join(','));
      assert.equal(url.searchParams.get('user_id'),'in.('+users.map(user=>user.id).join(',')+')');
      assert.equal(init.method,'GET');assert.equal(init.headers.apikey,'synthetic-publishable');
      const owned=fixture.expected[identify(init)].userId;
      const applicable=fixture.rows.filter(row=>directLeak||row.user_id===owned);
      return Response.json(applicable.map(row=>({...row,questionnaire_version:extraVersion?2:row.questionnaire_version,
        submitted_at:dbFormat(row.submitted_at)})));
    },
  });
}

test('both callers get the exact protected DTO and only their own RLS rows even with both IDs in the table query',async()=>{
  const fixture=plan('empty:tutorEvaluation');
  assert.deepEqual((await observations(fixture)).map(row=>row.visibleRows),[0,1]);
  await assert.rejects(observations(fixture,{directLeak:true}),/exact disposable fixture/);
  await assert.rejects(observations(fixture,{nativeLeak:true}),/unexpected owner or profile/);
  await assert.rejects(observations(fixture,{extraVersion:true}),/exact disposable fixture/);
});

function harnessTransport(handler){
  return async (url,init)=>{
    assert.equal(url.href,origin+'/api/affairs-assistant');
    const chunks=[],headers=new Headers();
    let status=200,raw;
    const response={setHeader(name,value){headers.set(name,value);},status(value){status=value;return response;},
      json(value){raw=JSON.stringify(value);},write(chunk){chunks.push(chunk);},end(){},flushHeaders(){}};
    await handler({method:init.method,headers:{authorization:init.headers.Authorization},body:init.body},response);
    return new Response(chunks.join('')||raw,{status,headers});
  };
}

test('actual assistant handles all mounted questions without broad, cross-account, submission or Storage transport',async t=>{
  const previous=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='synthetic-tutor-model';
  t.after(()=>{if(previous===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous;});
  const denied=()=>assert.fail('Unrelated reads or public research are out of scope.');
  const handler=createAffairsAssistantHandler({verifyToken:async token=>{
    assert.equal(token,users[0].token);
    return {url:supabase,key:'synthetic-publishable',token,user:{id:owners.A.id}};
  },loadSnapshot:denied,publicResearch:denied});
  const transport=harnessTransport(handler),correlationIds=new Set();
  for(const item of cases)await t.test(item.id,async sub=>{
    const fixture=plan(item.fixtureKey.slice('live:'.length)),outgoing=[];
    sub.mock.method(globalThis,'fetch',async(url,init)=>{
      outgoing.push(String(url));
      if(url===supabase+'/rest/v1/rpc/affairs_read_tutor_evaluation'){
        assert.equal(init.headers.Authorization,'Bearer '+users[0].token);
        assert.deepEqual(JSON.parse(init.body),{});
        const expected=structuredClone(fixture.expected.A);
        if(expected.evaluation)expected.evaluation.submittedAt=dbFormat(expected.evaluation.submittedAt);
        return Response.json(expected);
      }
      if(url==='https://api.openai.com/v1/responses'){
        const packet=JSON.parse(init.body),data=JSON.parse(packet.input[0].content[0].text);
        const evidence=data.evidence.find(source=>source.id==='account:tutorEvaluation');
        assert.ok(evidence);assert.equal(packet.text.format.name,'answer_evidence_review');
        assert.doesNotMatch(JSON.stringify(data.evidence),/foreign tutor comment|studentnumber|request_id/iu);
        const payload=JSON.parse(evidence.content);
        const review={supported:true,answersQuestion:true,claims:[{claim:'This is the saved local questionnaire state.',
          supported:true,evidenceId:evidence.id,quotes:[],jsonPaths:['/submissionState']},
          ...(payload.submission?.ratings??[]).map(({questionNumber,rating},index)=>({
            claim:'Question '+questionNumber+' had rating '+rating,supported:true,evidenceId:evidence.id,quotes:[],
            jsonPaths:['/submission/ratings/'+index+'/rating'],
          }))]};
        return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(review)}]}]});
      }
      return new Response('{}',{status:403});
    });
    const request=await requestTutorEvaluation({testCase:item,origin,token:users[0].token,fetchImpl:transport,
      privateMarkers:[...Object.values(owners).flatMap(owner=>[owner.id,owner.email]),...fixture.keys],correlationIds});
    assert.deepEqual(outgoing,[supabase+'/rest/v1/rpc/affairs_read_tutor_evaluation']);
    assert.ok(request.envelope.events.some(step=>step.kind==='tutor-evaluation-evidence-check'&&step.status==='complete'));
    const proof={rowsDigest:'a'.repeat(64),callers:await observations(fixture)};
    const outcome=gradeHostedTutorEvaluation(item,request.envelope,proof,structuredClone(proof));
    assert.ok(outcome.passed,JSON.stringify({answer:request.envelope.body.answer,failures:outcome.failures}));
    if(!item.id.endsWith('selected-ratings'))return;
    const changed=structuredClone(request.envelope);
    changed.body.answer+='\nQuestion 7: 5';
    const altered=gradeHostedTutorEvaluation(item,changed,proof,{...proof,rowsDigest:'b'.repeat(64)});
    assert.ok(altered.failures.includes('tutor.ratingClaims'));
    assert.ok(altered.failures.includes('tutor.readback'));
    const wrongOwner={...proof,callers:proof.callers.map((caller,index)=>({
      ...caller,projectionSha256:proof.callers[1-index].projectionSha256,
    }))};
    const swapped=gradeHostedTutorEvaluation(item,request.envelope,wrongOwner,structuredClone(wrongOwner));
    assert.ok(swapped.failures.includes('tutor.readback'));
    assert.ok(swapped.failures.includes('action.ownedRecordsUnchanged'));
  });
});
