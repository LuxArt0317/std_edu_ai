import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {buildClubEquipmentHostedPlan,clubEquipmentFamily,clubEquipmentFixtureMode,clubEquipmentHostedCases,
  createClubEquipmentFixture,gradeClubEquipmentHosted,observeClubEquipmentCallers,requestClubEquipment,
  validateClubEquipmentHostedCases} from './club-equipment-hosted.mjs';
import {prepare,runClubEquipmentPreview} from './live-fixtures.mjs';

const id=last=>'b4851266-8cab-4567-abcd-'+String(last).padStart(12,'0');
const runId=id(1),owners={A:{id:id(2),email:'fixture_a@example.invalid',runMarker:runId},B:{id:id(3),email:'fixture_b@example.invalid',runMarker:runId}};
const origin='https://stdedu-abcdef123-v1-d286.vercel.app';
const supabase='https://xiftudmvxphxcjtmfmib.supabase.co';
const plan=buildClubEquipmentHostedPlan({runId,owners});
const cases=clubEquipmentHostedCases();
const users=[{id:owners.A.id,token:'test-club-a'},{id:owners.B.id,token:'test-club-b'}];
const dto=(owner)=>({userId:owner,view:'equipment',manager:false,student:null,today:'2026-11-15',clubs:[],equipment:[],
  rows:plan.rows.filter(row=>row.user_id===owner).map(({user_id,...row})=>row)});
const readResponse=(response,_url,_size,status=200)=>{assert.equal(response.status,status);return response.json();};

function store({failInsert=false}={}){
  const state={club:[],rows:[],dependents:[]},writes=[],journal=[],leases=[];
  const sql=(source,...args)=>{
    if(!Array.isArray(source)||!Object.hasOwn(source,'raw'))return {source,args};
    const command=source.join(' ').trim();
    if(command.startsWith('select id,email'))return Object.values(owners);
    if(command.startsWith('select id,name,active'))return structuredClone(state.club);
    if(command.startsWith('select id,user_id,club_id'))return structuredClone(state.rows);
    if(command.startsWith("select 'club-membership'"))return structuredClone(state.dependents);
    if(command.startsWith('insert into public.affairs_clubs')){assert.equal(journal.at(-1).state,'setup-pending');state.club=[args[0].source];}
    else if(command.startsWith('insert into public.affairs_club_equipment_requests')){
      if(failInsert)throw new Error('Fixture transaction stopped');
      state.rows=[...args[0].source];
    }
    else if(command.startsWith('delete from public.affairs_club_equipment_requests')){
      const row=state.rows.find(row=>row.id===args[0]&&row.user_id===args[1]&&row.club_id===args[2]);
      if(!row)return [];
      state.rows=state.rows.filter(item=>item.id!==row.id);
      writes.push(command);return [{id:row.id}];
    }else if(command.startsWith('delete from public.affairs_clubs')){
      const [club]=state.club;
      assert.ok(!state.rows.length);assert.equal(club.id,args[0]);assert.equal(club.name,args[1]);assert.equal(club.active,false);
      state.club=[];
      writes.push(command);return [{id:club.id}];
    }else assert.fail(command);
    writes.push(command);
    return [];
  };
  sql.json=value=>value;
  const fixture=createClubEquipmentFixture({sql,plan,assertLease:async value=>{leases.push(value.cleanup);},
    persist:async value=>{journal.push(value);},transaction:async work=>{
      const before=structuredClone(state);
      try{return await work();}catch(error){Object.assign(state,before);throw error;}
    }});
  return {fixture,state,writes,journal,leases};
}

test('the isolated operator rejects production, modified packets, wrong owners and non-Preview entry before I/O',async t=>{
  t.mock.method(globalThis,'fetch',async()=>assert.fail('An unapproved request was attempted.'));
  assert.throws(()=>validateClubEquipmentHostedCases(cases.slice(1)),/did not match/u);
  assert.throws(()=>buildClubEquipmentHostedPlan({runId,owners:{...owners,B:owners.A}}),/invalid_owners/u);
  assert.throws(()=>buildClubEquipmentHostedPlan({runId,owners:{...owners,B:{...owners.B,email:'production@example.com'}}}),/invalid_owners/u);
  await assert.rejects(()=>runClubEquipmentPreview({origin:'https://stu.best',sourceRevision:'a'.repeat(40)}),/protected Preview/u);
  await assert.rejects(()=>prepare({runId,cases,now:'2026-11-15',origin,approvedPreviewOrigin:origin}),/isolated evaluator/u);
  await assert.rejects(()=>prepare({runId,cases:[{...cases[0],fixtureRequirement:undefined}],now:'2026-11-15',origin}),/isolated evaluator/u);
  await assert.rejects(()=>prepare({runId,cases:cases.slice(1),now:'2026-11-15',origin,approvedPreviewOrigin:origin,
    fixtureMode:clubEquipmentFixtureMode,caseFamily:clubEquipmentFamily,previewReadbackFetch:globalThis.fetch}),/did not match/u);
});

test('the journal precedes setup and exact cleanup verifies rows and dependencies are absent',async()=>{
  const h=store();
  await h.fixture.setup();
  const before=await h.fixture.observe();
  assert.equal(before,await h.fixture.observe());
  assert.equal(h.writes.length,2);assert.deepEqual(h.journal.map(record=>record.state),['setup-pending','ready']);
  assert.equal(h.state.club[0].active,false);assert.equal(h.state.rows.length,3);
  await h.fixture.cleanup();await h.fixture.verifyAbsent();
  assert.equal(h.writes.length,6);assert.equal(h.journal.at(-1).state,'rows-removed');assert.ok(h.leases.includes(true));
  assert.deepEqual(h.state,{club:[],rows:[],dependents:[]});
});

test('an interrupted setup keeps its recorded intent and safely reconciles an empty transaction',async()=>{
  const h=store({failInsert:true});
  await assert.rejects(()=>h.fixture.setup(),/Fixture transaction stopped/u);
  assert.equal(h.journal.at(-1).state,'setup-pending');
  await h.fixture.cleanup();await h.fixture.verifyAbsent();
  assert.equal(h.journal.at(-1).state,'rows-removed');
  assert.deepEqual(h.state,{club:[],rows:[],dependents:[]});
});

test('unrecorded dependencies or changed rows block cleanup and preserve the exact recovery journal',async()=>{
  for(const kind of ['equipment-write','changed-row']){
    const h=store();await h.fixture.setup();
    if(kind==='equipment-write')h.state.dependents=[{kind}];
    else h.state.rows[0]={...h.state.rows[0],version:3};
    await assert.rejects(()=>h.fixture.observe(),/did not match/u);
    await assert.rejects(()=>h.fixture.cleanup(),/did not match/u);
    assert.equal(h.writes.length,2);assert.equal(h.journal.at(-1).state,'ready');assert.equal(h.state.rows.length,3);
  }
});

test('paired caller readbacks preserve owner-specific rows, eligibility and manager denial',async()=>{
  const seen=[];
  const read=async (url,options)=>{
    assert.equal(url.origin,origin);assert.equal(url.pathname,'/api/affairs-data');assert.equal(url.searchParams.get('scope'),'student-clubs');
    const caller=users.find(user=>'Bearer '+user.token===options.headers.Authorization);
    assert.ok(caller);
    const view=url.searchParams.get('view');seen.push([caller.id,view]);
    return view==='review'?Response.json({error:'not permitted'},{status:403}):Response.json(dto(caller.id));
  };
  const before=await observeClubEquipmentCallers(plan,{users,origin,previewFetch:read,readResponse});
  assert.deepEqual(before.map(row=>[row.visibleRows,row.eligibleToRequest,row.managerReviewDenied]),[[2,false,true],[1,false,true]]);
  assert.deepEqual(seen,[[owners.A.id,'equipment'],[owners.A.id,'review'],[owners.B.id,'equipment'],[owners.B.id,'review']]);
  await assert.rejects(()=>observeClubEquipmentCallers(plan,{users,origin,readResponse,
    previewFetch:async (url,options)=>url.searchParams.get('view')==='review'?read(url,options):Response.json(dto(owners.B.id))}),/did not match/u);
});

async function collect(handler,init){
  let status=200;
  const output=[],headers=new Headers();
  const sink={setHeader:(name,value)=>headers.set(name,value),status(code){status=code;return this;},
    json(value){headers.set('Content-Type','application/json');output.push(JSON.stringify(value));},
    write(chunk){output.push(String(chunk));return true;},end(chunk){if(chunk)output.push(String(chunk));}};
  await handler({method:'POST',body:JSON.parse(init.body),headers:{...Object.fromEntries(new Headers(init.headers)),
    'x-forwarded-for':'192.0.2.41'}},sink);
  return new Response(output.join(''),{status,headers});
}

test('the exact protected packet grades against the real signed-in and guest handlers with controlled transport',async t=>{
  const calls=[];
  t.mock.method(globalThis,'fetch',async (url,options)=>{
    assert.equal(url.origin,supabase);assert.equal(url.pathname,'/rest/v1/rpc/affairs_read_club_services');
    assert.deepEqual(JSON.parse(options.body),{p_view:'equipment',p_month:null});
    const user=users.find(user=>new Headers(options.headers).get('Authorization')==='Bearer '+user.token);
    assert.ok(user);calls.push(user.id);return Response.json(dto(user.id));
  });
  const unexpected=async()=>assert.fail('The packet attempted an unscoped account read or a model call.');
  const account=createAffairsAssistantHandler({verifyToken:async token=>{
    const user=users.find(user=>user.token===token);
    if(!user){const {AffairsWorkspaceError}=await import('../../server/affairsWorkspace.js');throw new AffairsWorkspaceError('Sign in',401);}
    return {user:{id:user.id},token,url:supabase,key:'test-publishable'};
  },loadSnapshot:unexpected,answerAccount:unexpected,publicResearch:unexpected});
  const guest=createResearchAssistantHandler();
  const verification=await observeClubEquipmentCallers(plan,{users,origin,readResponse,previewFetch:async (url,options)=>{
    if(url.searchParams.get('view')==='review')return Response.json({error:'not permitted'},{status:403});
    return Response.json(dto(users.find(user=>'Bearer '+user.token===options.headers.Authorization).id));
  }});
  const proof={rowsDigest:'a'.repeat(64),callers:verification},correlationIds=new Set();
  for(const testCase of cases){
    const token=testCase.actor==='guest'?null:users[testCase.actor==='A'?0:1].token;
    const result=await requestClubEquipment({testCase,plan,origin,token,privateMarkers:users.map(user=>user.token),correlationIds,
      fetchImpl:(url,init)=>collect(url.pathname==='/api/research-assistant'?guest:account,init)});
    assert.deepEqual(gradeClubEquipmentHosted(testCase,result,proof,proof).failures,[],testCase.id);
    assert.ok(gradeClubEquipmentHosted(testCase,result,proof,{...proof,rowsDigest:'b'.repeat(64)}).failures.includes('equipment.readback'));
  }
  assert.deepEqual(calls,[owners.A.id,owners.A.id,owners.A.id,owners.A.id,owners.B.id,owners.A.id]);
  assert.equal(correlationIds.size,7);
});
