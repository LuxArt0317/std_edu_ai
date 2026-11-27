import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {planAccountLookup,accountEvidence} from '../../server/answerVerificationAccount.js';
import {housingApplicationLookupContext as scope} from '../../server/housingApplicationEvidenceIntent.js';
import {formatHousingApplicationAnswer as format} from '../../server/housingApplicationAnswer.js';
import {readHousingApplicationEvidence,unavailableHousingApplicationEvidence} from '../../server/accountHousingApplicationEvidence.js';
const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const id=(n:number)=>'76010000-0000-4000-8000-'+String(n).padStart(12,'0');
const appPath='/school-affairs/services/26-1',bedPath='/school-affairs/services/34-1';
const appQuestion='Show my housing application receipt.',bedQuestion='Show my assigned dormitory bed.';
let serial=100;
const ranged=(rows:unknown[])=>Response.json(rows,{headers:{'content-range':rows.length?'0-'+(rows.length-1)+'/'+rows.length:'*/0'}});
type Evidence={id:string;url:string;content:string};
async function exercise(question:string,tools:string[],options:{route?:string;history?:Array<{role:string;content:string}>;empty?:boolean;failed?:boolean;reject?:number;omitReceipt?:boolean}={}){
  const caller={url:origin,key:'APP_OFFLINE_KEY',token:'APP_OFFLINE_TOKEN',user:{id:id(++serial)}};
  const original=globalThis.fetch,key=process.env.OPENAI_API_KEY,errors:unknown[]=[],calls:string[]=[];let reads=0,reviews=0;
  const never=async()=>assert.fail('No general snapshot, initializer or public research may run.');
  const handler=createAffairsAssistantHandler({verifyToken:async()=>caller,loadSnapshot:never,publicResearch:never});
  process.env.OPENAI_API_KEY='APP_MODEL_TEST';
  const mock:typeof fetch=async(input,init)=>{
    const url=new URL(String(input)),name=url.pathname.split('/').at(-1)!;
    if(url.origin===origin){
      if(name==='dtm_grade_report_overview'){
        assert.equal(init?.method,'POST');
        assert.deepEqual(JSON.parse(String(init?.body)),{});
        assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+caller.token);
        calls.push(name);
        return Response.json({courses:[{id:id(101),userId:caller.user.id,code:'MDL1',title:'Saved Moodle course',
          term:'Saved term',gradeText:'87.00'}],limit:100,nextCursor:null});
      }
      assert.equal(init?.method,'GET');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+caller.token);calls.push(name);
      if(name==='affairs_housing_applications'){
        assert.equal(url.searchParams.get('user_id'),'eq.'+caller.user.id);assert.equal(url.searchParams.get('select'),'id,user_id,period_id,receipt_number,submitted_at,version');
        reads++;if(options.failed)return Response.json({secret:'PRIVATE_FAIL'},{status:503});
        return ranged(options.empty?[]:[{id:id(2),user_id:caller.user.id,period_id:id(3),receipt_number:'RECEIPT-'+reads,submitted_at:'2026-11-01T08:30:00+00:00',version:1}]);
      }
      if(name==='affairs_housing_assignments'){
        assert.equal(url.searchParams.get('user_id'),'eq.'+caller.user.id);assert.equal(url.searchParams.get('select'),'id,user_id,period_id,bed_number,version,dormitory,bunk');
        return ranged([{id:id(4),user_id:caller.user.id,period_id:id(3),bed_number:'BED-101',version:1,dormitory:'QA Hall',bunk:'lower'}]);
      }
      if(name==='affairs_housing_periods'){
        assert.equal(url.searchParams.get('id'),'in.('+id(3)+')');assert.equal(url.searchParams.get('select'),'id,academic_year,semester,source_mode,version');
        return ranged([{id:id(3),academic_year:115,semester:1,source_mode:'local_demo',version:1}]);
      }
      if(name==='affairs_students')return Response.json([{id:id(5),user_id:caller.user.id}]);
      assert.equal(url.searchParams.get('student_id'),'eq.'+id(5));
      if(name==='affairs_charges')return ranged([{id:id(6),student_id:id(5),label:'QA Tuition',amount_due:28000,amount_paid:5000,currency:'TWD',source_mode:'sample'}]);
      assert.equal(name,'affairs_enrollments');
      return ranged([{id:id(7),student_id:id(5),status:'enrolled',source_mode:'verified',section_id:id(8),student:{id:id(5),user_id:caller.user.id},
        section:{id:id(8),course_id:id(9),term_id:id(10),weekday:1,starts_at:'09:00:00',ends_at:'10:30:00',room:'QA Room',
          course:{id:id(9),code:'SAVED1',title:'Saved next class'},term:{id:id(10),label:'QA term',starts_on:'2021-01-01',ends_on:'2098-12-31'}}}]);
    }
    assert.equal(url.origin,'https://api.openai.com');const request=JSON.parse(String(init?.body)),packet=JSON.parse(request.input[0].content[0].text);
    const evidence:Evidence[]=packet.evidence,stage=request.text.format.name;calls.push(stage);
    assert.deepEqual(evidence.slice(1).map(row=>row.id).sort(),tools.map(name=>'account:'+name).sort());
    assert.deepEqual(JSON.parse(evidence[0].content).selectedTools.slice().sort(),tools.slice().sort());
    assert.doesNotMatch(JSON.stringify(evidence),/APP_OFFLINE|PRIVATE_FAIL/u);assert.equal(JSON.stringify(evidence).includes(caller.user.id),false);
    const claims=evidence.slice(1).map(source=>{
      const data=JSON.parse(source.content);let claim:string,paths:string[];
      if(source.id==='account:housingApplications'){
        assert.equal(source.url,appPath);assert.equal(data.collection,'housingApplications');
        if(data.records.length){claim='Local saved receipt '+data.records[0].receiptNumber+', submitted at '+data.records[0].submittedAt+', academic year115 semester1.';
          paths=['/records/0/receiptNumber','/records/0/submittedAt','/records/0/academicYear','/records/0/semester'].filter(path=>!options.omitReceipt||!path.endsWith('receiptNumber'));
        }else{claim='Application metadata is '+data.readState+'.';paths=['/readState'];}
      }else if(source.id==='account:housing'){
        assert.equal(source.url,bedPath);claim='Your saved local bed is BED-101 in QA Hall, lower, academic year115 semester1.';
        paths=Object.keys(data.records[0]).map(field=>'/records/0/'+field);
      }else if(source.id==='account:dtmGradeReport'){
        assert.equal(source.url,'/dtm/grades');assert.equal(data.courses[0].gradeText,'87.00');
        claim='Saved Moodle course grade text is 87.00.';paths=['/courses/0/title','/courses/0/gradeText'];
      }else if(source.id==='account:charges'){claim='QA Tuition has NT$23,000 remaining.';paths=['/records/0/amountDue','/records/0/amountPaid'];}
      else{assert.equal(source.id,'account:courses');claim='SAVED1 is your next saved class in QA Room.';paths=['/calendar/records/next/course/code','/calendar/records/next/course/room'];}
      return {claim,evidenceId:source.id,jsonPaths:paths,quotes:[],supported:true};
    });
    let answer;
    if(stage==='answer_evidence_review'){
      const passed=++reviews>(options.reject??0);answer={supported:passed,answersQuestion:passed,claims:claims.map(claim=>({...claim,supported:passed}))};
    }else{assert.equal(stage,'correct_grounded_answer');answer={status:'answered',answer:claims.map(row=>row.claim).join(' '),sourceIds:tools.map(name=>'account:'+name)};}
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(answer)}]}]});
  };
  globalThis.fetch=(...args)=>mock(...args).catch(error=>{errors.push(error);throw error;});
  try{
    const output:{status:number;body:any}={status:200,body:null};
    const response={setHeader(){},status(code:number){output.status=code;return response;},json(body:unknown){output.body=body;}};
    await handler({method:'POST',headers:{authorization:'Bearer '+caller.token,'x-forwarded-for':'192.0.2.80'},body:{question,route:options.route??appPath,history:options.history??[]}},response);
    assert.deepEqual(errors,[]);assert.equal(output.status,200,JSON.stringify(output.body));return {body:output.body,calls,reads,reviews};
  }finally{globalThis.fetch=original;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
}
test('application intent isolates literal receipts from bed, identity, ownership, stale history and actions',()=>{
  assert.deepEqual(scope(appQuestion,appPath).selection?.term,{academicYear:null,semester:null});
  const term=scope('For academic year 115 semester 1, show my housing application receipt.',appPath);
  assert.deepEqual(term.selection?.term,{academicYear:115,semester:1});
  assert.equal(term.otherQuestion,'');
  assert.equal(scope(appQuestion+' '+bedQuestion,appPath).otherQuestion,'Show my assigned dormitory bed');
  for(const q of ['Show Alice’s housing application receipt.','Show my mother’s housing application receipt.','Show the housing receipt for Alice.','Show the housing application submitted by Alice.','Show the housing application filed by student QA123.'])assert.equal(scope(q,appPath).selection?.reason,'foreign_request',q);
  for(const q of ['王小明的住宿申請收據是什麼？','請幫我查王小明的住宿申請收據'])assert.equal(scope(q,appPath).selection?.reason,'foreign_request',q);
  for(const q of ['請幫我查住宿申請收據','查我的住宿申請收據'])assert.equal(scope(q,appPath).selection?.reason,null,q);
  for(const field of ['receipt number','submitted-at time'])assert.equal(scope(appQuestion+' Do not show my '+field+'.',appPath).excluded,true);
  assert.equal(scope(appQuestion+' Also show my submitted-at time.',appPath).otherQuestion,'');
  for(const q of ['Did I submit my housing application?','When did I submit my housing application?'])assert.equal(scope(q,appPath).selection?.reason,null);
  assert.equal(scope('Show my housing application submitted by me.',appPath).selection?.reason,null);
  assert.equal(scope('Submit my housing application.',appPath).selection?.reason,'unsupported_operation');
  assert.equal(scope('Show my housing application health notes.',appPath).selection?.reason,'outside_scope');
  assert.equal(scope('Where can I see my housing application?',appPath).navigation,true);
  assert.equal(scope('What is my receipt number?',appPath,[{role:'user',content:'Show my tuition balance.'}]).selection,null);
  assert.equal(scope('What is my receipt number?',appPath,[{role:'user',content:appQuestion}]).selection?.reason,null);
});
test('application-only handler reads exact metadata without the form or legacy general snapshot',async()=>{
  for(const question of [appQuestion,'For academic year 115 semester 1, show my housing application receipt.']){
    const result=await exercise(question,['housingApplications']);assert.equal(result.body.verification.status,'verified',result.body.answer);
    assert.match(result.body.answer,/RECEIPT\\?-1/u);assert.match(result.body.answer,/2026-11-01/u);
    assert.deepEqual(result.calls,['affairs_housing_applications','affairs_housing_periods','answer_evidence_review']);
    assert.equal(result.body.views[0].url,appPath);assert.ok(result.body.citations.some((row:any)=>row.url===appPath));
  }
});
test('application and bed in either order preserve separate evidence, literal fields, links and views',async()=>{
  for(const q of [appQuestion+' '+bedQuestion,bedQuestion+' '+appQuestion,'Show my housing application receipt and my assigned dormitory bed.','請顯示我的住宿申請收據及床位。','請顯示我的床位及住宿申請收據。']){
    assert.deepEqual((await planAccountLookup(q,[],appPath,Date.now()-1)).tools,['housingApplications','housing']);
    const result=await exercise(q,['housingApplications','housing']);assert.equal(result.body.verification.status,'verified',result.body.answer);
    assert.match(result.body.answer,/RECEIPT\\?-1/u);assert.match(result.body.answer,/BED\\?-101/u);
    assert.deepEqual(result.body.citations.map((row:any)=>row.url).sort(),['/school-affairs/records',appPath,bedPath].sort());
    assert.deepEqual(result.body.views.map((row:any)=>row.id).sort(),['housing','housingApplications']);
  }
});
test('receipts with bed, next class and balance read only independently requested sources',async()=>{
  const q=appQuestion+' '+bedQuestion+' What is my next class? How much is my remaining balance in school?';
  const result=await exercise(q,['housingApplications','housing','courses','charges']);assert.equal(result.body.verification.status,'verified',result.body.answer);
  for(const pattern of [/RECEIPT\\?-1/u,/BED\\?-101/u,/SAVED1/u,/23,000/u])assert.match(result.body.answer,pattern);
  assert.ok(result.body.citations.some((row:any)=>row.url==='/school-affairs/records/subjects'));
  assert.ok(result.body.citations.some((row:any)=>row.url==='/school-affairs/services/39-1'));
  assert.equal(result.body.views.length,3);assert.equal(result.body.views.some((row:any)=>String(row.note).startsWith('undefined ')),false);
  assert.ok(result.body.views.every((row:any)=>row.note.includes('three-table display limit')));
});
test('housing receipts and Moodle grade overview verify independent records without a broad read',async()=>{
  for(const question of [appQuestion+' Show all my saved Moodle course grades.','Show all my saved Moodle course grades. '+appQuestion]){
    const result=await exercise(question,['housingApplications','dtmGradeReport']);
    const receiptView=result.body.views.find((row:any)=>row.id==='housingApplications');
    assert.equal(receiptView.total,1);
    assert.ok(Number.isFinite(Date.parse(receiptView.checkedAt)));
    assert.match(receiptView.note,/1 of 1 matching saved applications/u);
    assert.equal(result.body.verification.status,'verified');
    assert.match(result.body.answer,/RECEIPT-1/u);assert.match(result.body.answer,/87\.00/u);
    assert.equal(result.calls.filter(name=>name==='dtm_grade_report_overview').length,1);
    assert.equal(result.calls.filter(name=>name==='affairs_housing_applications').length,1);
    assert.equal(result.calls.includes('account_lookup_plan'),false);
    assert.equal(result.body.proposedAction,undefined);
  }
});
test('failed and complete-empty receipts remain distinct while a saved bed still answers',async()=>{
  for(const [option,pattern]of [[{empty:true},/no saved housing application/iu],[{failed:true},/applications could not be read/iu]] as const){
    const result=await exercise(appQuestion+' '+bedQuestion,['housingApplications','housing'],option);
    assert.equal(result.body.verification.status,'verified',result.body.answer);assert.match(result.body.answer,pattern);assert.match(result.body.answer,/BED\\?-101/u);
    assert.equal(result.body.views.some((row:any)=>row.id==='housingApplications'),false);
  }
});
test('retry reloads exact owned receipts and mandatory receipt references cannot be substituted by a bed',async()=>{
  const fresh=await exercise(appQuestion+' '+bedQuestion,['housingApplications','housing'],{reject:1});
  assert.equal(fresh.body.verification.status,'verified');assert.equal(fresh.reads,2);assert.match(fresh.body.answer,/RECEIPT-2/u);assert.doesNotMatch(fresh.body.answer,/RECEIPT-1/u);
  const missing=await exercise(appQuestion+' '+bedQuestion,['housingApplications','housing'],{omitReceipt:true});
  assert.equal(missing.body.verification.status,'unverified');assert.doesNotMatch(missing.body.answer,/RECEIPT|BED-101/u);
});
test('foreign or excluded applications preserve independent caller beds without an application read',async()=>{
  for(const q of ['Show Alice’s housing application receipt. '+bedQuestion,'Do not show my housing application receipt. '+bedQuestion,'請幫我查王小明的住宿申請收據。'+bedQuestion]){
    const result=await exercise(q,['housing']);assert.equal(result.body.verification.status,'verified');assert.match(result.body.answer,/BED\\?-101/u);
    assert.equal(result.calls.includes('affairs_housing_applications'),false);
  }
  const excluded=await exercise(appQuestion+' Do not show my dormitory bed.',['housingApplications']);
  assert.equal(excluded.body.verification.status,'verified');assert.equal(excluded.calls.includes('affairs_housing_assignments'),false);
});
test('guest/public guides and unsupported-only questions never read private sources',async()=>{
  for(const q of ['Show Alice’s housing application receipt.','Submit my housing application.','Show my housing application health notes.','Where can I see my housing application?','Show the housing application submitted by Alice.','Do not show my housing application receipt and my dormitory bed.',appQuestion+' Do not show my receipt number.',appQuestion+' Do not show my submitted-at time.']){
    const result=await exercise(q,[]);assert.equal(result.calls.length,0);assert.equal(result.body.proposedAction,undefined);
  }
  const original=globalThis.fetch;globalThis.fetch=async()=>assert.fail('Guest guidance must not use transport.');
  try{
    const handler=createResearchAssistantHandler();let body:any;
    const response={setHeader(){},status(code:number){assert.equal(code,200);return response;},json(value:any){body=value;}};
    await handler({method:'POST',headers:{'x-forwarded-for':'192.0.2.81'},body:{question:appQuestion+' '+bedQuestion,route:appPath}},response);
    assert.deepEqual(body.citations.map((row:any)=>row.url).sort(),[appPath,bedPath].map(path=>'/school-affairs/login?next='+encodeURIComponent(path)).sort());
    await handler({method:'POST',headers:{'x-forwarded-for':'192.0.2.82'},body:{question:appQuestion+' Show all my saved Moodle course grades.',route:appPath}},response);
    assert.deepEqual(body.citations.map((row:any)=>row.url).sort(),
      ['/dtm/login?next=%2Fdtm%2Fgrades','/school-affairs/login?next='+encodeURIComponent(appPath)].sort());
  }finally{globalThis.fetch=original;}
});
test('combined verification keeps a bounded whole-row receipt excerpt with honest coverage',async()=>{
  const caller={url:origin,key:'APP_OFFLINE_KEY',token:'APP_OFFLINE_TOKEN',user:{id:id(1)}};
  const rows=Array.from({length:100},(_,index)=>({id:id(200+index),user_id:caller.user.id,period_id:id(300+index),
    receipt_number:'收據'.repeat(75)+'-'+index,submitted_at:'2026-11-01T08:30:00+00:00',version:1}));
  const receipt=await readHousingApplicationEvidence(caller,{},{
    fetchImpl:async input=>{
      const url=new URL(String(input));
      if(url.pathname.endsWith('/affairs_housing_applications'))return ranged(rows);
      const requested=url.searchParams.get('id')!.slice(4,-1).split(',');
      return ranged(requested.map(period=>({id:period,academic_year:115-Number(period.slice(-3))+300,
        semester:1,source_mode:'local_demo',version:1})));
    },
  });
  assert.equal(receipt.readState,'partial',String(receipt.reason));
  const snapshot={checkedAt:new Date().toISOString(),profile:{userId:caller.user.id},charges:[],
    housingApplicationEvidence:receipt.evidence};
  const evidence=accountEvidence(snapshot,['housingApplications','charges'],{budget:8000,scopedReadOnly:true});
  assert.ok(Buffer.byteLength(JSON.stringify(evidence),'utf8')<=8000);
  assert.deepEqual(evidence.map(source=>source.id),['account-scope','account:housingApplications','account:charges']);
  const original=JSON.parse(receipt.evidence.content),limited=JSON.parse(evidence[1].content);
  assert.equal(limited.readState,'partial');assert.equal(limited.reason,'aggregate_evidence_budget');
  assert.ok(limited.records.length>0&&limited.records.length<original.records.length);
  assert.deepEqual(limited.records,original.records.slice(0,limited.records.length));
  assert.equal(limited.counts.included,limited.records.length);
  assert.equal(limited.counts.omitted,limited.counts.matching-limited.records.length);
  assert.match(format(evidence[1],'Show my housing application receipts.').answer,/may be|remain unknown/iu);
});
test('unloaded application source stays unavailable and malformed formatter envelopes reject',async()=>{
  const source=accountEvidence({profile:{userId:id(1)},checkedAt:new Date().toISOString()},['housingApplications'])[1];
  assert.equal(JSON.parse(source.content).readState,'unavailable');assert.match(format(source,'receipt').answer,/could not be read/u);
  const bad=structuredClone(source);const data=JSON.parse(bad.content);data.records=[{receiptNumber:'fake'}];bad.content=JSON.stringify(data);assert.throws(()=>format(bad,'receipt'));
  assert.throws(()=>format({...source,url:bedPath},'receipt'));
  const unknown=unavailableHousingApplicationEvidence('read_failed');assert.equal(format(unknown.evidence,'receipt').views.length,0);
  // Actual strict-reader output remains compatible with the formatter.
  const empty=await readHousingApplicationEvidence({url:origin,key:'x',token:'x',user:{id:id(1)}},{},{fetchImpl:async()=>ranged([])});
  assert.match(format(empty.evidence,'receipt').answer,/no saved housing application/u);
});
