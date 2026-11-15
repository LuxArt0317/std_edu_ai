import assert from 'node:assert/strict';
import test from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import read from '../../api/affairs-data.ts';
import {readClearanceEvidence} from '../../server/accountClearanceEvidence.js';
import change from '../../api/affairs-action.ts';
import manage from '../../api/affairs-manage.ts';
import {buildClearanceApplicationCases,clearanceApplicationCaseManifest,clearanceApplicationFixtureForCase,
  gradeClearanceApplicationCase} from './clearance-application-cases.mjs';

const cases=buildClearanceApplicationCases();
const {paths,scope,view,owners}=clearanceApplicationCaseManifest;
const frozen=suffix=>cases.find(row=>row.id==='account:clearance-applications-'+suffix);
const origin='https://xiftudmvxphxcjtmfmib.supabase.co',key='clearance-packet-synthetic-key';
const tokens=Object.fromEntries(Object.keys(owners).map(side=>[side,'offline-clearance-packet-account-token-'+side]));
const nativeQuery={scope,view};
const denialText={
  'foreign-account':/can’t show another student’s graduation clearance records/u,
  'write-submit':/No action was performed/u,
  'write-approve':/No action was performed/u,
  'manager-boundary':/cannot access clearance manager queues/u,
};

export function clearanceOwnedFixture(){
  const A=structuredClone(clearanceApplicationFixtureForCase(frozen('office-statuses')).dto);
  const B={userId:owners.B,targetId:owners.B,terms:[],applications:[],periods:[]};
  return {A,B};
}

function memoryDatabase(){
  const stored=clearanceOwnedFixture();
  return {
    snapshot:async()=>structuredClone(stored),
    async rpc(side,procedure,payload){
      if(procedure==='affairs_read_graduation_clearance')
        return payload.p_view==='manage'?new Response(null,{status:403}):Response.json(stored[side]);
      return new Response(null,{status:side==='B'||payload.p_action==='review_clearance_office'?403:409});
    },
  };
}

export async function exerciseClearanceOwnedPacket(t,database){
  for(const [name,value] of Object.entries({VITE_SUPABASE_URL:origin,VITE_SUPABASE_PUBLISHABLE_KEY:key,OPENAI_API_KEY:key})){
    const before=process.env[name];
    process.env[name]=value;
    t.after(()=>{if(before===undefined)delete process.env[name];else process.env[name]=before;});
  }
  const requests=[],errors=[],projections=[],model=[];
  const assistant=createAffairsAssistantHandler({loadSnapshot:async()=>assert.fail('Unexpected broad snapshot'),
    publicResearch:async()=>assert.fail('Unexpected public lookup'),
    readers:{async graduationClearance(account,options){
      const projected=await readClearanceEvidence(account,options);
      projections.push(structuredClone(projected));
      return projected;
    }},
  });
  const realNow=Date.now.bind(Date);
  let requestClock=realNow()+4_000_000;
  t.mock.method(Date,'now',()=>Math.max(realNow(),requestClock));
  const fetchFixture=async(input,init)=>{
    const url=new URL(input),payload=init.body&&JSON.parse(init.body);
    if(url.origin==='https://api.openai.com'){
      assert.equal(payload.text.format.name,'answer_evidence_review');
      const {evidence}=JSON.parse(payload.input[0].content[0].text);
      assert.deepEqual(evidence.map(source=>source.id),['account-scope','account:graduationClearance']);
      assert.doesNotMatch(JSON.stringify(evidence),/16100000|offline-clearance|course-catalog/iu);
      const selected=evidence[1],clearance=JSON.parse(selected.content);
      model.push({selected,clearance});
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({
        supported:true,answersQuestion:true,claims:[{claim:'The scoped clearance query has the stated read state.',evidenceId:selected.id,
          jsonPaths:['/readState'],quotes:[],supported:true}],
      })}]}]});
    }
    assert.equal(url.origin,origin);
    const headers=new Headers(init.headers),side=Object.keys(tokens).find(name=>headers.get('authorization')==='Bearer '+tokens[name]);
    assert.ok(side);
    assert.equal(headers.get('apikey'),key);
    if(url.pathname==='/auth/v1/user')return Response.json({id:owners[side],identities:[{provider:'google'}]});
    const procedure=url.pathname.split('/').at(-1);
    assert.equal(url.pathname,'/rest/v1/rpc/'+procedure);
    assert.ok(['affairs_read_graduation_clearance','affairs_change_graduation_clearance'].includes(procedure));
    assert.equal(init.method,'POST');
    assert.equal(init.redirect,'error');
    requests.push({side,procedure,payload});
    return database.rpc(side,procedure,payload);
  };
  t.mock.method(globalThis,'fetch',(...args)=>fetchFixture(...args).catch(error=>{errors.push(error);throw error;}));
  async function invoke(handler,side,{query,body}={}){
    const headers=side?{authorization:'Bearer '+tokens[side]}:{'x-forwarded-for':'192.0.2.101'};
    const result={statusCode:0,body:null};
    const out={setHeader(){},status(code){result.statusCode=code;return this;},json(data){result.body=data;}};
    await handler({method:query?'GET':'POST',headers,query,body},out);
    if(errors.length)throw new AggregateError(errors,'Unexpected clearance packet request');
    return result;
  }
  const baseline=await database.snapshot(),fixture=clearanceOwnedFixture();
  const readback=async()=>{
    for(const side of Object.keys(owners))
      assert.deepEqual(await invoke(read,side,{query:nativeQuery}),{statusCode:200,body:fixture[side]});
    assert.deepEqual(await database.snapshot(),baseline);
  };
  for(const [suffix,side,route] of [
    ['office-statuses','A',paths.status],['cashier-note-library-status','A',paths.status],['library-notes','A',paths.status],
    ['windows','A',paths.apply],['status-and-windows','A',paths.status],['status-and-windows','A',paths.apply],
    ['empty-applications','B',paths.status],
    ['empty-windows','B',paths.apply],['public-guide','A',paths.status],['foreign-account','A',paths.status],
    ['write-submit','A',paths.apply],['write-approve','A',paths.status],['manager-boundary','A',paths.status],['anonymous',null,paths.status],
  ]){
    await readback();
    const row=frozen(suffix),before=requests.length,projectionBefore=projections.length,modelBefore=model.length;
    requestClock+=65_000;
    const reply=await invoke(assistant,side,{body:{question:row.question,route,history:row.history??[],stream:false,consentedResearchUse:false}});
    assert.equal(reply.statusCode,row.expected.expectedStatusCode??200,suffix);
    assert.equal(reply.body.proposedAction,undefined,suffix);
    if(denialText[suffix]){
      assert.match(reply.body.answer,denialText[suffix],suffix);
      assert.doesNotMatch(reply.body.answer,/QA Clearance|QA-CASH|QA-LIB/u,suffix);
    }
    const privateCalls=requests.slice(before);
    assert.deepEqual(privateCalls,row.nativeExpectation.calls?[{side,procedure:'affairs_read_graduation_clearance',
      payload:{p_view:'student',p_term:null,p_student:null}}]:[],suffix);
    assert.doesNotMatch(JSON.stringify(reply.body),/16100000|api\/affairs-manage|private\/clearance\.pdf/u,suffix);
    const sources=reply.body.citations?.map(({chunkId,url})=>({sourceId:chunkId,url}))??[];
    for(const binding of row.expected.requiredSourceBindings)
      assert.ok(sources.some(source=>source.sourceId===binding.sourceId&&source.url===binding.url),suffix);
    if(row.nativeExpectation.calls){
      const projected=projections[projectionBefore];
      assert.ok(projected,suffix);
      assert.deepEqual(reply.body.verification,{status:'verified',attempts:1},suffix);
      if(row.nativeExpectation.periodsSelected&&row.nativeExpectation.periodsReturned>0)assert.equal(model.length-modelBefore,1,suffix);
      else {
        assert.equal(model.length,modelBefore,suffix);
        assert.ok(reply.body.activity.some(row=>row.kind==='graduation-clearance-evidence-check'&&row.status==='complete'),suffix);
      }
      const graded=gradeClearanceApplicationCase(row,{...reply,execution:'deterministic',fixtureKey:row.fixtureKey},{
        observation:{readCalls:privateCalls.length,queries:[nativeQuery],writes:[],storage:[],result:projected},
      });
      assert.deepEqual(graded.failures.map(c=>c.id),[],suffix);
    }
    await readback();
  }
  const applyQuestion={question:'Where can I apply for graduation clearance?',route:paths.status};
  const directory=await invoke(assistant,'A',{body:applyQuestion});
  assert.deepEqual(directory.body.citations.map(row=>row.url),[paths.apply]);
  const {termId}=fixture.A.periods[0];
  const receiptId='16100000-0000-4000-8000-000000000101';
  const submit={kind:'submit_graduation_clearance',payload:{term_id:termId,period_version:1,candidate_version:1,request_id:receiptId,acknowledged:true}};
  const before=requests.length;
  assert.equal((await invoke(read,'A',{query:{...nativeQuery,user_id:owners.B}})).statusCode,400);
  assert.equal((await invoke(change,'A',{body:{...submit,payload:{...submit.payload,acknowledged:false}}})).statusCode,400);
  assert.equal((await invoke(change,'A',{body:{...submit,payload:{...submit.payload,user_id:owners.B}}})).statusCode,400);
  assert.equal(requests.length,before);
  assert.equal((await invoke(read,'B',{query:{scope,view:'manage',term:termId,user_id:owners.A}})).statusCode,403);
  assert.equal((await invoke(change,'B',{body:submit})).statusCode,403);
  assert.equal((await invoke(change,'A',{body:submit})).statusCode,409);
  assert.equal((await invoke(manage,'B',{body:{kind:'review_clearance_office',payload:{application_id:fixture.A.applications[0].id,
    office:'library',decision:'cleared',note:'',expected_version:1,request_id:receiptId}}})).statusCode,403);
  await readback();
}

test('frozen graduation clearance questions preserve both native caller scopes and action boundaries',async t=>{
  await exerciseClearanceOwnedPacket(t,memoryDatabase());
});
