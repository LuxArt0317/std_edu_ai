import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import read from '../../api/affairs-data.ts';
import change from '../../api/affairs-action.ts';
import {buildLearningSupportNativePlan,learningSupportNativeCaseIds,verifyLearningSupportNativePacket} from './learning-support-native-packet.mjs';

const origin='https://xiftudmvxphxcjtmfmib.supabase.co',key='qa-local-learning-support-key';
const uiStamp='2026-11-18T16:41:00+00:00',opStamp='2026-11-18T16:40:59+00:00';

function localDatabase(plan,{duplicateOnReplay=false}={}){
  const state={rows:structuredClone(plan.rows).sort((a,b)=>a.id.localeCompare(b.id)),operations:[]};
  const ownRow=(id,actor)=>state.rows.find(row=>row.id===id&&row.user_id===actor);
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
      assert.equal(input.p_kind,'withdraw');
      const payload=input.p_payload,current=ownRow(payload.id,actor);
      if(!current)return new Response(null,{status:404});
      const prior=state.operations.find(op=>op.actor===actor&&op.request_id===payload.request_id);
      if(prior){
        if(prior.payload.expected_version!==payload.expected_version)return new Response(null,{status:409});
        if(duplicateOnReplay)state.operations.push({...prior,request_id:randomUUID()});
        return Response.json(prior.result);
      }
      if(payload.expected_version!==current.version||!['submitted','in_review'].includes(current.status))
        return new Response(null,{status:409});
      current.version++;current.status='withdrawn';current.updated_at=uiStamp;
      const result={id:current.id,requestId:payload.request_id,status:current.status,version:current.version};
      state.operations.push({actor,request_id:payload.request_id,target_id:current.id,kind:'withdraw',payload,result,occurred_at:opStamp});
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
  const wrong=[];
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
    return database.rpc(procedure,JSON.parse(init.body),actor);
  });
  async function invoke(handler,actor,{body,query}={}){
    const headers=actor==='guest'?{'x-forwarded-for':'192.0.2.189'}:{authorization:'Bearer '+tokens[actor]};
    const result={status:0,body:null,headers:new Headers()};
    const out={setHeader(name,value){result.headers.set(name,value);},status(code){result.status=code;return this;},
      json(value){result.body=value;}};
    await handler({method:body?'POST':'GET',headers,body,query},out);
    return {status:result.status,body:result.body,activity:result.body?.activity??[],correlationId:result.headers.get('x-assistant-request-id')};
  }
  return {wrong,options:{plan,readRaw:database.snapshot,
    readNative:actor=>invoke(read,crossReadback&&actor==='A'?'B':actor,{query:{scope:'learning-support',page:'1'}}),
    async ask(actor,question,route){
      requestClock+=65_000;
      return invoke(actor==='guest'?guest:assistant,actor,{body:{question,route,stream:false,consentedResearchUse:false}});
    },
    confirm:(actor,body)=>invoke(change,actor,{body}),
  }};
}

test('native 27-1 evaluation checks both callers and the single confirmed mutation through the actual HTTP handlers',async t=>{
  const {options,wrong}=mount(t);
  const {passed,cases}=await verifyLearningSupportNativePacket(options);
  assert.equal(passed,true);
  assert.deepEqual(cases.map(row=>row.caseId),learningSupportNativeCaseIds);
  assert.deepEqual(cases.filter(row=>row.before!==row.after).map(row=>row.caseId),['learning-support:confirmed']);
  const [confirmed,replayed]=cases.filter(row=>row.receipt);
  assert.equal(confirmed.request,replayed.request);assert.equal(confirmed.receipt,replayed.receipt);
  assert.equal(confirmed.after,replayed.after);
  assert.deepEqual(wrong,[]);
  assert.doesNotMatch(JSON.stringify(cases),/QA |Withdrawn|qa-controlled|status of my/i);
});

test('independent 27-1 evidence rejects an owner-mismatched readback even when both calls return 200',async t=>{
  const {options}=mount(t,{crossReadback:true});
  await assert.rejects(verifyLearningSupportNativePacket(options),/caller-owned-native-page/u);
});

test('independent 27-1 evidence rejects a duplicate stored operation even when the replay returns an identical receipt',async t=>{
  const {options}=mount(t,{duplicateOnReplay:true});
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
