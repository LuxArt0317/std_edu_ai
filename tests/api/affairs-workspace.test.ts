import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { loadOwnAffairsCharges, verifyAffairsToken } from '../../server/affairsWorkspace.js';
import { answerPrivateAffairsQuestion, fallbackPrivateAnswer } from '../../server/affairsAnswer.js';

const originalFetch=globalThis.fetch;
const originalUrl=process.env.VITE_SUPABASE_URL;
const originalKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const originalAiKey=process.env.OPENAI_API_KEY;
before(()=>{
  process.env.VITE_SUPABASE_URL='https://xiftudmvxphxcjtmfmib.supabase.co';
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY='test-publishable-key';
  delete process.env.OPENAI_API_KEY;
});
after(()=>{
  globalThis.fetch=originalFetch;
  if(originalUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=originalUrl;
  if(originalKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=originalKey;
  if(originalAiKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalAiKey;
});

test('School Affairs token verification requires a Google identity',async()=>{
  globalThis.fetch=async()=>new Response(JSON.stringify({id:'user-one',identities:[{provider:'email'}]}),{status:200});
  await assert.rejects(verifyAffairsToken('x'.repeat(64)),/with Google/);
  globalThis.fetch=async()=>new Response(JSON.stringify({id:'user-one',identities:[{provider:'google'}]}),{status:200});
  const account=await verifyAffairsToken('x'.repeat(64));
  assert.equal(account.user.id,'user-one');
  assert.equal(account.url,'https://xiftudmvxphxcjtmfmib.supabase.co');
});

const snapshot={checkedAt:'2026-11-05T00:00:00Z',profile:{userId:'user-one',email:'one@example.com',displayName:'One',role:'student'},student:{studentNumber:'SAMPLE-123',program:'Sample General Studies',yearLevel:1},courses:[{code:'SAMP101',title:'Campus Orientation',term:'Sample Fall 2026',termStartsOn:'2026-09-07',termEndsOn:'2027-01-15',status:'enrolled',weekday:1,startsAt:'09:00',endsAt:'10:30',room:'Sample Room',grades:[],attendance:[]}],charges:[],announcements:[],tasks:[],requests:[]};
test('personal answer uses only the account snapshot and names sample data',async()=>{
  assert.match(fallbackPrivateAnswer('What are my current subjects?',snapshot),/SAMP101 Campus Orientation/);
  const result=await answerPrivateAffairsQuestion('What are my current subjects?',snapshot);
  assert.match(result.answer,/sample/i);
  assert.match(result.answer,/SAMP101/);
  assert.doesNotMatch(result.answer,/IM101|IM203|Nexus/);
  assert.equal(result.grounding.source,'account');
  const [citation] = result.citations;
  assert.ok(citation && typeof citation==='object' && 'url' in citation);
  assert.equal(citation.url,'/school-affairs/records/subjects');
  assert.equal(result.proposedAction,undefined);
});
test('a task request is proposed without writing any data',async()=>{
  const result=await answerPrivateAffairsQuestion('Remind me to review my courses',snapshot);
  assert.equal(result.proposedAction?.kind,'create_task');
  assert.equal(result.proposedAction?.payload.title,'review my courses');
  assert.match(result.answer,/after you confirm/i);
});
test('model receives only the account snapshot and its action remains a proposal',async()=>{
  process.env.OPENAI_API_KEY='test-key';
  let calls=0;
  globalThis.fetch=async(_input,init)=>{
    calls++;
    const body=JSON.parse(String(init?.body));
    assert.equal(body.store,false);
    assert.equal(body.input[0].role,'user');
    assert.equal(JSON.parse(body.input[0].content).accountSnapshot.profile.userId,'user-one');
    return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({answer:'I can add that to your sample stu.best task list after you confirm.',action_kind:'create_task',action_title:'Review orientation',action_details:'',action_id:'',request_type:''})}]}]}),{status:200});
  };
  const result=await answerPrivateAffairsQuestion('Please help me remember to review orientation',snapshot);
  assert.equal(calls,1);
  assert.equal(result.proposedAction?.kind,'create_task');
  assert.equal(result.proposedAction?.payload.title,'Review orientation');
  assert.match(result.answer,/after you confirm/);
});


test('the scoped fee read polls only the authenticated student and full owned charge pages',async()=>{
  const caller='01710111-1111-4111-8111-111111111111',student='01710111-1111-4111-8111-111111111112';
  const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'mock-key',token:'mock-token',user:{id:caller}};
  const rows=Array.from({length:501},(_,i)=>({
    id:'01710111-1111-4111-8111-'+i.toString(16).padStart(12,'0'),student_id:student,
    amount_due:i?'0.00':'28000.00',amount_paid:i?'0.00':'5000.00',currency:'TWD',
    label:i?'Saved amount':'Sample tuition',due_on:null,source_mode:'sample',occurrence_on:null,
    category:null,contact_unit:null,contact_extension:null,payment_unit:null,
  }));
  const offsets:number[]=[];
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));
    assert.equal(url.origin,account.url);
    assert.equal(init?.method,'GET');
    assert.equal((init.headers as Record<string,string>).Authorization,'Bearer mock-token');
    if(url.pathname==='/rest/v1/affairs_students'){
      assert.equal(url.searchParams.get('user_id'),'eq.'+caller);
      assert.equal(url.searchParams.get('select'),'id,user_id');
      return Response.json([{id:student,user_id:caller}]);
    }
    assert.equal(url.pathname,'/rest/v1/affairs_charges');
    assert.equal(url.searchParams.get('student_id'),'eq.'+student);
    assert.equal(url.searchParams.get('order'),'occurrence_on.desc.nullslast,id.asc');
    const limit=Number(url.searchParams.get('limit')),offset=Number(url.searchParams.get('offset'));
    assert.equal(limit,500);
    offsets.push(offset);
    return Response.json(rows.slice(offset,offset+limit));
  };
  const result=await loadOwnAffairsCharges(account);
  assert.deepEqual(offsets,[0,500]);
  assert.deepEqual(result.profile,{userId:caller});
  assert.equal(result.studentRecordFound,true);
  assert.equal(result.charges.length,501);
  assert.deepEqual(result.charges[0],{
    id:rows[0].id,label:'Sample tuition',amountDue:28000,amountPaid:5000,currency:'TWD',
    dueOn:null,sourceMode:'sample',occurrenceOn:null,category:null,contactUnit:null,contactExtension:null,paymentUnit:null,
  });
  assert.equal(result.charges[500].amountDue,0);
});

test('missing student scope, foreign rows and a failed transport remain distinguishable',async()=>{
  const caller='01710111-1111-4111-8111-111111111111',other='01710111-1111-4111-8111-111111111113';
  const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'mock-key',token:'mock-token',user:{id:caller}};
  let reads=0;
  globalThis.fetch=async input=>{
    reads++;
    assert.equal(new URL(String(input)).pathname,'/rest/v1/affairs_students');
    return Response.json([]);
  };
  const missing=await loadOwnAffairsCharges(account);
  assert.equal(missing.studentRecordFound,false);
  assert.deepEqual(missing.charges,[]);
  assert.equal(reads,1);
  globalThis.fetch=async()=>Response.json([{id:other,user_id:other}]);
  await assert.rejects(loadOwnAffairsCharges(account),/student record could not be verified/);
  globalThis.fetch=async input=>new URL(String(input)).pathname==='/rest/v1/affairs_students'
    ? Response.json([{id:caller,user_id:caller}])
    : Response.json([{id:other,student_id:other,label:'Foreign row',amount_due:200,amount_paid:0,currency:'TWD'}]);
  await assert.rejects(loadOwnAffairsCharges(account),/fee records could not be verified/);
  globalThis.fetch=async()=>new Response(null,{status:503});
  await assert.rejects(loadOwnAffairsCharges(account),/records could not be loaded/);
  globalThis.fetch=async()=>assert.fail('Expired deadlines must stop before transport');
  await assert.rejects(loadOwnAffairsCharges(account,{deadline:0}),/database did not respond/);
  await assert.rejects(loadOwnAffairsCharges({...account,requestDeadline:0}),/database did not respond/);
  await assert.rejects(loadOwnAffairsCharges({...account,requestDeadline:NaN}),/Invalid School Affairs read deadline/);
});
