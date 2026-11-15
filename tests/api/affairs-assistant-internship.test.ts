import assert from 'node:assert/strict';
import test from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import researchHandler from '../../api/research-assistant.ts';
import {buildInternshipNativeCases,internshipNativeFixtureForCase,internshipNativeManifest} from '../evaluation/internship-native-cases.mjs';

// @ts-expect-error The independent test runner is a standalone JavaScript module.
import {internshipRunnerCases} from '../evaluation/internship-native-runner.mjs';
import {gradeCase} from '../evaluation/grading.mjs';

const base='https://xiftudmvxphxcjtmfmib.supabase.co';
const owner=internshipNativeManifest.owners.A;
const account={user:{id:owner},url:base,key:'OFFLINE_PUBLIC_KEY',token:'OFFLINE_CALLER_TOKEN'};
const student='53010000-0000-4000-8000-000000000601';
const columns:Record<string,string>={title:'title',status:'status',startsOn:'starts_on',endsOn:'ends_on',notes:'notes'};
const bank=buildInternshipNativeCases();
const rowFor=(suffix:string)=>bank.find(row=>row.id==='account:internship-native-'+suffix)!;
type Body={question:string;route:string;history?:Array<{role:string;content:string}>};

async function invoke(handler:any,body:Body){
  const captured={status:200,body:null as any};
  const response={setHeader(){},status(status:number){captured.status=status;return response;},json(result:unknown){captured.body=result;}};
  await handler({method:'POST',headers:{authorization:'Bearer '+account.token},body},response);
  return captured;
}

async function exercise(suffix:string,{retry=false,unverifiable=false}={}){
  const row=rowFor(suffix);assert.ok(row,suffix);
  const {sourceRead,rows,requests,forbidden}=internshipNativeFixtureForCase(row);
  const companion=row.observationExpectation.companion;
  const originalFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY;
  const calls:string[]=[],model:string[]=[],errors:unknown[]=[];
  let checked=0,lastDraft='',broadReads=0;
  process.env.OPENAI_API_KEY='OFFLINE_PROVIDER_KEY';
  globalThis.fetch=async(input,init)=>{
    try{
      const url=new URL(String(input));
      if(url.origin===base){
        assert.equal(init?.method,'GET');
        const headers=new Headers(init?.headers);
        assert.equal(headers.get('authorization'),'Bearer '+account.token);
        calls.push(url.pathname);
        if(url.pathname==='/rest/v1/affairs_service_records'){
          assert.ok(sourceRead);
          assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
          assert.equal(url.searchParams.get('service_key'),'eq.internship');
          assert.equal(url.searchParams.get('record_type'),'eq.'+sourceRead.recordType);
          const review=sourceRead.fields.includes('reviewStatus');
          const selected=['id','user_id','service_key','record_type',...sourceRead.fields.filter((field:string)=>field!=='reviewStatus').map((field:string)=>columns[field])];
          const fields=selected.join(',')+(review?',review_request_id,site_review:affairs_service_requests!affairs_service_records_review_request_id_fkey(id,user_id,status)':'');
          assert.equal(url.searchParams.get('select'),fields);
          assert.equal(headers.get('prefer'),'count=exact');
          if(sourceRead.state==='unavailable')return Response.json({}, {status:503});
          const projected=rows.filter((item:any)=>item.service_key==='internship'&&item.user_id===owner&&item.record_type===sourceRead.recordType)
            .map((item:any)=>({ ...Object.fromEntries(selected.map(key=>[key,key==='status'&&checked&&item.status==='filed'?'withdrawn':item[key]])),
              ...(review?{review_request_id:item.review_request_id,site_review:requests.find((request:any)=>request.id===item.review_request_id)??null}:{})}));
          return Response.json(projected,{headers:{'content-range':projected.length?'0-'+(projected.length-1)+'/'+projected.length:'*/0'}});
        }
        assert.ok(companion,'Unexpected independent reader');
        if(url.pathname==='/rest/v1/affairs_students'){
          assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
          return Response.json([{id:student,user_id:owner}]);
        }
        assert.equal(url.searchParams.get('student_id'),'eq.'+student);
        if(companion==='charges'){
          assert.equal(url.pathname,'/rest/v1/affairs_charges');
          return Response.json([{id:'53010000-0000-4000-8000-000000000611',student_id:student,label:'QA Internship Tuition',
            amount_due:28000,amount_paid:5000,currency:'TWD',due_on:null,source_mode:'sample',occurrence_on:null,
            category:null,contact_unit:null,contact_extension:null,payment_unit:null}]);
        }
        assert.equal(url.pathname,'/rest/v1/affairs_enrollments');
        const id=(n:number)=>'53010000-0000-4000-8000-'+String(n).padStart(12,'0');
        return Response.json([{id:id(621),student_id:student,section_id:id(622),status:'enrolled',source_mode:'sample',
          student:{id:student,user_id:owner},section:{id:id(622),course_id:id(623),term_id:id(624),weekday:2,
            starts_at:'10:10:00',ends_at:'11:00:00',room:'QA-R201',
            course:{id:id(623),code:'QAP201',title:'QA Research Practice'},
            term:{id:id(624),label:'Fixture term',starts_on:'2021-01-01',ends_on:'2098-12-31'}}}],{headers:{'content-range':'0-0/1'}});
      }
      assert.ok(sourceRead);
      assert.equal(url.origin,'https://api.openai.com');
      const wire=JSON.parse(String(init?.body)),stage=wire.text.format.name,packet=JSON.parse(wire.input[0].content[0].text);
      model.push(stage);
      const tools=['internshipRecords',...(companion?[companion]:[])];
      assert.deepEqual(packet.evidence.map((item:any)=>item.id).sort(),['account-scope',...tools.map(tool=>'account:'+tool)].sort());
      const scope=JSON.parse(packet.evidence.find((item:any)=>item.id==='account-scope').content);
      assert.deepEqual(scope.selectedTools.sort(),tools.sort());
      assert.deepEqual(scope.actions,[]);
      assert.doesNotMatch(JSON.stringify(packet),/OFFLINE_CALLER_TOKEN|OFFLINE_PUBLIC_KEY|contact_phone/);
      const evidence=packet.evidence.find((item:any)=>item.id==='account:internshipRecords');
      assert.equal(evidence.url,row.route);
      const values=JSON.parse(evidence.content);
      for(const marker of forbidden)assert.ok(!evidence.content.includes(marker),marker);
      if(stage==='answer_evidence_review'){
        checked++;
        lastDraft=packet.answer;
        const paths=values.readState==='unavailable'?['/reason']:values.readState==='empty'?['/counts/available']
          :unverifiable?['/records/0/title']:Object.keys(values.records[0]).map(key=>'/records/0/'+key);
        const supported=!retry||checked>1;
        const claims=[{claim:'Saved internship facts',supported,evidenceId:'account:internshipRecords',jsonPaths:paths,quotes:[]}];
        if(companion==='charges')claims.push({claim:'Independent saved balance',supported,evidenceId:'account:charges',
          jsonPaths:['/records/0/amountDue','/records/0/amountPaid'],quotes:[]});
        if(companion==='courses')claims.push({claim:'Independent scheduled meeting',supported,evidenceId:'account:courses',
          jsonPaths:['/calendar/records/next/course/title'],quotes:[]});
        return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({supported,answersQuestion:supported,claims})}]}]});
      }
      assert.equal(stage,'correct_grounded_answer');
      const answer=lastDraft.replaceAll('marked filed by you','withdrawn from tracking');
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({
        status:'answered',answer,sourceIds:tools.map(tool=>'account:'+tool),
      })}]}]});
    }catch(error){errors.push(error);throw error;}
  };
  const handler=createAffairsAssistantHandler({verifyToken:async()=>account as any,
    loadSnapshot:async()=>{broadReads++;throw Error('Broad account snapshot is forbidden.');},
    publicResearch:async()=>{broadReads++;throw Error('Public research cannot support private records.');}});
  try{
    const result=await invoke(handler,row);
    assert.deepEqual(errors,[]);
    assert.equal(broadReads,0);
    return {result,calls,model};
  }finally{
    globalThis.fetch=originalFetch;
    if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;
  }
}

test('all four internship views verify literal own rows with exact local citations',async()=>{
  for(const suffix of ['contract-dates','self-assessment-reflection','company-review-zh','directory-personal']){
    const {result,calls,model}=await exercise(suffix);
    const row=rowFor(suffix),fixture=internshipNativeFixtureForCase(row);
    assert.equal(result.status,200,suffix);
    assert.equal(result.body.verification?.status,'verified',suffix);
    assert.equal(result.body.citations.find((item:any)=>item.chunkId==='account:internshipRecords')?.url,row.route);
    assert.equal(result.body.views[0].url,row.route);
    for(const entry of fixture.sourceRead!.records)assert.ok(result.body.answer.includes(entry.title));
    assert.deepEqual(calls,['/rest/v1/affairs_service_records']);
    assert.deepEqual(model,['answer_evidence_review']);
    if(suffix==='directory-personal')assert.match(result.body.answer,/directory lists company rows saved to your account/iu);
  }
});

test('tuition and class companions remain independent in both orders, even if internship transport fails',async()=>{
  for(const suffix of ['fees','fees-reversed','next-class','next-class-reversed','failed-companion']){
    const {result,calls}=await exercise(suffix),row=rowFor(suffix);
    assert.equal(result.body.verification?.status,'verified',suffix);
    assert.deepEqual(calls.sort(),['/rest/v1/affairs_service_records','/rest/v1/affairs_students',
      row.observationExpectation.companion==='courses'?'/rest/v1/affairs_enrollments':'/rest/v1/affairs_charges'].sort());
    if(row.observationExpectation.companion==='courses')assert.match(result.body.answer,/QA Research Practice.*QA\\?-R201/su);
    else assert.match(result.body.answer,/23,?000/u);
    if(suffix==='failed-companion')assert.match(result.body.answer,/could not be read/u);
  }
});

test('independent review reuses the same bounded reader and withholds branches with unproven fields',async()=>{
  const recovered=await exercise('contract-list',{retry:true});
  assert.equal(recovered.result.body.verification.attempts,2);
  assert.equal(recovered.result.body.verification.status,'verified');
  assert.match(recovered.result.body.answer,/withdrawn from tracking/u);
  assert.deepEqual(recovered.calls,['/rest/v1/affairs_service_records','/rest/v1/affairs_service_records']);
  assert.deepEqual(recovered.model,['answer_evidence_review','correct_grounded_answer','answer_evidence_review']);
  const rejected=await exercise('contract-list',{unverifiable:true});
  assert.equal(rejected.result.body.verification.status,'unverified');
  assert.deepEqual(rejected.result.body.views,[]);
  assert.doesNotMatch(rejected.result.body.answer,/QA Harbor Analytics/u);
});

test('empty records, foreign requests, conflicting scopes and unsupported writes retain distinct outcomes',async()=>{
  const empty=await exercise('empty-company');
  assert.equal(empty.result.body.verification?.status,'verified');
  assert.match(empty.result.body.answer,/no matching saved records/iu);
  for(const suffix of ['foreign-prefix','foreign-postfix','foreign-zh','subtype-conflict','official-submit','public-enterprises']){
    const reply=await exercise(suffix);
    assert.equal(reply.result.status,200);
    assert.equal(reply.calls.length,0);
    assert.equal(reply.model.length,0);
    assert.deepEqual(reply.result.body.citations,[]);
    assert.equal(reply.result.body.proposedAction,undefined);
  }
});

test('the guest handler retains exact sign-in links and performs no private lookup',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>assert.fail('No provider calls on guest internship access boundaries.');
  try{
    for(const suffix of ['anonymous','directory-personal','foreign-zh','next-class']){
      const row=rowFor(suffix),reply=await invoke(researchHandler,row);
      assert.equal(reply.status,200);
      const urls=reply.body.citations.map((citation:any)=>citation.url);
      if(suffix==='foreign-zh')assert.deepEqual(urls,[]);
      else{
        assert.ok(urls.includes('/school-affairs/login?next='+encodeURIComponent(row.route)));
        if(suffix==='next-class')assert.ok(urls.includes('/school-affairs/login?next='+encodeURIComponent('/school-affairs/records/subjects')));
      }
    }
  }finally{globalThis.fetch=originalFetch;}
});

test('all 30 registered internship oracles grade actual endpoint answers under controlled records and reviewer',async t=>{
  const cases=internshipRunnerCases() as ReturnType<typeof buildInternshipNativeCases>;
  assert.equal(cases.length,30);
  t.mock.timers.enable({apis:['Date'],now:new Date(internshipNativeManifest.asOf)});
  for(const row of cases){
    // Move across independent caller request windows without altering the rate guard.
    t.mock.timers.setTime(Date.now()+61_000);
    const reply=row.auth==='anonymous'?await invoke(researchHandler,row)
      :(await exercise(row.id.replace(/^account:internship-native-/u,''))).result;
    const result=gradeCase(row,{statusCode:reply.status,body:reply.body,events:[],execution:'recorded',fixtureKey:row.fixtureKey});
    assert.equal(result.passed,true,row.id+': '+JSON.stringify(result.failures));
    if(row.id.endsWith('contract-dates'))assert.doesNotMatch(reply.body.answer,/ask the other part/iu);
    if(row.id.endsWith('filed-boundary')||row.id.endsWith('failed-companion')){
      const falseClaim=row.id.endsWith('filed-boundary')
        ?'The university received your internship application.' : 'There are no saved internship records.';
      const en={statusCode:reply.status,body:{...reply.body,answer:reply.body.answer+'\n\n'+falseClaim},
        events:[],execution:'recorded',fixtureKey:row.fixtureKey};
      assert.ok(gradeCase(row,en).failures.some((failure:{id:string})=>failure.id.startsWith('evidence.boundary.')));
    }
  }
});

test('an unsupported mutation cannot authorize a read of coordinated objects',async()=>{
  const handler=createAffairsAssistantHandler({verifyToken:async()=>account as any,
    loadSnapshot:async()=>assert.fail('Unexpected broad read.'),answerAccount:async()=>assert.fail('Unexpected private evidence.')});
  const response=await invoke(handler,{question:'Delete my internship contract and my tuition balance.',
    route:'/school-affairs/services/internship/contract'});
  assert.equal(response.status,200);
  assert.equal(response.body.status,'handoff');
  assert.match(response.body.answer,/No action was taken/u);
  assert.equal(response.body.proposedAction,undefined);
});
