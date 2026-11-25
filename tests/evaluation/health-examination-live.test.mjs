import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {AffairsWorkspaceError} from '../../server/affairsWorkspace.js';
import {assertHealthMetadataLiveCases,bindHealthMetadataReadback,gradeHealthMetadataLiveCase,
  healthMetadataCase,healthMetadataDispatch,healthMetadataEndpoint,healthMetadataFamily,healthMetadataFixtureMode,
  healthMetadataLiveCases,healthMetadataRequest,readHealthMetadataPages,verifiedHealthMetadataReadback} from './health-examination-live.mjs';
import {createHealthMetadataFixture} from './health-examination-live-fixture.mjs';
import {buildHealthExaminationFixturePlan,healthExaminationFixtureManifest,healthExaminationFixtureReadContract} from './health-examination-fixture-plan.mjs';
import {prepare} from './live-fixtures.mjs';
import {evaluationSuite,options,readReply} from './run.mjs';

const runId='39000000-0000-4000-8000-000000000001';
const owners=Object.fromEntries(['A','B'].map((role,index)=>[role,{
  id:'39000000-0000-4000-8000-00000000000'+(index+2),email:'evaluation-'+role.toLowerCase()+'@example.invalid',runMarker:runId,
}]));
const users=Object.values(owners).map((user,index)=>({...user,token:'synthetic-health-'+index}));
const origin='https://stdedu-123456789-v1-d286.vercel.app';
const projectRef=healthExaminationFixtureManifest.projectRef;
const table=healthExaminationFixtureManifest.table;
const cases=healthMetadataLiveCases();
const get=name=>cases.find(item=>item.id==='account:health-examinations-'+name);
const createPlan=fixtureKey=>buildHealthExaminationFixturePlan({runId,owners,fixtureKey});

test('the isolated runner admits the exact 16 metadata-only cases, exclusively on approved OIDC Preview',async()=>{
  const suite=await evaluationSuite('2026-11-15T00:00:00Z',{caseFamily:healthMetadataFamily});
  assert.equal(suite.cases.length,16);
  assert.deepEqual(suite.cases.map(row=>row.id).sort(),[...healthExaminationFixtureManifest.metadataOnlyCaseIds].sort());
  assert.doesNotThrow(()=>assertHealthMetadataLiveCases(suite.cases));
  assert.throws(()=>assertHealthMetadataLiveCases(suite.cases.slice(1)),/complete frozen/);
  const altered=structuredClone(suite.cases);altered[0].route+='?page=2';
  assert.throws(()=>assertHealthMetadataLiveCases(altered),/frozen metadata-only/);
  const command=['--mode','live','--case-family',healthMetadataFamily,'--fixture-module','tests/evaluation/live-fixtures.mjs'];
  const target=['--origin',origin,'--approved-preview-origin',origin];
  assert.throws(()=>options(command),/Preview origin/);
  assert.throws(()=>options([...command,...target]),/OIDC/);
  assert.throws(()=>options([...command,...target,'--preview-auth','oidc','--max-cases','1']),/complete isolated family/);
  assert.equal(options([...command,...target,'--preview-auth','oidc']).caseFamily,healthMetadataFamily);
  await assert.rejects(prepare({runId,cases,now:'2026-11-15T00:00:00Z',origin:'https://stu.best',caseFamily:healthMetadataFamily,
    fixtureMode:healthMetadataFixtureMode}),{code:'fixture-target',message:/exact protected Preview/});
  await assert.rejects(prepare({runId,cases,now:'2026-11-15T00:00:00Z',origin:'https://stu.best'}),
    {code:'fixture-unsupported',message:/isolated fixture mode/});
});

function readbacks(plan,page,{alter}={}){
  return readHealthMetadataPages(plan,page,users,{origin,readResponse:response=>response.json(),
    fetchImpl:async(url,init)=>{
      const ownerIndex=users.findIndex(user=>init.headers.Authorization==='Bearer '+user.token);
      assert.notEqual(ownerIndex,-1);
      assert.equal(url.origin,origin);
      assert.equal(url.pathname,'/api/affairs-data');
      assert.deepEqual([...url.searchParams.keys()],['scope','page']);
      assert.equal(url.searchParams.get('scope'),'health-examinations');
      assert.equal(init.method,'GET');
      assert.equal(init.redirect,'error');
      assert.equal(init.credentials,'omit');
      const role=ownerIndex===0?'A':'B';
      const contract=healthExaminationFixtureReadContract(plan,{role,page:Number(url.searchParams.get('page'))});
      const packet=structuredClone(contract.expected);
      return Response.json(alter?alter(packet,role):packet);
    },
  });
}

test('selected-page readbacks keep both caller controls, with a positive second caller on empty later pages',async()=>{
  const plan=createPlan('paged:healthExaminations');
  const pages=await readbacks(plan,3);
  assert.deepEqual(pages.map(({role,page,total,count})=>[role,page,total,count]),[['A',3,26,0],['B',1,1,1],['B',3,1,0]]);
  assert.doesNotMatch(JSON.stringify(pages),/FOREIGN HEALTH|PRIVATE HEALTH|39000000/);
  await assert.rejects(readbacks(plan,3,{alter:packet=>({...packet,userId:owners.B.id})}),/readback_mismatch/);
  await assert.rejects(readbacks(plan,2,{alter:packet=>{if(packet.rows.length)packet.rows[0].report_available=true;return packet;}}),/readback_mismatch/);
});

function syntheticSql(){
  let rows=[],loseCommit=false;
  const writes=[],journals=[];
  const sql=(strings,...values)=>{
    if(!strings?.raw)return {values:strings};
    const statement=strings.join(' ');
    if(statement.includes('from auth.users'))return Promise.resolve(Object.values(owners));
    if(statement.includes('from public.affairs_health_examinations where user_id')){
      return Promise.resolve(rows.filter(row=>values[0].values.includes(row.user_id)||values[1].values.includes(row.id)).sort((a,b)=>a.id.localeCompare(b.id)));
    }
    if(statement.includes('insert into public.affairs_health_examinations')){
      const incoming=values[0].values;
      assert.ok(incoming.every(row=>row.report_available===false));
      assert.ok(journals.at(-1).uncertain);
      assert.ok(incoming.every(row=>journals.at(-1).reservedIds.includes(row.id)));
      writes.push('insert');rows.push(...structuredClone(incoming));return Promise.resolve([]);
    }
    if(statement.includes('delete from public.affairs_health_examinations')){
      assert.match(statement,/report_available=false returning id/u);
      const row=rows.find(row=>row.id===values[0]&&row.user_id===values[1]&&!row.report_available);
      if(!row)return Promise.resolve([]);
      writes.push('delete');rows=rows.filter(item=>item!==row);return Promise.resolve([{id:row.id}]);
    }
    if(!statement.trim()||statement.trim()==='for update')return statement;
    assert.fail('Unexpected SQL '+statement);
  };
  const fixture=createHealthMetadataFixture({sql,runId,owners,assertLease:async()=>{},
    persist:async journal=>journals.push(structuredClone(journal)),
    transaction:async work=>{
      const before=structuredClone(rows);
      try{await work();}catch(error){rows=before;throw error;}
      if(loseCommit){loseCommit=false;throw new Error('synthetic commit reply lost');}
    },
  });
  return {fixture,journals,writes,rows:()=>rows,loseCommit:()=>{loseCommit=true;},replace:value=>{rows=structuredClone(value);}};
}

test('transaction journals exact synthetic IDs, reconciles a lost commit and refuses moved or report-bearing rows',async()=>{
  const {fixture,journals,writes,rows,loseCommit,replace}=syntheticSql();
  await fixture.transition('healthExaminations');
  assert.equal(rows().length,4);
  assert.match(await fixture.observe(),/^[a-f0-9]{64}$/u);
  const unchanged=writes.length;
  await fixture.transition('healthExaminations');
  assert.equal(writes.length,unchanged);

  loseCommit();
  await assert.rejects(fixture.transition('paged:healthExaminations'),/reply lost/);
  assert.equal(rows().length,27);
  assert.equal(journals.at(-1).pending,'paged:healthExaminations');
  assert.equal(journals.at(-1).reservedIds.length,31);
  await assert.rejects(fixture.observe(),/reconciliation/);
  const complete=structuredClone(rows());
  rows()[0].report_available=true;
  const before=writes.length;
  await assert.rejects(fixture.cleanup(),/rows_mismatch/);
  assert.equal(writes.length,before);
  replace(complete);
  rows()[0].user_id=randomUUID();
  await assert.rejects(fixture.cleanup(),/rows_mismatch/);
  assert.equal(writes.length,before);
  replace(complete);
  await fixture.cleanup();
  await fixture.verifyAbsent();
  assert.equal(rows().length,0);
  assert.equal(journals.at(-1).uncertain,false);
});

test('a reserved ID collision is detected before journaling and never becomes authorized for deletion',async()=>{
  const {fixture,journals,writes,replace}=syntheticSql();
  const plan=createPlan('healthExaminations');
  replace(plan.rows[table].slice(0,1));
  await assert.rejects(fixture.transition('healthExaminations'),/rows_mismatch/);
  await fixture.cleanup();
  assert.deepEqual(journals,[]);
  assert.deepEqual(writes,[]);
});

async function dispatch(handler,item,token=users[0].token){
  const headers=new Headers(),chunks=[];
  let statusCode=200,body;
  const response={setHeader(name,value){headers.set(name,value);},
    status(code){statusCode=code;return response;},json(value){body=value;},
    write(chunk){chunks.push(chunk);},flushHeaders(){},end(){}};
  await handler({method:'POST',headers:{...(token?{authorization:'Bearer '+token}:{})},body:healthMetadataRequest(item)},response);
  const sourceRevision='e'.repeat(40);
  return {statusCode,...(body?{body,events:[]}:await readReply(new Response(chunks.join(''),{headers}))),
    execution:'live-model',fixtureKey:item.fixtureKey,sourceRevision,correlationId:headers.get('X-Assistant-Request-Id')??undefined,
    deploymentCheck:{verified:true,sourceRevision,requestIndex:1},
    healthMetadataDispatch:healthMetadataDispatch(healthMetadataEndpoint,healthMetadataRequest(item))};
}

test('actual assistant handler uses only health metadata, returns exact scoped facts and never invokes download or Storage transport',async t=>{
  const provider=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='synthetic-health-test-key';
  t.after(()=>{if(provider===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=provider;});
  const blocked=()=>assert.fail('Unrelated account load or public research');
  const handler=createAffairsAssistantHandler({verifyToken:async token=>{
    if(token!==users[0].token)throw new AffairsWorkspaceError('School Affairs sign-in is required.',401);
    return {user:{id:owners.A.id},token,key:'synthetic-publishable',url:'https://'+projectRef+'.supabase.co'};
  },loadSnapshot:blocked,publicResearch:blocked});
  for(const item of cases)await t.test(item.id,async sub=>{
    const oracle=healthMetadataCase(item);
    const plan=createPlan(oracle.family);
    let metadataCalls=0;
    const forbidden=[];
    sub.mock.method(globalThis,'fetch',async(url,init)=>{
      if(url==='https://'+projectRef+'.supabase.co/rest/v1/rpc/affairs_read_health_examinations'){
        metadataCalls++;
        assert.equal(init.method,'POST');
        assert.equal(init.headers.Authorization,'Bearer '+users[0].token);
        const {p_offset}=JSON.parse(init.body);
        assert.equal(p_offset,(oracle.page-1)*25);
        return Response.json(healthExaminationFixtureReadContract(plan,{role:'A',page:oracle.page}).expected);
      }
      if(url==='https://api.openai.com/v1/responses'){
        const body=JSON.parse(init.body);
        const evidence=JSON.parse(body.input[0].content[0].text);
        assert.doesNotMatch(JSON.stringify(evidence),/PRIVATE HEALTH|FOREIGN HEALTH|39000000|health-reports/u);
        assert.equal(body.text.format.name,'answer_evidence_review');
        const review={supported:true,answersQuestion:true,claims:[{claim:'Saved local metadata only.',
          supported:true,evidenceId:'account:healthExaminations',quotes:[],jsonPaths:['/rules']}]};
        return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(review)}]}]});
      }
      forbidden.push(String(url));
      return new Response('{}',{status:403});
    });
    const anonymous=item.fixtureKey==='anonymous';
    const envelope=await dispatch(handler,item,anonymous?'':users[0].token);
    assert.equal(envelope.statusCode,anonymous?401:200);
    assert.equal(metadataCalls,oracle.calls,JSON.stringify({body:envelope.body,events:envelope.events,forbidden}));
    assert.deepEqual(forbidden,[]);
    const observation={rowsSha256:'a'.repeat(64),pages:await readbacks(plan,oracle.page)};
    const before=structuredClone(observation),after=structuredClone(observation);
    envelope.stateBefore={ownedRecordsDigest:before.rowsSha256};
    envelope.stateAfterProposal={ownedRecordsDigest:after.rowsSha256};
    assert.equal(verifiedHealthMetadataReadback(item,envelope),false);
    envelope.fixtureReadback={verified:true,independentGolden:true,projectRef,
      healthMetadata:bindHealthMetadataReadback(item,envelope,{before,after})};
    const grade=gradeHealthMetadataLiveCase(item,envelope);
    assert.ok(grade.passed,JSON.stringify(grade.failures));
    if(!item.id.endsWith('-metadata'))return;
    for(const tamper of [
      value=>{value.deploymentCheck.requestIndex++;},
      value=>{value.healthMetadataDispatch.bodySha256='b'.repeat(64);},
      value=>{value.fixtureReadback.healthMetadata.after.pages[1].total=0;},
      value=>{value.events.push({kind:'account-read:charges:1',status:'complete'});},
      value=>{value.correlationId=randomUUID();},
    ]){
      const copy=structuredClone(envelope);tamper(copy);
      assert.equal(verifiedHealthMetadataReadback(item,copy),false);
    }
  });
});
