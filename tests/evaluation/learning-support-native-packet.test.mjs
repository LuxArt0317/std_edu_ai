import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {isDeepStrictEqual} from 'node:util';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import read from '../../api/affairs-data.ts';
import change from '../../api/affairs-action.ts';
import {buildLearningSupportNativePlan,learningSupportNativeCaseIds,verifyLearningSupportNativePacket} from './learning-support-native-packet.mjs';

const origin='https://xiftudmvxphxcjtmfmib.supabase.co',key='qa-local-learning-support-key';
const uiStamp='2026-11-18T16:41:00+00:00',opStamp='2026-11-18T16:40:59+00:00',submitStamp='2026-11-18T16:42:00+00:00';

function localDatabase(plan,{duplicateOnReplay}={}){
  const state={rows:structuredClone(plan.rows).sort((a,b)=>a.id.localeCompare(b.id)),operations:[]};
  const ownRow=(id,actor)=>state.rows.find(row=>row.id===id&&row.user_id===actor);
  const sortOperations=()=>state.operations.sort((a,b)=>(a.actor+'/'+a.request_id).localeCompare(b.actor+'/'+b.request_id));
  return {
    snapshot:()=>structuredClone(state),
    rpc(procedure,input,actor){
      if(procedure==='affairs_read_learning_support'){
        assert.deepEqual(input,{p_view:'mine',p_page:1});
        const rows=state.rows.filter(row=>row.user_id===actor).sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at));
        return Response.json({userId:actor,canReview:false,view:'mine',page:1,total:rows.length,rows:rows.map(row=>({
          id:row.id,ownerId:row.user_id,topic:row.topic,details:row.details,status:row.status,reviewNote:row.review_note,
          version:row.version,submittedAt:row.submitted_at,updatedAt:row.updated_at,
        }))});
      }
      assert.equal(procedure,'affairs_change_learning_support');
      const {p_kind:kind,p_payload:payload}=input;
      assert.ok(['withdraw','submit'].includes(kind));
      const prior=state.operations.find(op=>op.actor===actor&&op.request_id===payload.request_id);
      if(prior){
        if(prior.kind!==kind||!isDeepStrictEqual(prior.payload,payload))return new Response(null,{status:409});
        if(duplicateOnReplay===kind){
          state.operations.push({...prior,request_id:randomUUID()});
          sortOperations();
        }
        return Response.json(prior.result);
      }
      const submit=kind==='submit';
      const current=submit?{id:randomUUID(),user_id:actor,topic:payload.topic,details:payload.details,status:'submitted',
        review_note:'',version:1,submitted_at:submitStamp,updated_at:submitStamp}:ownRow(payload.id,actor);
      if(!current)return new Response(null,{status:404});
      if(submit){
        state.rows.push(current);
        state.rows.sort((a,b)=>a.id.localeCompare(b.id));
      }else{
        if(payload.expected_version!==current.version||!['submitted','in_review'].includes(current.status))
          return new Response(null,{status:409});
        current.version++;current.status='withdrawn';current.updated_at=uiStamp;
      }
      const result={id:current.id,requestId:payload.request_id,status:current.status,version:current.version};
      state.operations.push({actor,request_id:payload.request_id,target_id:current.id,kind,payload,result,occurred_at:submit?submitStamp:opStamp});
      sortOperations();
      return Response.json(result);
    },
    table(query,actor){
      assert.equal(query.get('select'),'id,user_id,status,version,submitted_at');
      assert.equal(query.get('user_id'),'eq.'+actor);
      const id=query.get('id')?.slice(3);
      assert.equal(query.get('limit'),id?'1':'2');
      if(!id)assert.equal(query.get('order'),'submitted_at.desc,id.asc');
      return Response.json(state.rows.filter(row=>row.user_id===actor&&(!id||row.id===id)
        &&(!query.has('status')||['submitted','in_review'].includes(row.status)))
        .sort((a,b)=>Date.parse(b.submitted_at)-Date.parse(a.submitted_at)).slice(0,Number(query.get('limit')))
        .map(({id,user_id,status,version,submitted_at})=>({id,user_id,status,version,submitted_at})));
    },
  };
}

function mount(t,{duplicateOnReplay,crossReadback=false}={}){
  const plan=buildLearningSupportNativePlan(randomUUID(),{A:randomUUID(),B:randomUUID()});
  const database=localDatabase(plan,{duplicateOnReplay});
  const {A,B}=plan.owners,tokens={A:'qa-controlled-learning-support-'+A,B:'qa-controlled-learning-support-'+B};
  for(const [name,value] of [['VITE_SUPABASE_URL',origin],['VITE_SUPABASE_PUBLISHABLE_KEY',key]]){
    const before=process.env[name];process.env[name]=value;
    t.after(()=>{if(before===undefined)delete process.env[name];else process.env[name]=before;});
  }
  const realNow=Date.now.bind(Date);
  let requestClock=realNow()+4_000_000;
  t.mock.method(Date,'now',()=>Math.max(realNow(),requestClock));
  const wrong=[],operations=[];
  const denied=name=>async()=>{wrong.push(name);throw new Error('Unexpected broader data route.');};
  const assistant=createAffairsAssistantHandler({loadSnapshot:denied('snapshot'),answerAccount:denied('model'),publicResearch:denied('public research')});
  const guest=createResearchAssistantHandler();
  t.mock.method(globalThis,'fetch',async(target,init)=>{
    const url=new URL(target),headers=new Headers(init?.headers);
    const role=Object.keys(tokens).find(side=>headers.get('authorization')==='Bearer '+tokens[side]);
    if(url.origin!==origin||headers.get('apikey')!==key||!role)return denied('credential or target')();
    const actor=plan.owners[role];
    if(url.pathname==='/auth/v1/user')return Response.json({id:actor,identities:[{provider:'google'}]});
    assert.equal(init.redirect,'error');
    if(url.pathname==='/rest/v1/affairs_learning_support_requests'){
      assert.equal(init.method,'GET');
      return database.table(url.searchParams,actor);
    }
    assert.equal(init.method,'POST');
    const procedure=url.pathname.split('/').at(-1);
    if(!['affairs_read_learning_support','affairs_change_learning_support'].includes(procedure))return denied('bad procedure')();
    const input=JSON.parse(init.body);
    if(procedure==='affairs_change_learning_support')operations.push({actor,input});
    return database.rpc(procedure,input,actor);
  });
  async function invoke(handler,actor,{body,query}={}){
    const headers=actor==='guest'?{'x-forwarded-for':'192.0.2.189'}:{authorization:'Bearer '+tokens[actor]};
    const result={status:0,body:null,headers:new Headers()};
    const out={setHeader(name,value){result.headers.set(name,value);},status(code){result.status=code;return this;},
      json(value){result.body=value;}};
    await handler({method:body?'POST':'GET',headers,body,query},out);
    return {status:result.status,body:result.body,activity:result.body?.activity??[],correlationId:result.headers.get('x-assistant-request-id')};
  }
  return {wrong,operations,options:{plan,readRaw:database.snapshot,
    readNative:actor=>invoke(read,crossReadback&&actor==='A'?'B':actor,{query:{scope:'learning-support',page:'1'}}),
    async ask(actor,question,route){
      requestClock+=65_000;
      return invoke(actor==='guest'?guest:assistant,actor,{body:{question,route,stream:false,consentedResearchUse:false}});
    },
    confirm:(actor,body)=>invoke(change,actor,{body}),
    async markSubmission(){
      assert.ok(operations.every(row=>row.input.p_kind==='withdraw'));
    },
  }};
}

test('native 27-1 evaluation checks both callers and both confirmed mutations through the actual HTTP handlers',async t=>{
  const {options,wrong,operations}=mount(t);
  const {passed,cases}=await verifyLearningSupportNativePacket(options);
  assert.equal(passed,true);
  assert.deepEqual(cases.map(row=>row.caseId),learningSupportNativeCaseIds);
  assert.deepEqual(cases.filter(row=>row.before!==row.after).map(row=>row.caseId),
    ['learning-support:confirmed','learning-support:submit-confirmed']);
  const receipts=cases.filter(row=>row.receipt);
  assert.equal(receipts.length,4);
  for(const index of [0,2]){
    const [confirmed,replayed]=receipts.slice(index,index+2);
    assert.equal(confirmed.request,replayed.request);
    assert.equal(confirmed.receipt,replayed.receipt);
    assert.equal(confirmed.after,replayed.after);
  }
  const submits=operations.filter(row=>row.input.p_kind==='submit');
  assert.equal(submits.length,3);
  assert.ok(submits.every(row=>row.actor===options.plan.owners.A));
  assert.deepEqual(submits[0],submits[1]);
  assert.equal(submits[2].input.p_payload.request_id,submits[0].input.p_payload.request_id);
  assert.notEqual(submits[2].input.p_payload.details,submits[0].input.p_payload.details);
  assert.deepEqual(wrong,[]);
  assert.doesNotMatch(JSON.stringify(cases),/QA |Withdrawn|qa-controlled|status of my/i);
});

test('independent 27-1 evidence rejects an owner-mismatched readback even when both calls return 200',async t=>{
  const {options}=mount(t,{crossReadback:true});
  await assert.rejects(verifyLearningSupportNativePacket(options),/caller-owned-native-page/u);
});

test('independent 27-1 evidence rejects a duplicate stored operation even when the replay returns an identical receipt',async t=>{
  const {options}=mount(t,{duplicateOnReplay:'withdraw'});
  await assert.rejects(verifyLearningSupportNativePacket(options),/replay-after-exact-raw-state/u);
});

test('the native packet refuses every confirmation if exact withdrawal journaling fails',async t=>{
  const {options}=mount(t);
  const seen=[];
  await assert.rejects(verifyLearningSupportNativePacket({...options,
    async markWithdrawal(command){
      seen.push(command);
      throw Error('synthetic journal failure');
    },confirm(){assert.fail('Confirmation started without a durable withdrawal journal');},
  }),/synthetic journal failure/u);
  assert.equal(seen.length,1);
  assert.equal(seen[0].payload.id,options.plan.target.id);
  assert.equal(seen[0].payload.expected_version,2);
  assert.deepEqual((await options.readRaw()).operations,[]);
});


test('independent 27-1 evidence rejects an extra submission operation after an identical replay receipt',async t=>{
  const {options}=mount(t,{duplicateOnReplay:'submit'});
  await assert.rejects(verifyLearningSupportNativePacket(options),/submit-replay-after-exact-raw-state/u);
});

test('the native packet refuses submission when exact journal persistence fails',async t=>{
  const {options,operations}=mount(t);
  const seen=[];
  await assert.rejects(verifyLearningSupportNativePacket({...options,
    async markSubmission(command){
      seen.push(command);
      throw Error('synthetic submission journal failure');
    },
  }),/synthetic submission journal failure/u);
  assert.equal(seen.length,1);
  assert.equal(seen[0].kind,'submit_learning_support');
  assert.ok(seen[0].payload.topic.includes(options.plan.runId));
  assert.ok(seen[0].payload.details.includes(options.plan.runId));
  assert.ok(operations.every(row=>row.input.p_kind==='withdraw'));
  const state=await options.readRaw();
  assert.equal(state.rows.length,3);
  assert.deepEqual(state.operations.map(row=>row.kind),['withdraw']);
});
