import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {accountEvidence} from '../../server/answerVerificationAccount.js';
import {serviceNoteKeys,serviceNoteLookup} from '../../server/serviceNoteIntent.js';

const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const owner='70000000-0000-4000-8000-000000000001',other='70000000-0000-4000-8000-000000000002';
const record='70000000-0000-4000-8000-000000000003',student='70000000-0000-4000-8000-000000000004';
let activeOwner=owner,testOwner=0;
const account={url:origin,user:{id:owner},key:'LOCAL_NOTE_TEST_KEY',token:'LOCAL_NOTE_TEST_TOKEN'};
const fee='QA Notes Tuition instalment';
const path=(key:string)=>'/school-affairs/services/'+key;
const handler=createAffairsAssistantHandler({verifyToken:async token=>{assert.equal(token,account.token);return {...account,user:{id:activeOwner}};},
  loadSnapshot:async()=>assert.fail('Unrelated workspace read or initialization'),publicResearch:async()=>assert.fail('Public research for private notes')});
type History=Array<{role:string;content:string}>;
async function ask(question:string,route=path('27-1'),history:History=[],serve=handler){
  const output:{status:number;body:any}={status:200,body:null};
  const response={setHeader(){},status(code:number){output.status=code;return response;},json(body:unknown){output.body=body;}};
  await serve({method:'POST',headers:{authorization:'Bearer '+account.token,'x-forwarded-for':'192.0.2.70'},body:{question,route,history}},response);
  assert.equal(output.status,200,JSON.stringify(output.body));
  return output.body;
}
type Scenario={key?:string;read?:'empty'|'failed'|'foreign'|'capped'|'no-match';fee?:'success'|'failed';next?:boolean;statusOnly?:boolean};
async function fakeSources(options:Scenario,run:()=>Promise<void>){
  const original=globalThis.fetch,key=process.env.OPENAI_API_KEY;
  activeOwner='70000000-0000-4000-8000-'+String(100+ ++testOwner).padStart(12,'0');
  const failures:unknown[]=[],reads:string[]=[];
  let noteReads=0;
  process.env.OPENAI_API_KEY='LOCAL_NOTE_TEST_MODEL';
  const mocked:typeof fetch=async(input,init)=>{
    const url=new URL(String(input));
    assert.notEqual(url.hostname,'api.openai.com','An exact note or companion answer must use the deterministic verifier.');
    assert.equal(url.origin,origin);
    assert.equal(init?.method,'GET');
    assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+account.token);
    reads.push(url.pathname.split('/').at(-1)!);
    if(url.pathname.endsWith('/affairs_service_records')){
      noteReads++;
      assert.equal(url.searchParams.get('user_id'),'eq.'+activeOwner);
      assert.equal(url.searchParams.get('service_key'),'eq.'+options.key);
      assert.equal(url.searchParams.get('record_type'),'eq.note');
      assert.equal(url.searchParams.get('select'),'id,user_id,service_key,record_type,title,notes,status,updated_at');
      assert.equal(new Headers(init?.headers).get('prefer'),'count=exact');
      assert.equal(init?.redirect,'error');
      if(options.read==='empty')return Response.json([],{headers:{'content-range':'*/0'}});
      if(options.read==='failed')return new Response(null,{status:503});
      return Response.json([{id:record,user_id:options.read==='foreign'?other:activeOwner,service_key:options.key,record_type:'note',
        title:'Saved reference',notes:'Reference QA-NOTE-14. Review step '+noteReads+'.',status:'filed',updated_at:'2026-11-12T12:00:00Z',
        contact_phone:'PRIVATE_CONTACT'}],{headers:{'content-range':options.read==='capped'?'0-0/10':'0-0/1'}});
    }
    if(url.pathname.endsWith('/affairs_students')){
      assert.ok(options.fee||options.next);
      assert.equal(url.searchParams.get('user_id'),'eq.'+activeOwner);
      return Response.json([{id:student,user_id:activeOwner}]);
    }
    if(url.pathname.endsWith('/affairs_enrollments')){
      assert.ok(options.next);
      assert.equal(url.searchParams.get('student_id'),'eq.'+student);
      return Response.json([],{headers:{'content-range':'*/0'}});
    }
    assert.ok(options.fee);
    assert.equal(url.pathname,'/rest/v1/affairs_charges');
    if(options.fee==='failed')return new Response(null,{status:503});
    const charge={student_id:student,amount_due:28000,amount_paid:5000,currency:'TWD',source_mode:'sample',due_on:null};
    return Response.json([{...charge,id:record,label:fee},{...charge,id:other,label:'FORBIDDEN FEE'}]);
  };
  globalThis.fetch=(...args)=>mocked(...args).catch(error=>{failures.push(error);throw error;});
  try{
    try{await run();}catch(error){if(failures.length)throw new AggregateError(failures,'Unexpected source calls');throw error;}
    assert.deepEqual(failures,[]);
    assert.equal(noteReads,options.key?1:0);
    assert.equal(reads.length,(options.key?1:0)+(options.fee?2:0)+(options.next?2:0));
  }finally{
    globalThis.fetch=original;
    if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;
  }
}

test('each numeric service takes its exact scoped database reader and preserves the local link',async()=>{
  for(const key of serviceNoteKeys)await fakeSources({key},async()=>{
    const result=await ask('Show my note for service '+key,path('27-1'));
    assert.equal(result.verification?.status,'verified',JSON.stringify(result));
    assert.match(result.answer,/QA-NOTE-14.*Review step 1/su);
    assert.match(result.answer,/self-marked/u);
    assert.equal(result.citations.find((item:{chunkId:string})=>item.chunkId==='account:serviceRecords').url,path(key));
  });
});

test('foreign, excluded, official status and note writes never touch private records or the model',async()=>{
  const cases=[
    ['Show Alice’s group insurance note.','someone'],
    ['Does Alice have student insurance notes?','someone'],
    ['請顯示王小明自己的物品借用備註。','someone'],
    ['Do not read my group insurance notes.','skipped'],
    ['Is my learning-support application officially approved?','official'],
    ['Has my work permit expired?','official'],
    ['What is my group insurance provider?','official'],
    ['Show the group insurance notes saved by Alice.','someone'],
    ['Show my note for service 35-999.','invalid'],
    ['Delete my group insurance notes.','manage'],
  ];
  for(const [question,kind]of cases)await fakeSources({},async()=>{
    const result=await ask(question);
    assert.equal(result.status,'handoff');
    assert.equal(result.proposedAction,undefined);
    if(kind==='someone')assert.deepEqual(result.citations,[]);
  });
});

test('fee and next-class compounds preserve both selected collections in either order',async()=>{
  const note='Show my international student rental note';
  const balance='the unpaid balance for '+fee;
  for(const question of [note+' and '+balance,'Show '+balance+' and '+note])await fakeSources({key:'31-2',fee:'success'},async()=>{
    const result=await ask(question);assert.equal(result.verification?.status,'verified',JSON.stringify(result));
    assert.match(result.answer,/QA-NOTE-14/u);assert.match(result.answer,/23,000/u);
  });
  for(const question of [note+' and tell me my next class','Tell me my next class and '+note,note+' and what time is my next class?'])await fakeSources({key:'31-2',next:true},async()=>{
    const result=await ask(question);assert.equal(result.verification?.status,'verified',JSON.stringify(result));
    assert.match(result.answer,/QA-NOTE-14/u);assert.match(result.answer,/no upcoming meeting/u);
  });
});

test('a failed read is not empty and a truly missing reference never substitutes another note',async()=>{
  for(const read of ['empty','failed','foreign','capped','no-match'] as const)await fakeSources({key:'35-1',read},async()=>{
    const result=await ask(read==='no-match'?'Show my insurance note for reference QA-NOTE-99.':'Show my group insurance note.');
    assert.equal(result.verification?.status,'verified',JSON.stringify(result));
    assert.doesNotMatch(result.answer,/QA-NOTE-14/u);
    assert.match(result.answer,read==='empty'?/no saved local records/iu:read==='no-match'?/no saved local note matches/iu:/could not read/iu);
  });
  await fakeSources({key:'31-2',fee:'failed'},async()=>{
    const result=await ask('Show my rental note and the unpaid balance for '+fee);
    assert.equal(result.verification?.status,'verified',JSON.stringify(result));assert.match(result.answer,/QA-NOTE-14.*balance is unknown/su);
  });
});

test('excluded notes leave only the exact companion fee read and verified local answer',async()=>{
  await fakeSources({fee:'success'},async()=>{
    const result=await ask('Show my unpaid balance for '+fee+', but do not read my group insurance notes.');
    assert.deepEqual(result.verification,{status:'verified',attempts:1});
    assert.match(result.answer,/23,000/u);
    assert.doesNotMatch(result.answer,/FORBIDDEN FEE|QA-NOTE-14/u);
    assert.ok(result.citations.some((row:{chunkId:string;url:string})=>row.chunkId==='account:charges'&&row.url===path('39-1')));
    assert.ok(result.citations.every((row:{chunkId:string})=>row.chunkId!=='account:serviceRecords'));
  });
});

test('direct note answers distinguish a saved-only qualifier from an explicit request about school approval',async()=>{
  await fakeSources({key:'35-1',read:'empty'},async()=>{
    const result=await ask('Are any of my local group insurance notes saved? Do not infer official records.');
    assert.deepEqual(result.verification,{status:'verified',attempts:1});
    assert.match(result.answer,/No saved local records/u);
    assert.doesNotMatch(result.answer,/official|approval/iu);
  });
  await fakeSources({key:'35-1'},async()=>{
    const result=await ask('Does the tracking status in my group insurance note prove insurer approval? Show the saved note and explain the limit.',path('35-1'));
    assert.deepEqual(result.verification,{status:'verified',attempts:1});
    assert.match(result.answer,/\*\*Saved reference\*\*: filed \\?\(self-marked\\?\)/u);
    assert.match(result.answer,/cannot verify the outcome/u);
  });
  await fakeSources({key:'35-1'},async()=>{
    const result=await ask('請顯示我在「學生團體保險查詢」儲存的備註與追蹤狀態。',path('35-1'));
    assert.deepEqual(result.verification,{status:'verified',attempts:1});
    assert.match(result.answer,/站內私人追蹤備註/u);
    assert.match(result.answer,/\*\*Saved reference\*\*: 自己標記已送件/u);
  });
});

test('excluded and foreign antecedents cannot authorize notes; guest gets only the same-page sign-in link',async()=>{
  const explicit=serviceNoteLookup('Show my insurance note, not my emergency injury note.',path('30-1'));
  assert.deepEqual(explicit.keys,['35-1']);
  assert.equal(explicit.excluded,true);
  assert.deepEqual(serviceNoteLookup('Show my emergency injury note and never read my group insurance note.').keys,['30-1']);
  await fakeSources({key:'35-1'},async()=>{
    const result=await ask('Show my group insurance notes. Do not read my rental notes and my work permit notes.');
    assert.match(result.answer,/QA-NOTE-14/u);
  });
  assert.deepEqual(serviceNoteLookup('Show my group insurance notes and their references.').keys,['35-1']);
  assert.deepEqual(serviceNoteLookup('Show my notes.',path('35-1')+'?lang=en&user_id='+other).keys,['35-1']);
  assert.deepEqual(serviceNoteLookup('Show my notes.','https://elsewhere.example'+path('35-1')).keys,[]);
  assert.deepEqual(serviceNoteLookup('Please show my housing note.',path('35-1')).keys,[]);
  await fakeSources({key:'35-1',statusOnly:true},async()=>{
    const result=await ask('Show my group insurance note status only. Do not show the note text.','/dtm');
    assert.match(result.answer,/self-marked/u);
    assert.doesNotMatch(JSON.stringify(result),/Review step/u);
  });
  await fakeSources({key:'35-1'},async()=>{
    const result=await ask('What status did I set for it?','',[{role:'user',content:'Show my group insurance note.'}]);
    assert.match(result.answer,/self-marked/u);
  });
  await fakeSources({},async()=>{
    const result=await ask('Show my group insurance note.',path('30-1'),[],createResearchAssistantHandler());
    assert.equal(result.status,'handoff');assert.match(result.answer,/Sign in/u);
    assert.equal(result.citations[0].url,'/school-affairs/login?next='+encodeURIComponent(path('35-1')));
  });
});

test('all notes keep an incidental reference as an example while exact titles and references remain filters',()=>{
  const snapshot={profile:{userId:owner},checkedAt:'2026-11-12T12:00:00Z',serviceRecords:[
    {id:record,userId:owner,serviceKey:'35-1',recordType:'note',title:'First note',notes:'Reference REF-35-14.',status:'draft'},
    {id:other,userId:owner,serviceKey:'35-1',recordType:'note',title:'Second note',notes:'Reference REF-35-15.',status:'filed'},
  ]};
  const get=(question:string)=>JSON.parse(accountEvidence(snapshot,['serviceRecords'],{question,route:path('35-1')})[1].content).records.map((row:{title:string})=>row.title);
  assert.deepEqual(get('Show all my group insurance notes, including reference REF-35-14.'),['First note','Second note']);
  assert.deepEqual(get('Show my group insurance note titled “Second note”.'),['Second note']);
  assert.deepEqual(get('Show my group insurance note for reference REF-35-99.'),[]);
});
