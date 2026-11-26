import assert from 'node:assert/strict';
import {test} from 'node:test';
import {executeAffairsAction,loadAffairsSnapshot,manageAffairsRecord} from '../../server/affairsWorkspace.js';
import {answerPrivateAffairsQuestion} from '../../server/affairsAnswer.js';
import {isScholarshipRecordQuestion,mapScholarshipRecords,scholarshipPageGuide} from '../../server/scholarshipRecords.js';
import {accountEvidence} from '../../server/answerVerificationAccount.js';

const period={id:'period-one',term_label:'Local demonstration 115-1',opens_at:'2026-11-01T00:00:00Z',closes_at:'2026-11-30T12:00:00Z',published:true,instructions:'Saved instructions',source_mode:'local_demo',version:1};
const application={id:'application-one',period_id:period.id,user_id:'10000000-0000-4000-8000-000000000001',status:'approved',award_amount:'12500.00',required_hours:'20.50',actual_hours:'5.25',review_note:'Local review completed',submitted_at:'2026-11-10T03:00:00Z',reviewed_at:'2026-11-11T03:00:00Z',cancelled_at:null,version:2};
const account={user:{id:'10000000-0000-4000-8000-000000000001'},token:'caller-token',url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'publishable-test-key'};

test('scholarship navigation is tied to the actual page and separates review from payment',async()=>{
 const guide=scholarshipPageGuide()!;
 assert.equal(guide.url,'/school-affairs/services/9-1');assert.equal(guide.menu.at(-2),'境外學生');
 assert.match(guide.statusMeaning.pending,/not approval or payment/u);
 const snapshot={checkedAt:'2026-11-12T00:00:00Z',profile:{userId:account.user.id},courses:[],dtm:{courses:[],assignments:[]},scholarship:mapScholarshipRecords([period],[{...application,status:'pending',award_amount:null}])};
 const evidence=accountEvidence(snapshot,['scholarship'],{question:'Where can I find my scholarship status?',scopedReadOnly:true});
 const source=evidence.find(row=>row.id==='account:scholarship')!;
 assert.deepEqual(JSON.parse(source.content).pageGuide,guide);
 const result=await answerPrivateAffairsQuestion('Where can I find my scholarship status?',snapshot);
 assert.match(result.answer,/Academic Affairs → Application\/Input Programs → International Students/u);
 assert.match(result.answer,/application period.*application history/su);
 assert.match(result.answer,/Pending review does not mean approved or paid/u);
 assert.match(result.answer,/pending review/u);
 assert.doesNotMatch(result.answer,/award NT\$12500|you have been paid/iu);
});

test('scholarship answers use saved review amounts and application dates, without model access',async()=>{
  const snapshot={checkedAt:'2026-11-12T00:00:00Z',scholarship:mapScholarshipRecords([period],[application])};
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{throw new Error('Scholarship answers must stay local');};
  try {
    const result=await answerPrivateAffairsQuestion('What is my scholarship status and service hours?',snapshot);
    assert.match(result.answer,/approved.*NT\$12500.*20\.5.*5\.25/);
    assert.match(result.answer,/Local demonstration 115-1.*Nov 1, 2026.*Nov 30, 2026/s);
    assert.equal((result.citations[0] as {url:string}).url,'/school-affairs/services/9-1');
    assert.equal(result.proposedAction,undefined);
    assert.equal(result.grounding.source,'account');
    const chinese=await answerPrivateAffairsQuestion('我的獎助學金紀錄',snapshot);
    assert.match(chinese.answer,/審核通過.*12500.*20\.5.*5\.25/);
  } finally {globalThis.fetch=original;}
});

test('missing scholarship records stay empty and route follow-ups retain account context',async()=>{
  const empty=await answerPrivateAffairsQuestion('What is the application deadline?',{checkedAt:'2026-11-12T00:00:00Z'},[],'/school-affairs/services/9-1');
  assert.match(empty.answer,/No application history.*No local application period/s);
  assert.equal(isScholarshipRecordQuestion('How many hours?', '',[{role:'user',content:'What is my scholarship status?'}]),true);
  assert.equal(isScholarshipRecordQuestion('What scholarships does STU offer?'),false);
  assert.equal(isScholarshipRecordQuestion('What is the application deadline?','/school-affairs/services/11-1'),false);
});

test('scholarship context yields to explicit account topics while ambiguous follow-ups stay local',async()=>{
  const route='/school-affairs/services/9-1';
  const history=[{role:'user',content:'What is my scholarship status?'}];
  for(const question of ['What assignments are due?','What is the homework deadline?','Show my DTM history',
    'What is my leave application status?','Cancel my internship application','How much is my tuition amount?',
    'Show my attendance history','我的作業截止日期','請假申請紀錄','實習申請狀態']) {
    assert.equal(isScholarshipRecordQuestion(question,route,history),false,question);
  }
  for(const question of ['How many hours?','When is the deadline?','What is the application status?','審核情形呢？'])
    assert.equal(isScholarshipRecordQuestion(question,route,history),true,question);
  const answer=await answerPrivateAffairsQuestion('What is my leave application status?',{
    checkedAt:'2026-11-12T00:00:00Z',serviceRecords:[{serviceKey:'leave',title:'Medical appointment',status:'draft',startsOn:'2026-11-12',endsOn:'2026-11-12'}],
    scholarship:mapScholarshipRecords([period],[application]),
  },history,route);
  assert.match(answer.answer,/Medical appointment/);
  assert.doesNotMatch(answer.answer,/12500|scholarship/);
});

test('student and manager operations use the caller JWT and the dedicated authorized RPC',async()=>{
  const original=globalThis.fetch;
  const calls:Array<{kind:string;payload:Record<string,string>}>=[];
  globalThis.fetch=async(input,init)=>{
    assert.equal(new URL(String(input)).pathname,'/rest/v1/rpc/affairs_scholarship_action');
    assert.equal((init?.headers as Record<string,string> | undefined)?.Authorization,'Bearer caller-token');
    const body=JSON.parse(String(init?.body));calls.push({kind:body.p_kind,payload:body.p_payload});
    return new Response(JSON.stringify({id:'saved',kind:body.p_kind}),{status:200});
  };
  try {
    const payload={request_id:'receipt',expected_version:'0',period_id:period.id};
    await executeAffairsAction(account,'apply_scholarship',payload);
    await executeAffairsAction(account,'cancel_scholarship',{...payload,expected_version:'1'});
    await manageAffairsRecord(account,'save_scholarship_period',{...payload,id:period.id});
    await manageAffairsRecord(account,'review_scholarship_application',{...payload,id:'application-one'});
    assert.deepEqual(calls.map(call=>call.kind),['apply_scholarship','cancel_scholarship','save_scholarship_period','review_scholarship_application']);
    await assert.rejects(executeAffairsAction(account,'review_scholarship_application',payload),/Unsupported/);
  } finally {globalThis.fetch=original;}
});

test('ordinary snapshots query only caller applications; admin review rows stay in admin scope',async()=>{
  const original=globalThis.fetch;
  let admin=false;
  const seen:string[]=[];
  globalThis.fetch=async(input)=>{
    const url=new URL(String(input));const table=url.pathname.split('/').at(-1);seen.push(table+':'+url.search);
    let rows:unknown=[];
    if(table==='affairs_profiles') {
      rows=url.searchParams.get('user_id')==='in.(10000000-0000-4000-8000-000000000002)'
        ? [{user_id:'10000000-0000-4000-8000-000000000002',email:'two@example.invalid',display_name:'One',role:'student'}]
        : [{user_id:account.user.id,email:'one@example.invalid',display_name:'One',role:admin?'admin':'student'}];
    }
    if(table==='affairs_scholarship_periods') rows=[period];
    if(table==='affairs_scholarship_applications'){
      if(url.searchParams.has('user_id')) {assert.equal(url.searchParams.get('user_id'),'eq.10000000-0000-4000-8000-000000000001');rows=[application];}
      else {assert.equal(admin,true);rows=[application,{...application,id:'application-two',user_id:'10000000-0000-4000-8000-000000000002'}];}
    }
    return new Response(JSON.stringify(rows),{status:200});
  };
  try {
    const own=await loadAffairsSnapshot(account) as {scholarship:ReturnType<typeof mapScholarshipRecords>;admin?:unknown};
    assert.equal(own.scholarship.applications.length,1);assert.equal(own.admin,undefined);
    assert.ok(seen.some(url=>url.includes('affairs_scholarship_periods:') && url.includes('published=eq.true')));
    admin=true;
    const manager=await loadAffairsSnapshot(account,true) as {scholarship:ReturnType<typeof mapScholarshipRecords>;admin:{scholarship:ReturnType<typeof mapScholarshipRecords>;profiles:Array<{user_id:string;email:string}>}};
    assert.equal(manager.scholarship.applications.length,1);
    assert.equal(manager.admin.scholarship.applications.length,2);
    assert.equal(manager.admin.profiles.find(row=>row.user_id==='10000000-0000-4000-8000-000000000002')?.email,'two@example.invalid');
    assert.ok(seen.some(url=>url.includes('affairs_profiles:') && url.includes('user_id=in.%2810000000-0000-4000-8000-000000000002%29')));
  } finally {globalThis.fetch=original;}
});
