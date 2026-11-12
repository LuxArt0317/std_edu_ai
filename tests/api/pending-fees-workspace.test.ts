import assert from 'node:assert/strict';
import {test} from 'node:test';
import {executeAffairsAction,loadAffairsSnapshot,manageAffairsRecord} from '../../server/affairsWorkspace.js';
import handler from '../../api/affairs-manage.ts';

const user='10000000-0000-4000-8000-000000000001',student='20000000-0000-4000-8000-000000000001';
const account={user:{id:user},token:'caller-token',url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'publishable-test-key'};
const charge={id:'fee-one',student_id:student,label:'Synthetic fee',amount_due:'100.50',amount_paid:'0.25',currency:'TWD',due_on:'2026-12-31',
  occurrence_on:'2026-11-12' as string|null,category:'示範費用' as string|null,contact_unit:'示範單位' as string|null,
  contact_extension:'2131、2132' as string|null,payment_unit:'示範收款單位' as string|null,source_mode:'sample'};
type FeeSnapshot={charges:Array<{id:string;amountDue:number;amountPaid:number;dueOn:string|null;[field:string]:unknown}>;
  admin?:{charges:Array<typeof charge>}};

test('pending-fee metadata is passed only through the existing caller-JWT admin RPC',async()=>{
  const original=globalThis.fetch;
  const payload={student_id:student,id:charge.id,label:charge.label,amount_due:'100.50',amount_paid:'0.25',due_on:charge.due_on,
    occurrence_on:charge.occurrence_on,category:charge.category,contact_unit:charge.contact_unit,contact_extension:charge.contact_extension,payment_unit:charge.payment_unit};
  let calls=0;
  globalThis.fetch=async(input,init)=>{
    calls++;assert.equal(String(input),account.url+'/rest/v1/rpc/affairs_manage_record');
    assert.ok(init?.headers);assert.equal((init.headers as Record<string,string>).Authorization,'Bearer caller-token');
    assert.deepEqual(JSON.parse(String(init?.body)),{p_kind:'save_charge',p_payload:payload});
    return new Response(JSON.stringify({id:charge.id,kind:'save_charge',summary:'Saved sample charge'}));
  };
  try{
    assert.equal((await manageAffairsRecord(account,'save_charge',payload)).id,charge.id);
    await assert.rejects(executeAffairsAction(account,'save_charge',payload),/Unsupported School Affairs action/);
    assert.equal(calls,1,'a student action must not reach the charge RPC');
  }finally{globalThis.fetch=original;}
});

test('pending-fee manager accepts the full Unicode field contract without dropping metadata',async()=>{
  const original=globalThis.fetch,savedUrl=process.env.VITE_SUPABASE_URL,savedKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  process.env.VITE_SUPABASE_URL=account.url;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=account.key;
  const payload={student_id:student,label:'名'.repeat(160),amount_due:'9999999999.99',amount_paid:'0',due_on:'',occurrence_on:'2100-12-31',
    category:'類'.repeat(80),contact_unit:'聯'.repeat(160),contact_extension:'1'.repeat(40),payment_unit:'繳'.repeat(160)};
  let writes=0;
  globalThis.fetch=async(input,init)=>{
    const path=new URL(String(input)).pathname;
    if(path==='/auth/v1/user')return new Response(JSON.stringify({id:user,identities:[{provider:'google'}]}));
    assert.equal(path,'/rest/v1/rpc/affairs_manage_record');writes++;
    assert.deepEqual(JSON.parse(String(init?.body)),{p_kind:'save_charge',p_payload:payload});
    return new Response(JSON.stringify({id:'created',kind:'save_charge',summary:'Saved sample charge'}));
  };
  try{
    const result:{status:number;body:unknown}={status:0,body:null};
    const response={status(code:number){result.status=code;return response;},json(body:unknown){result.body=body;},setHeader(){}};
    await handler({method:'POST',headers:{authorization:'Bearer '+'x'.repeat(40)},body:{kind:'save_charge',payload}},response);
    assert.equal(result.status,200);assert.equal(writes,1);assert.deepEqual(result.body,{id:'created',kind:'save_charge',summary:'Saved sample charge'});
  }finally{
    globalThis.fetch=original;
    if(savedUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=savedUrl;
    if(savedKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=savedKey;
  }
});

test('fee money/date/blank validation errors remain HTTP400 without exposing database details',async()=>{
  const original=globalThis.fetch,savedUrl=process.env.VITE_SUPABASE_URL,savedKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  process.env.VITE_SUPABASE_URL=account.url;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=account.key;
  let received:unknown;
  globalThis.fetch=async(input,init)=>{
    const path=new URL(String(input)).pathname;
    if(path==='/auth/v1/user')return new Response(JSON.stringify({id:user,identities:[{provider:'google'}]}));
    assert.equal(path,'/rest/v1/rpc/affairs_manage_record');received=JSON.parse(String(init?.body)).p_payload;
    return new Response(JSON.stringify({code:'22023',message:'Private database detail must not be returned'}),{status:400});
  };
  try{
    for(const invalid of [{amount_due:'10000000000'},{amount_due:''},{occurrence_on:'2026-02-30'}]){
      const payload={student_id:student,label:'Synthetic fee',amount_due:'100.50',amount_paid:'0',...invalid};
      const result:{status:number;body:unknown}={status:0,body:null};
      const response={status(code:number){result.status=code;return response;},json(body:unknown){result.body=body;},setHeader(){}};
      await handler({method:'POST',headers:{authorization:'Bearer '+'x'.repeat(40)},body:{kind:'save_charge',payload}},response);
      assert.deepEqual(received,payload);assert.equal(result.status,400);
      assert.deepEqual(result.body,{error:'The School Affairs request was invalid. Check the fields and try again.'});
    }
  }finally{
    globalThis.fetch=original;
    if(savedUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=savedUrl;
    if(savedKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=savedKey;
  }
});

test('fee snapshots page beyond 500 rows, preserve null metadata, and keep admin rows outside the caller data',async()=>{
  const original=globalThis.fetch;let admin=false;
  const charges=Array.from({length:501},(_,index)=>({...charge,id:`own-fee-${index}`}));
  charges[500]={...charges[500],occurrence_on:null,category:null,contact_unit:null,contact_extension:null,payment_unit:null};
  const otherCharge={...charge,id:'other-fee',student_id:'other-student',contact_unit:'Other account unit'};
  const emptyTables=new Set(['affairs_terms','affairs_programs','affairs_courses','affairs_sections','affairs_announcements','affairs_tasks',
    'affairs_service_requests','dtm_courses','dtm_notices','affairs_service_records','affairs_scholarship_periods','affairs_scholarship_applications',
    'affairs_student_aid_records','affairs_credit_load_history','affairs_housing_periods','affairs_housing_applications','affairs_housing_assignments','affairs_enrollments',
    'affairs_grade_items','affairs_attendance','affairs_assignments']);
  const requestedOffsets:number[]=[];
  globalThis.fetch=async(input)=>{
    const url=new URL(String(input)),table=url.pathname.split('/').at(-1);let rows:unknown;
    if(table==='affairs_initialize_account'||table==='dtm_initialize_account')return new Response('null');
    if(table==='affairs_profiles')rows=[{user_id:user,email:'one@example.invalid',display_name:'One',role:admin?'admin':'student'}];
    else if(table==='affairs_students')rows=[{id:student,user_id:user,student_number:'QA-ONE',full_name:'Synthetic one',year_level:1,status:'active',source_mode:'sample'}];
    else if(table==='affairs_charges'){
      const own=url.searchParams.get('student_id');
      if(own!==null)assert.equal(own,'eq.'+student);else assert.equal(admin,true,'unfiltered charge reads belong only to the explicit admin scope');
      assert.match(url.searchParams.get('order')||'',/(^|,)id\.(asc|desc)($|,)/,'every page has a stable ID tie-breaker');
      const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit'));
      assert.equal(limit,500);if(own)requestedOffsets.push(offset);
      rows=(own?charges:[...charges,otherCharge]).slice(offset,offset+limit);
    }else{assert.ok(table&&emptyTables.has(table),'Unexpected snapshot resource: '+table);rows=[];}
    return new Response(JSON.stringify(rows));
  };
  try{
    const own=await loadAffairsSnapshot(account) as FeeSnapshot;
    assert.equal(own.charges.length,501);assert.deepEqual(requestedOffsets,[0,500]);
    assert.deepEqual(Object.fromEntries(['occurrenceOn','category','contactUnit','contactExtension','paymentUnit','dueOn'].map(key=>[key,own.charges[0][key]])),
      {occurrenceOn:'2026-11-12',category:'示範費用',contactUnit:'示範單位',contactExtension:'2131、2132',paymentUnit:'示範收款單位',dueOn:'2026-12-31'});
    for(const key of ['occurrenceOn','category','contactUnit','contactExtension','paymentUnit'])assert.equal(own.charges[500][key],null);
    assert.equal(own.charges[500].dueOn,'2026-12-31','due date must not fill the missing occurrence date');
    assert.equal(own.charges[0].amountDue,100.5);assert.equal(own.charges[0].amountPaid,0.25);assert.equal(own.admin,undefined);
    admin=true;
    const manager=await loadAffairsSnapshot(account,true) as FeeSnapshot;
    assert.ok(manager.admin);
    assert.equal(manager.charges.length,501);assert.equal(manager.admin.charges.length,502);
    assert.equal(manager.charges.some((row:{id:string})=>row.id==='other-fee'),false);
    assert.equal(manager.admin.charges.find(row=>row.id==='other-fee')?.contact_unit,'Other account unit');
  }finally{globalThis.fetch=original;}
});
