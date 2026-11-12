import assert from 'node:assert/strict';
import {test} from 'node:test';
import {answerHousingRecords,isHousingRecordQuestion,mapHousingRecords} from '../../server/housingRecords.js';
import {executeAffairsAction,loadAffairsSnapshot,manageAffairsRecord} from '../../server/affairsWorkspace.js';
import {answerPrivateAffairsQuestion} from '../../server/affairsAnswer.js';
import {housingApplicantLabel,housingPeriodState} from '../../src/services/housing.ts';

const period={id:'housing-period',term_label:'Local housing 115-1',academic_year:115,semester:1,opens_at:'2026-11-01T00:00:00Z',closes_at:'2026-11-30T12:00:00Z',published:true,instructions:'Local instructions',agreement_text:'Accepted local agreement',source_mode:'local_demo',version:1};
const application={id:'housing-application',user_id:'student-one',period_id:period.id,receipt_number:'H-12345678901234567890123456789012',full_name:'PRIVATE FULL NAME',student_number:'PRIVATE STUDENT ID',gender:'female',department:'PRIVATE DEPARTMENT',birth_date:'2000-01-01',home_phone:'PRIVATE PHONE',mobile_phone:'PRIVATE MOBILE',email:'private@example.invalid',address:'PRIVATE ADDRESS',postal_code:'PRIVATE POSTCODE',category:'disability',health_notes:'PRIVATE MEDICAL DETAILS',agreement_version:1,agreement_text:'PRIVATE ACCEPTED TEXT',submitted_at:'2026-11-12T00:00:00Z',version:1};
const bed={id:'bed-one',user_id:'student-one',period_id:period.id,bed_number:'LOCAL-A',dormitory:'Local dormitory',bunk:'upper',accommodation_fee:'1250.75',deposit:null,subsidy_amount:null,version:1};
const account={user:{id:'student-one'},token:'caller-token',url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'publishable-test-key'};

test('housing mapping preserves unknown fees and sorts assigned beds by the actual academic term',()=>{
  const older={...period,id:'older-period',academic_year:114,semester:2};
  const result=mapHousingRecords([older,period],[application],[{...bed,id:'old-bed',period_id:older.id,deposit:'0.00',subsidy_amount:'500.50'},bed]);
  assert.deepEqual(result.assignments.map(row=>row.id),['bed-one','old-bed']);
  assert.equal(result.assignments[0].academicYear,115);assert.equal(result.assignments[0].accommodationFee,1250.75);assert.equal(result.assignments[0].deposit,null);
  assert.equal(result.assignments[1].deposit,0);
  assert.equal(result.assignments[0].subsidyAmount,null);assert.equal(result.assignments[1].subsidyAmount,500.5);
  assert.equal(result.applications[0].agreementText,'PRIVATE ACCEPTED TEXT');
  assert.equal(mapHousingRecords([],[],[bed]).assignments[0].academicYear,null,'missing parent terms are not invented');
});

test('housing opening boundary is inclusive, closing boundary exclusive, and unpublished periods never open',()=>{
  const row=mapHousingRecords([period],[],[]).periods[0];
  assert.equal(housingPeriodState(row,Date.parse(row.opensAt)-1),'upcoming');
  assert.equal(housingPeriodState(row,Date.parse(row.opensAt)),'open');
  assert.equal(housingPeriodState(row,Date.parse(row.closesAt)),'closed');
  assert.equal(housingPeriodState({...row,published:false},Date.parse(row.opensAt)),'draft');
  assert.equal(housingApplicantLabel({user_id:'one',display_name:'Same Name',email:'one@example.invalid'}),'Same Name (one@example.invalid)');
});

test('housing assistant answers contain receipt and bed metadata while excluding the entire application form',async()=>{
  const snapshot={checkedAt:'2026-11-12T00:00:00Z',housing:mapHousingRecords([period],[application],[bed])};
  const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Housing answers must not contact a model or university service.');};
  try{
    const direct=answerHousingRecords('What is my housing application status?',snapshot);
    assert.ok(direct);assert.match(direct.answer,/application saved; receipt H-/);assert.match(direct.answer,/1250\.75.*deposit —.*subsidy —/);
    assert.doesNotMatch(direct.answer,/PRIVATE|private@example|disability|2000-01-01/);
    assert.equal(direct.url,'/school-affairs/services/26-1');
    const bedAnswer=await answerPrivateAffairsQuestion('我的住宿床位與住宿費',snapshot,[],'/school-affairs/services/34-1');
    assert.match(bedAnswer.answer,/Local dormitory LOCAL-A.*上舖.*1250\.75/);
    assert.doesNotMatch(bedAnswer.answer,/PRIVATE|private@example/);
    assert.equal((bedAnswer.citations[0] as {url:string}).url,'/school-affairs/services/34-1');
    assert.equal(bedAnswer.grounding.source,'account');assert.equal(bedAnswer.proposedAction,undefined);
  }finally{globalThis.fetch=original;}
});

test('housing follow-ups retain only housing context and yield to explicitly different services',()=>{
  const route='/school-affairs/services/26-1',history=[{role:'user',content:'What is my housing application status?'}];
  for(const question of ['When is the deadline?','What is my receipt number?','申請紀錄呢？'])assert.equal(isHousingRecordQuestion(question,route,history),true,question);
  for(const question of ['What is my scholarship status?','Show my leave application','What assignments are due?','我的助學申請紀錄','我的實習紀錄','What is my student number?'])assert.equal(isHousingRecordQuestion(question,route,history),false,question);
  assert.equal(isHousingRecordQuestion('What dormitories does STU offer?'),false);
  assert.equal(isHousingRecordQuestion('When is the deadline?','/school-affairs/services/9-1'),false);
  assert.match(answerHousingRecords('我的住宿申請',{})?.answer||'',/尚無申請紀錄.*尚未公布站內申請期間.*尚無床位紀錄/s);
});

test('housing operations use only the dedicated caller-JWT RPC and keep admin kinds out of the student action path',async()=>{
  const original=globalThis.fetch;const kinds:string[]=[];
  globalThis.fetch=async(input,init)=>{
    assert.equal(new URL(String(input)).pathname,'/rest/v1/rpc/affairs_housing_action');
    assert.equal((init?.headers as Record<string,string>)?.Authorization,'Bearer caller-token');
    const body=JSON.parse(String(init?.body));kinds.push(body.p_kind);
    return new Response(JSON.stringify({id:'saved',kind:body.p_kind}),{status:200});
  };
  try{
    await executeAffairsAction(account,'submit_housing_application',{request_id:'request',period_id:period.id});
    await manageAffairsRecord(account,'save_housing_period',{request_id:'period',id:period.id});
    await manageAffairsRecord(account,'save_housing_assignment',{request_id:'bed',id:bed.id});
    await assert.rejects(executeAffairsAction(account,'save_housing_assignment',{}),/Unsupported/);
    assert.deepEqual(kinds,['submit_housing_application','save_housing_period','save_housing_assignment']);
  }finally{globalThis.fetch=original;}
});

test('snapshot housing queries are account-filtered and admin-only data does not leak into own records',async()=>{
  const original=globalThis.fetch;let admin=false;
  globalThis.fetch=async(input)=>{
    const url=new URL(String(input)),table=url.pathname.split('/').at(-1);let rows:unknown=[];
    if(table==='affairs_profiles')rows=url.searchParams.get('user_id')?.startsWith('in.')?[{user_id:'student-two',email:'two@example.invalid',display_name:'Two',role:'student'}]:[{user_id:account.user.id,email:'one@example.invalid',display_name:'One',role:admin?'admin':'student'}];
    if(table==='affairs_housing_periods')rows=[period];
    if(table==='affairs_housing_applications'||table==='affairs_housing_assignments'){
      const row=table==='affairs_housing_applications'?application:bed;
      if(url.searchParams.has('user_id')){assert.equal(url.searchParams.get('user_id'),'eq.student-one');rows=[row];}
      else{assert.equal(admin,true);rows=[row,{...row,id:'other-'+row.id,user_id:'student-two'}];}
    }
    return new Response(JSON.stringify(rows),{status:200});
  };
  try{
    const own=await loadAffairsSnapshot(account) as {housing:ReturnType<typeof mapHousingRecords>;admin?:unknown};
    assert.equal(own.housing.applications.length,1);assert.equal(own.housing.assignments.length,1);assert.equal(own.admin,undefined);
    admin=true;
    const manager=await loadAffairsSnapshot(account,true) as {housing:ReturnType<typeof mapHousingRecords>;admin:{housing:ReturnType<typeof mapHousingRecords>;profiles:Array<{user_id:string;email:string}>}};
    assert.equal(manager.housing.applications.length,1);assert.equal(manager.admin.housing.applications.length,2);assert.equal(manager.admin.housing.assignments.length,2);
    assert.equal(manager.admin.profiles.find(row=>row.user_id==='student-two')?.email,'two@example.invalid');
  }finally{globalThis.fetch=original;}
});
