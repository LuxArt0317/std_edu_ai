import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {planAccountLookup} from '../../server/answerVerificationAccount.js';

const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const id=(n:number)=>'74010000-0000-4000-8000-'+String(n).padStart(12,'0');
const account={url:origin,key:'HOUSING_TEST_KEY',token:'HOUSING_TEST_TOKEN',user:{id:id(1)}};
let ownerSequence=100;
const housingPath='/school-affairs/services/34-1';
const bedQuestion='Which dormitory bed was assigned to me?';
const feeQuestion='How much is my remaining balance in school?';
const nextQuestion='When is my next class?';
const never=async()=>assert.fail('Unexpected general snapshot or public request.');
const handler=createAffairsAssistantHandler({verifyToken:async()=>account,loadSnapshot:never,publicResearch:never});
const guest=createResearchAssistantHandler();

async function ask(question:string,route=housingPath,signedIn=true,history:Array<{role:string;content:string}>=[]){
  const output:{status:number;body:any}={status:200,body:null};
  const reply={setHeader(){},status(code:number){output.status=code;return reply;},json(body:unknown){output.body=body;}};
  await (signedIn?handler:guest)({method:'POST',headers:{
    authorization:'Bearer '+account.token,'x-forwarded-for':'192.0.2.78',
  },body:{question,route,history}},reply);
  assert.equal(output.status,200,JSON.stringify(output.body));
  return output.body;
}

const ranged=(rows:unknown[])=>Response.json(rows,{headers:{'content-range':rows.length?'0-'+(rows.length-1)+'/'+rows.length:'*/0'}});
const timetable={id:id(7),student_id:id(5),status:'enrolled',source_mode:'sample',section_id:id(8),student:{id:id(5),user_id:id(1)},
  section:{id:id(8),course_id:id(9),term_id:id(4),weekday:1,starts_at:'09:00:00',ends_at:'10:30:00',room:'QA Room',
    course:{id:id(9),code:'SAVED1',title:'Current timetable class'},term:{id:id(4),label:'QA demo term',starts_on:'2021-01-01',ends_on:'2098-12-31'}}};
const charge={id:id(10),student_id:id(5),label:'QA Tuition',amount_due:28000,amount_paid:5000,currency:'TWD',source_mode:'sample'};
type Options={tools:string[];fields?:string[];empty?:boolean;failed?:boolean;missingPeriod?:boolean;omitReference?:string;reject?:number;feeFailed?:boolean};
type Evidence={id:string;url:string;content:string};
async function offline({tools,fields=[],empty=false,failed=false,missingPeriod=false,omitReference,reject=0,feeFailed=false}:Options,exercise:()=>Promise<void>){
  // Independent synthetic caller per scenario keeps the real API rate limit
  // enabled without coupling unrelated test cases to one account's quota.
  account.user.id=id(++ownerSequence);
  const original=globalThis.fetch,key=process.env.OPENAI_API_KEY;
  const errors:unknown[]=[],calls:string[]=[];
  let reads=0,reviews=0,lastDraft='';
  process.env.OPENAI_API_KEY='HOUSING_OFFLINE_MODEL';
  const mock:typeof fetch=async(input,init)=>{
    const url=new URL(String(input)),path=url.pathname.split('/').at(-1)!;
    if(url.origin===origin){
      assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+account.token);
      assert.equal(init?.method,'GET');
      calls.push(path);
      if(path==='affairs_housing_assignments'){
        assert.equal(url.searchParams.get('user_id'),'eq.'+account.user.id);
        assert.equal(url.searchParams.get('select'),['id','user_id','period_id','bed_number','version','dormitory','bunk',...fields].join(','));
        reads++;
        if(failed)return Response.json({error:'PRIVATE_HOUSING_FAILURE'},{status:503});
        if(empty)return ranged([]);
        const amounts=Object.fromEntries(fields.map(key=>[key,key==='deposit'?0:key==='subsidy_amount'?null:3200.25]));
        return ranged([{id:id(2),user_id:account.user.id,period_id:id(3),bed_number:'BED-'+reads,version:1,dormitory:'Test Hall',bunk:'upper',...amounts}]);
      }
      if(path==='affairs_housing_periods'){
        assert.equal(url.searchParams.get('id'),'in.('+id(3)+')');
        return ranged(missingPeriod?[]:[{id:id(3),academic_year:115,semester:1,source_mode:'local_demo',version:1}]);
      }
      if(path==='affairs_students')return Response.json([{id:id(5),user_id:account.user.id}]);
      assert.equal(url.searchParams.get('student_id'),'eq.'+id(5));
      if(path==='affairs_charges')return feeFailed?Response.json({}, {status:503}):ranged([charge]);
      assert.equal(path,'affairs_enrollments');
      return ranged([{...timetable,student:{...timetable.student,user_id:account.user.id}}]);
    }
    assert.equal(url.origin,'https://api.openai.com');
    const request=JSON.parse(String(init?.body)),packet=JSON.parse(request.input[0].content[0].text);
    const stage=request.text.format.name,evidence:Evidence[]=packet.evidence;
    calls.push(stage);
    assert.deepEqual(evidence.map(item=>item.id).slice(1).sort(),tools.map(name=>'account:'+name).sort());
    const scope=JSON.parse(evidence[0].content);
    if(tools.includes('housing'))assert.deepEqual(scope.actions,[]);
    assert.deepEqual(scope.selectedTools.slice().sort(),[...tools].sort());
    assert.doesNotMatch(JSON.stringify(evidence),/HOUSING_TEST|PRIVATE_HOUSING_FAILURE|74010000-0000-4000-8000-000000000001/u);
    assert.equal(JSON.stringify(evidence).includes(account.user.id),false);
    const claims=evidence.slice(1).flatMap(source=>{
      const data=JSON.parse(source.content);
      const claim=(text:string,...paths:string[])=>({claim:text,evidenceId:source.id,jsonPaths:paths,quotes:[],supported:true});
      if(source.id==='account:charges')return data.unavailableReason?[claim('I could not read your saved balance.','/unavailableReason')]
        :[claim('QA Tuition has NT$23,000 remaining.','/records/0/amountDue','/records/0/amountPaid')];
      if(source.id==='account:courses')return [claim('SAVED1 Current timetable class is your next saved class.',
        '/calendar/records/next/course/code','/calendar/records/next/day','/calendar/records/next/course/startsAt')];
      assert.equal(source.id,'account:housing');
      assert.equal(source.url,housingPath);
      assert.equal(data.collection,'housingBed');
      assert.equal(data.capability.payment,false);
      assert.equal(data.capability.write,false);
      if(!data.records.length)return [claim('The saved accommodation lookup was '+data.readState+'.','/readState')];
      assert.equal(data.records[0].bedNumber,'BED-'+reads);
      return [claim('Your saved sample bed is '+data.records[0].bedNumber+'.',
        ...Object.keys(data.records[0]).filter(name=>name!==omitReference).map(name=>'/records/0/'+name)),
      ...(data.readState==='partial'?[claim('Period coverage is incomplete.','/counts/unresolvedPeriods')]:[])];
    });
    let answer;
    if(stage==='answer_evidence_review'){
      if(typeof packet.answer==='string')lastDraft=packet.answer;
      if(typeof packet.answer?.answer==='string')lastDraft=packet.answer.answer;
      const passed=++reviews>reject;
      answer={supported:passed,answersQuestion:passed,claims:claims.map(claim=>({...claim,supported:passed}))};
    }else{
      assert.equal(stage,'correct_grounded_answer');
      answer={status:'answered',answer:claims.map(claim=>claim.claim).join(' '),sourceIds:tools.map(name=>'account:'+name)};
    }
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(answer)}]}]});
  };
  globalThis.fetch=(...args)=>mock(...args).catch(error=>{errors.push(error);throw error;});
  try{await exercise();assert.deepEqual(errors,[]);return {calls,reviews,lastDraft};}
  finally{globalThis.fetch=original;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
}

test('one verified accommodation lookup uses no general snapshot and omits monetary cells',async()=>{
  const result=await offline({tools:['housing']},async()=>{
    const body=await ask(bedQuestion);
    assert.equal(body.verification.status,'verified');
    assert.match(body.answer,/BED\\?-1/u);
    assert.match(body.answer,/sample data/u);
    assert.equal(body.views[0].url,housingPath);
    assert.deepEqual(body.views[0].columns,['Academic year','Semester','Bed number','Dormitory','Bunk']);
    assert.deepEqual(body.views[0].rows,[['115','1','BED-1','Test Hall','upper']]);
    assert.equal(body.proposedAction,undefined);
  });
  assert.deepEqual(result.calls,['affairs_housing_assignments','affairs_housing_periods','answer_evidence_review']);
});

test('both compound orders keep separate fee or timetable sources',async()=>{
  for(const [other,tool] of [[nextQuestion,'courses'],[feeQuestion,'charges']] as const){
    for(const question of [bedQuestion+' '+other,other+' '+bedQuestion]){
      assert.deepEqual((await planAccountLookup(question,[],housingPath,Date.now()+1000)).tools,['housing',tool]);
      const result=await offline({tools:['housing',tool]},async()=>{
        const body=await ask(question);
        assert.equal(body.verification.status,'verified',body.answer);
        assert.match(body.answer,/BED\\?-1/u);
        assert.match(body.answer,tool==='courses'?/SAVED1/u:/23,000/u);
        assert.equal(body.citations.some((item:{url:string})=>item.url===housingPath),true);
      });
      assert.equal(result.calls.filter(call=>call==='answer_evidence_review').length,1);
      assert.ok(result.calls.includes(tool==='courses'?'affairs_enrollments':'affairs_charges'));
    }
  }
});

test('the correction reloads both authorized sources and replaces stale facts',async()=>{
  const result=await offline({tools:['housing','charges'],reject:1},async()=>{
    const body=await ask(bedQuestion+' '+feeQuestion);
    assert.equal(body.verification.status,'verified',body.answer);
    assert.match(body.answer,/BED-2/u);
    assert.doesNotMatch(body.answer,/BED-1/u);
    assert.deepEqual(body.views.find((view:{id:string})=>view.id==='housing').rows[0].slice(0,3),['115','1','BED-2']);
    assert.ok(body.activity.some((row:{kind:string})=>row.kind==='account-read:housing:2'));
  });
  assert.equal(result.calls.filter(call=>call==='affairs_housing_assignments').length,2);
  assert.equal(result.calls.filter(call=>call==='affairs_charges').length,2);
  assert.equal(result.reviews,2);
});

test('explicitly excluded companions never trigger their private reader or the broad snapshot',async()=>{
  for(const question of [bedQuestion+' Do not show my tuition balance.','Do not read my tuition balance. '+bedQuestion,
    bedQuestion+' Show my tuition balance. Do not show my tuition balance.',
    '顯示我的住宿床位。不要顯示我的學費餘額。',
    'Show my dormitory bed. Don’t tell me my tuition balance.',
    'Show my dormitory bed. Do not show my next class, nor my tuition balance.']){
    assert.deepEqual((await planAccountLookup(question,[],housingPath,Date.now()-1)).tools,['housing']);
    const result=await offline({tools:['housing']},async()=>{
      const body=await ask(question);assert.equal(body.verification.status,'verified');assert.match(body.answer,/BED\\?-1/u);
      assert.doesNotMatch(body.answer,/23,000|QA Tuition|SAVED1/u);
    });
    assert.deepEqual(result.calls,['affairs_housing_assignments','affairs_housing_periods','answer_evidence_review']);
  }
});

test('own beds survive foreign finance clauses without fee, timetable or broad snapshot access',async()=>{
  for(const question of ['Show my dormitory bed and tuition balance for Alice.','Show tuition balance for Alice. Show my dormitory bed.',
    'Show my dormitory bed and tuition balance for my mother.','Show my dormitory bed and my friend’s tuition balance.']){
    const result=await offline({tools:['housing']},async()=>{
      const body=await ask(question);assert.equal(body.verification.status,'verified');assert.match(body.answer,/BED\\?-1/u);
      assert.match(body.answer,/cannot show another person/u);assert.doesNotMatch(body.answer,/23,000|QA Tuition/u);
    });
    assert.deepEqual(result.calls,['affairs_housing_assignments','affairs_housing_periods','answer_evidence_review']);
  }
  await offline({tools:['housing','charges']},async()=>{
    const body=await ask('Show my dormitory bed and my tuition balance. Do not show Alice’s tuition balance.');
    assert.equal(body.verification.status,'verified');assert.match(body.answer,/BED\\?-1/u);assert.match(body.answer,/23,000/u);
  });
});

test('three-part housing, next-class and balance questions read and answer all three sources',async()=>{
  for(const question of [bedQuestion+' '+nextQuestion+' '+feeQuestion,feeQuestion+' '+nextQuestion+' '+bedQuestion,
    'Show my dormitory bed, my tuition balance, and my next class.']){
    const tools=['housing','courses','charges'];
    assert.deepEqual((await planAccountLookup(question,[],housingPath,Date.now()-1)).tools,tools);
    const result=await offline({tools},async()=>{
      const body=await ask(question);assert.equal(body.verification.status,'verified',body.answer);
      assert.match(body.answer,/BED\\?-1/u);assert.match(body.answer,/SAVED1/u);assert.match(body.answer,/23,000/u);
      for(const url of [housingPath,'/school-affairs/records/subjects','/school-affairs/services/39-1'])
        assert.ok(body.citations.some((item:{url:string})=>item.url===url),url);
    });
    for(const source of ['affairs_housing_assignments','affairs_enrollments','affairs_charges','answer_evidence_review'])
      assert.equal(result.calls.filter(call=>call===source).length,1,source);
  }
});

test('a positive companion survives a separate explicit source exclusion',async()=>{
  for(const [question,tool,forbidden] of [
    [bedQuestion+' Do not show my tuition balance. '+nextQuestion,'courses','affairs_charges'],
    [bedQuestion+' Do not show my next class. '+feeQuestion,'charges','affairs_enrollments'],
  ]){
    const result=await offline({tools:['housing',tool]},async()=>{
      const body=await ask(question);assert.equal(body.verification.status,'verified');assert.match(body.answer,/BED\\?-1/u);
      assert.match(body.answer,tool==='courses'?/SAVED1/u:/23,000/u);
    });
    assert.equal(result.calls.includes(forbidden),false);
  }
});

test('the review must reference the requested deposit and withholds a twice unsupported draft',async()=>{
  const result=await offline({tools:['housing'],fields:['deposit'],omitReference:'deposit'},async()=>{
    const body=await ask('How much is my dormitory deposit?');
    assert.equal(body.verification.status,'unverified');
    assert.doesNotMatch(body.answer,/BED-|Test Hall/u);
    assert.equal(body.views.some((view:{id:string})=>view.id==='housing'),false);
  });
  assert.equal(result.reviews,2);
});

test('zero charged deposit, a null subsidy, and an unconfirmed payment stay separate',async()=>{
  await offline({tools:['housing'],fields:['deposit','subsidy_amount']},async()=>{
    const body=await ask('Show my dormitory deposit and subsidy and whether I paid the deposit.');
    assert.equal(body.verification.status,'verified',body.answer);
    assert.match(body.answer,/Deposit 0/u);
    assert.match(body.answer,/Subsidy amount Not recorded/u);
    assert.match(body.answer,/do not prove payment/u);
    assert.doesNotMatch(body.answer,/NT\$/u);
  });
});

test('an empty lookup, a failed lookup and an unlinked academic period each have a distinct result',async()=>{
  for(const [state,pattern,question] of [
    [{empty:true},/found no saved records for accommodation beds/u,bedQuestion],
    [{failed:true},/could not be read/u,bedQuestion],
    [{missingPeriod:true},/couldn’t confirm a matching/u,'Show my dormitory bed in academic year 115 semester 1.'],
  ] as const){
    await offline({tools:['housing'],...state},async()=>{
      const body=await ask(question);
      assert.equal(body.verification.status,'verified',body.answer);
      assert.match(body.answer,pattern);
      assert.equal(body.views.length,0);
    });
  }
});

test('a failed independent fee read preserves the verified saved accommodation answer',async()=>{
  await offline({tools:['housing','charges'],feeFailed:true},async()=>{
    const body=await ask(bedQuestion+' '+feeQuestion);
    assert.equal(body.verification.status,'verified',body.answer);
    assert.match(body.answer,/BED-1/u);
    assert.match(body.answer,/fee records could not be read, so the balance is unknown/iu);
    assert.doesNotMatch(body.answer,/23,000/u);
  });
});

test('failed fees in a three-part request keep the saved bed and next class without inferring a zero balance',async()=>{
  const result=await offline({tools:['housing','courses','charges'],feeFailed:true},async()=>{
    const body=await ask(bedQuestion+' '+feeQuestion+' '+nextQuestion);
    assert.equal(body.verification.status,'verified',body.answer);
    assert.match(body.answer,/BED\\?-1/u);assert.match(body.answer,/SAVED1/u);
    assert.match(body.answer,/fee records could not be read, so the balance is unknown/iu);
    assert.doesNotMatch(body.answer,/23,000|balance (?:is )?0/u);
  });
  assert.equal(result.calls.filter(path=>path==='affairs_enrollments').length,1);
  assert.equal(result.calls.filter(path=>path==='affairs_charges').length,1);
});

test('a foreign-bed clause retains the caller’s independently requested fee answer',async()=>{
  const result=await offline({tools:['charges']},async()=>{
    const body=await ask('Show Alice’s dormitory bed assignment and my tuition balance.');
    assert.equal(body.verification.status,'verified',body.answer);
    assert.match(body.answer,/another student/u);
    assert.match(body.answer,/23,000/u);
  });
  assert.equal(result.calls.some(path=>path.includes('housing')),false);
});

test('a balance follow-up uses the latest user topic and never reads housing',async()=>{
  const history=[{role:'user',content:'Show my dormitory bed assignments.'},{role:'user',content:'Show my tuition balance.'}];
  assert.deepEqual((await planAccountLookup('How much is still due?',history,housingPath,Date.now()+1000)).tools,['charges']);
  const result=await offline({tools:['charges']},async()=>{
    const body=await ask('How much is still due?',housingPath,true,history);
    assert.equal(body.verification.status,'verified',body.answer);
    assert.match(body.answer,/23,000/u);
  });
  assert.equal(result.calls.some(path=>path.includes('housing')),false);
});

test('navigation, access and unsupported changes never query private sources',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=never;
  try{
    for(const signedIn of [false,true]){
      const term=await ask('請顯示我本學期的住宿床位。','/',signedIn);
      assert.equal(term.status,'clarification');
      assert.match(term.answer,/請指定要查詢的學期/u);
      assert.equal((await ask('王小明的宿舍床號是什麼？','/',signedIn)).status,'handoff');
      assert.equal((await ask('請問宿舍床位查詢在哪裡？','/',signedIn)).citations[0].url,housingPath);
      const link=await ask('Open accommodation bed records.',housingPath,signedIn);
      assert.equal(link.status,'answered');
      assert.equal(link.citations[0].url,housingPath);
      const foreign=await ask('Show Alice’s dormitory bed assignment.',housingPath,signedIn);
      assert.match(foreign.answer,/another student/u);
      const excluded=await ask('Do not read my dormitory bed assignments.',housingPath,signedIn);
      assert.match(excluded.answer,/skipped/u);
      const write=await ask('Change my dormitory bed assignment.',housingPath,signedIn);
      assert.equal(write.proposedAction,undefined);
    }
    const login=await ask(bedQuestion,housingPath,false);
    assert.equal(login.citations[0].url,'/school-affairs/login?next='+encodeURIComponent(housingPath));
    const mixed=await ask(nextQuestion+' '+bedQuestion,'/school-affairs',false);
    assert.deepEqual(mixed.citations.map((item:{url:string})=>item.url),[
      '/school-affairs/login?next='+encodeURIComponent(housingPath),
      '/school-affairs/login?next='+encodeURIComponent('/school-affairs/records/subjects'),
    ]);
  }finally{globalThis.fetch=original;}
});
