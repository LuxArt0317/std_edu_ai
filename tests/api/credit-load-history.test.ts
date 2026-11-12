import assert from 'node:assert/strict';
import {test} from 'node:test';
import {answerCreditLoadHistory,isCreditLoadHistoryQuestion,mapCreditLoadHistory,creditLoadHistoryNavigation} from '../../server/creditLoadHistory.js';
import {executeAffairsAction,loadAffairsSnapshot,manageAffairsRecord} from '../../server/affairsWorkspace.js';
import {answerPrivateAffairsQuestion} from '../../server/affairsAnswer.js';
import dataHandler from '../../api/affairs-data.ts';
import managerHandler from '../../api/affairs-manage.ts';

const row={id:'record-one',user_id:'student-one',academic_year:115,semester:1,category:'over',requested_credits:'3.50',
  process_text:'示範：人工核對中',result_text:null,source_mode:'local_demo',version:1,created_at:'2026-11-12T00:00:00Z',updated_at:'2026-11-12T00:00:00Z'};
const snapshot={profile:{userId:'student-one'},creditLoadHistory:mapCreditLoadHistory([row])};
test('credit-load mapping preserves the six independent source columns and null or zero values',()=>{
  const records=mapCreditLoadHistory([row,{...row,id:'zero',category:'under',requested_credits:'0',process_text:null,result_text:'示範結果'}]).records;
  assert.equal(records[0].requestedCredits,3.5);assert.equal(records[0].resultText,null);
  assert.equal(records[1].requestedCredits,0);assert.equal(records[1].category,'under');assert.equal(records[1].processText,null);
  assert.equal(records[1].resultText,'示範結果');assert.equal(records[0].sourceMode,'local_demo');
});
test('deterministic credit-load answers use only the caller history and never decide eligibility',()=>{
  const mixed={...snapshot,creditLoadHistory:mapCreditLoadHistory([row,{...row,id:'other',user_id:'student-two',result_text:'OTHER PRIVATE RESULT'}])};
  const answer=answerCreditLoadHistory('Show my credit-load application history',mixed)!;
  assert.match(answer.answer,/115.*semester 1.*over-load 3.5 credits.*示範：人工核對中.*result: not recorded/s);
  assert.match(answer.answer,/does not determine eligibility, submit university applications, or change course selections/);
  assert.doesNotMatch(answer.answer,/OTHER PRIVATE|student-one|record-one/);assert.equal(answer.url,'/school-affairs/services/11-3');
  assert.match(answerCreditLoadHistory('我的超減修申請進度',snapshot)!.answer,/115 學年第 1 學期.*超修 3.5 學分.*審核結果：未記錄/);
  assert.match(answerCreditLoadHistory('Am I eligible for credit-load changes?',snapshot)!.answer,/does not determine eligibility/);
});
test('absent caller identity and empty history cannot expose rows or manufacture approvals',()=>{
  for(const value of [{creditLoadHistory:snapshot.creditLoadHistory},{profile:{userId:'empty'},creditLoadHistory:snapshot.creditLoadHistory},{profile:{userId:'student-one'}}]){
    const answer=answerCreditLoadHistory('My credit-load history',value)!;
    assert.match(answer.answer,/No credit-load history records/);assert.doesNotMatch(answer.answer,/3.5|eligible to|approved|submitted successfully/);
  }
});
test('credit-load follow-ups yield to explicit grades, transfer credits, aid, fees and personal courses',()=>{
  const route='/school-affairs/services/11-3',history=[{role:'user',content:'My credit-load history'}];
  for(const question of ['What is my grade?','What fees do I owe?','我的抵免學分','我的畢業學分','My scholarship status','我的助學紀錄','我的宿舍申請','What is due for homework?','How many credits are my enrolled courses?','我的選課紀錄']){
    assert.equal(isCreditLoadHistoryQuestion(question,route,history),false,question);
  }
  for(const question of ['What is the result?','申請進度','How many credits?'])assert.equal(isCreditLoadHistoryQuestion(question,route,history),true,question);
  assert.equal(isCreditLoadHistoryQuestion('What is the result?','/school-affairs/services/13-1',[]),false);
  assert.equal(creditLoadHistoryNavigation.officialUrl,'https://infosys.stu.edu.tw/WebSelectCourse/Login/AspLogin/AppCreditHistory');
});

const account={user:{id:'student-one'},token:'caller-token',url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'publishable-test-key'};
test('credit-load manager uses caller authorization and preserves RPC conflicts while student actions are denied',async()=>{
  const original=globalThis.fetch;let conflict=false,calls=0;
  const payload={id:'record-one',user_id:'student-one',request_id:'request-one',expected_version:'0',academic_year:'115',semester:'1',category:'over',requested_credits:'3.5'};
  globalThis.fetch=async(input,init)=>{
    calls++;assert.equal(String(input),account.url+'/rest/v1/rpc/affairs_manage_credit_load_history');
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer caller-token');
    assert.deepEqual(JSON.parse(String(init?.body)),{p_kind:'save_credit_load_history',p_payload:payload});
    return new Response(JSON.stringify(conflict?{message:'Private conflict detail'}:{id:payload.id,version:1}),{status:conflict?409:200});
  };
  try{
    assert.equal((await manageAffairsRecord(account,'save_credit_load_history',payload)).version,1);
    await assert.rejects(executeAffairsAction(account,'save_credit_load_history',payload),/Unsupported School Affairs action/);
    assert.equal(calls,1);conflict=true;
    await assert.rejects(manageAffairsRecord(account,'save_credit_load_history',payload),error=>{
      assert.equal((error as {status:number}).status,409);assert.match((error as Error).message,/Refresh and try again/);assert.doesNotMatch((error as Error).message,/Private conflict detail/);return true;
    });
  }finally{globalThis.fetch=original;}
});
test('anonymous credit-load reads and manager writes are rejected before database access',async()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('Must not access the database');};
  try{
    for(const kind of ['read','save']){
      const result={status:0,body:null as unknown,headers:{} as Record<string,string>};
      const response={status(code:number){result.status=code;return response;},json(body:unknown){result.body=body;},setHeader(name:string,value:string){result.headers[name]=value;}};
      if(kind==='read')await dataHandler({method:'GET',headers:{}},response);
      else await managerHandler({method:'POST',headers:{},body:{kind:'save_credit_load_history',payload:{id:'record-one'}}},response);
      assert.equal(result.status,401);assert.match(result.headers['Cache-Control'],/no-store/);
    }
    assert.equal(calls,0);
  }finally{globalThis.fetch=original;}
});
test('history snapshots page all caller rows and resolve admin labels without mixing other owners into personal data',async()=>{
  const original=globalThis.fetch;let admin=false;
  const own=Array.from({length:501},(_,index)=>({...row,id:'own-'+index})),other={...row,id:'other',user_id:'student-two'};
  const seen:URL[]=[];
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input)),table=url.pathname.split('/').at(-1);seen.push(url);
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer caller-token');
    let result:unknown=[];
    if(table==='affairs_profiles')result=url.searchParams.get('user_id')==='in.(student-two)'
      ? [{user_id:'student-two',display_name:'Same Name',email:'second@example.invalid',role:'student'}]
      : [{user_id:'student-one',display_name:'Same Name',email:'first@example.invalid',role:admin?'admin':'student'}];
    if(table==='affairs_credit_load_history'){
      const filter=url.searchParams.get('user_id');
      if(filter)assert.equal(filter,'eq.student-one');else assert.equal(admin,true);
      assert.equal(url.searchParams.get('order'),'academic_year.desc,semester.desc,id.asc');
      const data=filter?own:[...own,other],offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit'));
      result=data.slice(offset,offset+limit);
    }
    return new Response(JSON.stringify(result));
  };
  try{
    const personal=await loadAffairsSnapshot(account) as {creditLoadHistory:ReturnType<typeof mapCreditLoadHistory>;admin?:unknown};
    assert.equal(personal.creditLoadHistory.records.length,501);assert.equal(personal.admin,undefined);
    assert.ok(personal.creditLoadHistory.records.every((record:{userId:string})=>record.userId==='student-one'));
    assert.ok(seen.some(url=>url.pathname.endsWith('/affairs_credit_load_history')&&url.searchParams.get('offset')==='500'));
    admin=true;
    const all=await loadAffairsSnapshot(account,true) as {creditLoadHistory:ReturnType<typeof mapCreditLoadHistory>;admin:{creditLoadHistory:ReturnType<typeof mapCreditLoadHistory>;profiles:Array<{user_id:string;email:string}>}};
    assert.equal(all.creditLoadHistory.records.length,501);assert.equal(all.admin.creditLoadHistory.records.length,502);
    assert.equal(all.admin.profiles.find(profile=>profile.user_id==='student-two')?.email,'second@example.invalid');
  }finally{globalThis.fetch=original;}
});
test('shared private assistant answers credit-load history locally with the exact native route',async()=>{
  const original=globalThis.fetch,key=process.env.OPENAI_API_KEY;let requests=0;
  process.env.OPENAI_API_KEY='synthetic-key';globalThis.fetch=async()=>{requests++;throw new Error('Private history must stay local');};
  try{
    const result=await answerPrivateAffairsQuestion('What is my credit-load review result?',{...snapshot,checkedAt:'2026-11-12T00:00:00Z'});
    assert.equal(result.grounding.source,'account');
    const citation=result.citations[0];assert.ok(citation && typeof citation==='object' && 'url' in citation);
    assert.equal(citation.url,'/school-affairs/services/11-3');
    assert.match(result.answer,/result: not recorded/);assert.equal(requests,0);
  }finally{globalThis.fetch=original;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
