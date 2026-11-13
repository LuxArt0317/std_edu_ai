import assert from 'node:assert/strict';
import {test} from 'node:test';
import {answerLinksSupported,evidenceReferenceCatalog,reviewMatchesEvidence,verifyEvidenceAnswer} from '../../server/answerVerificationModel.js';
import {accountEvidence} from '../../server/answerVerificationAccount.js';
import {runAnswerVerification} from '../../server/answerVerification.js';
import {buildAccountFixture} from '../evaluation/fixtures.mjs';

test('rendered Markdown destinations require source URLs across all CommonMark link forms',()=>{
  const sources=[{id:'test',content:'Records',url:'/school-affairs/records',urls:['mailto:help@example.invalid','https://example.invalid/a(b)?x=1&y=2']}];
  for(const answer of [
    '[Open][record]\n\n[record]: /school-affairs/records',
    '[record][]\n\n[record]: /school-affairs/records',
    '[record]\n\n[record]: /school-affairs/records',
    '<help@example.invalid>',
    '[Source](https://example.invalid/a(b)?x=1&y=2)',
    '[Source](<https://example.invalid/a(b)?x=1&amp;y=2> "Reference")',
    '[Records](/school-affairs/rec&#111;rds)',
  ])assert.equal(answerLinksSupported(answer,sources),true,answer);
  for(const answer of [
    'Open [portal][x]\n\n[x]: /unverified-destination',
    '[x][]\n\n[x]: /unverified-destination',
    '[x]\n\n[x]: /unverified-destination',
    '<review-fixture@example.invalid>',
    '[Fake](/school-affairs/records?token=secret)',
    '[Fake](//foreign.example.invalid)',
    '[Fake](javascript:alert%281%29)',
    '[Fake](data:text/plain,secret)',
    '<https://foreign.example.invalid/path>',
    '[Fake](https://example.invalid/a(b)?x=1&amp;y=999)',
    '[Fake](\\/unverified-destination)',
  ])assert.equal(answerLinksSupported(answer,sources),false,answer);
});

test('unused definitions and inert code do not become clickable reference links',()=>{
  assert.equal(answerLinksSupported('Plain text.\n\n[unused]: /unverified-destination',[]),true);
  assert.equal(answerLinksSupported('`[x](/unverified-destination)`',[]),true);
  assert.equal(answerLinksSupported('```text\nhttps://foreign.example.invalid\n```',[]),true);
  assert.equal(answerLinksSupported('Visit https://foreign.example.invalid.',[]),false);
});

test('selected service evidence preserves the explicit model field allowlist',()=>{
  const snapshot=buildAccountFixture() as any;
  Object.assign(snapshot.serviceRecords[0],{contactPhone:'PRIVATE-PHONE',userId:snapshot.profile.userId,unexpectedPrivateField:'PRIVATE-METADATA',signed_url:'https://private.invalid/token',reviewerId:'PRIVATE-REVIEWER'});
  const source=accountEvidence(snapshot,['serviceRecords'],{question:'What is my Clinic leave status?',route:'/school-affairs/services/leave'}).find(row=>row.id==='account:serviceRecords')!;
  const payload=JSON.parse(source.content),row=payload.records[0];
  assert.equal(row.title,'Clinic leave');assert.equal(row.reviewStatus,'in_review');assert.equal(row.leaveTimePeriod,null);
  const allowed=['id','serviceKey','recordType','title','notes','status','startsOn','endsOn','leaveCategory','periods','updatedAt','reviewStatus','leaveTimePeriod'];
  assert.ok(Object.keys(row).every(key=>allowed.includes(key)));
  assert.doesNotMatch(source.content,/PRIVATE-PHONE|PRIVATE-METADATA|PRIVATE-REVIEWER|private\.invalid|userId|contactPhone|signed_url/);
  assert.equal(snapshot.serviceRecords[0].contactPhone,'PRIVATE-PHONE');
});

const sourceId='account:graduationReview';
const question='Explain my Academic Services graduation reference and its literal category credit values.';
const nativeSources=()=>accountEvidence(buildAccountFixture(),['graduationReview'],{question,route:'/school-affairs/services/13-1/graduation'});
const claim=(jsonPaths:string[],extra:Record<string,unknown>={})=>({claim:'The saved reference lists30required credits and18completed credits; it is not an eligibility decision.',supported:true,evidenceId:sourceId,quotes:[],jsonPaths,...extra});
const review=(claims:any[])=>({supported:true,answersQuestion:true,claims});
const response=(value:unknown)=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]}),{headers:{'Content-Type':'application/json'}});
const candidate={status:'answered',answer:'The local graduation reference lists30required credits and18completed credits. This is not an eligibility decision.',citations:[]};
async function mockReview(replies:any[],operation:(requests:any[],logs:any[])=>Promise<void>){
  const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY,oldWarn=console.warn,requests:any[]=[],logs:any[]=[];
  process.env.OPENAI_API_KEY='synthetic-reference-test';
  globalThis.fetch=async(_url,init)=>{requests.push(JSON.parse(String(init?.body)));assert.ok(replies.length,'Unexpected extra provider call');return response(replies.shift());};
  console.warn=(...args)=>{logs.push(args);};
  try{await operation(requests,logs);}finally{globalThis.fetch=oldFetch;console.warn=oldWarn;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
}

test('real flattened graduation fields have exact canonical addresses, including nulls and provenance',()=>{
  const sources=nativeSources(),data=JSON.parse(sources.find(row=>row.id===sourceId)!.content);
  assert.equal(data.records.categories[0].requiredCredits,30);assert.equal(data.records.categories[0].completedCredits,18);
  assert.equal(data.records.categories[0].matchedCredits,15);assert.equal(data.records.categories[0].detailSubtotalCredits,17);
  assert.equal(data.records.reportMetadata[1].doubleMajorText,null);
  const catalog=evidenceReferenceCatalog(sources),paths=catalog.sources.find(row=>row.evidenceId===sourceId)!.jsonPaths;
  for(const path of ['/requestedReportKind','/rules','/checkedAt','/records/categories/0/requiredCredits','/records/categories/0/completedCredits','/records/categories/0/detailSubtotalCredits','/records/reportMetadata/0/sourceMode','/records/reportMetadata/1/doubleMajorText','/records/statuses/0/text'])assert.ok(paths.includes(path),path);
  assert.equal(reviewMatchesEvidence(review([claim(['/records/categories/0/requiredCredits','/records/categories/0/completedCredits'])]),sources),true);
  assert.equal(reviewMatchesEvidence(review([claim(['/records/reportMetadata/1/doubleMajorText'])]),sources),true,'An actual null field exists; its value must still be interpreted as null.');
});

test('familiar nested graduation shapes and approximate paths remain unsupported',()=>{
  const sources=nativeSources();
  for(const path of ['/records/reports/0/categories/0/requiredCredits','/reports/0/categories/0/requiredCredits','/records/category/0/requiredCredits','/records/categories/00/requiredCredits','#/records/categories/0/requiredCredits','$.records.categories[0].requiredCredits','/records/categories/0/missingCredits','/records/categories/1/requiredCredits'])assert.equal(reviewMatchesEvidence(review([claim([path])]),sources),false,path);
  assert.equal(reviewMatchesEvidence(review([claim(['/records/categories/0/requiredCredits'],{evidenceId:'account:academicGrades'})]),sources),false);
  assert.equal(reviewMatchesEvidence(review([claim(['/records/categories/0/requiredCredits'],{supported:false})]),sources),false);
  assert.equal(reviewMatchesEvidence(review([claim(['/records/categories/0/requiredCredits'],{quotes:['"requiredCredits":999']})]),sources),false,'A real address does not excuse a mismatched quoted value.');
});

test('catalog escapes slash and tilde keys without exposing an invented path or field value',()=>{
  const sources=[{id:'structured',content:JSON.stringify({'with/slash':{'~credit':0,nullable:null},empty:[],text:'PRIVATE_FIELD_VALUE'})}];
  const catalog=evidenceReferenceCatalog(sources),paths=catalog.sources[0].jsonPaths;
  assert.ok(paths.includes('/with~1slash/~0credit'));assert.ok(paths.includes('/with~1slash/nullable'));assert.ok(paths.includes('/empty'));
  assert.equal(JSON.stringify(catalog).includes('PRIVATE_FIELD_VALUE'),false);
  const input=review([claim(['/with~1slash/~0credit','/with~1slash/nullable'],{evidenceId:'structured'})]);
  assert.equal(reviewMatchesEvidence(input,sources),true);
  assert.equal(reviewMatchesEvidence(review([claim(['/with/slash/~credit'],{evidenceId:'structured'})]),sources),false);
});

test('reference guidance is bounded and marked partial for large flattened sources',()=>{
  const sources=Array.from({length:20},(_,source)=>({id:'account:synthetic-'+source,content:JSON.stringify({records:Array.from({length:800},(_,i)=>({id:i,['長欄位名稱'.repeat(5)]:i,grade:null}))})}));
  const catalog=evidenceReferenceCatalog(sources);
  assert.equal(catalog.partial,true);assert.ok(Buffer.byteLength(JSON.stringify(catalog),'utf8')<=24000);
  assert.ok(catalog.sources.reduce((n,row)=>n+row.jsonPaths.length,0)<=512);
  assert.equal(catalog.sources.length,sources.length,'A large early source must not remove later sources from the guide.');
  assert.ok(catalog.sources.every(row=>new Set(row.jsonPaths).size===row.jsonPaths.length));
  assert.equal(evidenceReferenceCatalog([{id:'text',content:'A plain text source.'}]).sources.length,0);
});

test('invalid references produce correction feedback even if the reviewer declares every claim supported',async()=>{
  const sources=nativeSources();
  await mockReview([review([claim(['/records/reports/0/SECRET_PATH_TOKEN'],{claim:'SECRET_CLAIM_VALUE'})])],async(requests,logs)=>{
    const result=await verifyEvidenceAnswer({question,candidate,evidence:sources,deadline:Date.now()+10000});
    assert.equal(result.ok,false);assert.equal(result.reason,'unsupported_claims');
    assert.ok(result.feedback?.some(item=>item.includes('invalid_json_pointer')&&item.includes(sourceId)));
    const sent=JSON.parse(requests[0].input[0].content[0].text);
    assert.ok(sent.referenceCatalog.sources.some((row:any)=>row.evidenceId===sourceId&&row.jsonPaths.includes('/records/categories/0/requiredCredits')));
    assert.match(requests[0].instructions,/flattened/);assert.match(requests[0].instructions,/actual values/);
    assert.equal(requests[0].max_output_tokens,8192);
    const diagnostics=JSON.stringify(logs);
    assert.doesNotMatch(diagnostics,/SECRET_PATH_TOKEN|SECRET_CLAIM_VALUE/,'Provider diagnostics must not log raw claim text or invalid paths.');
    assert.match(diagnostics,/unmatchedReferences/);
  });
});

test('wrong-source reference diagnostics do not silently borrow an identically shaped source',async()=>{
  await mockReview([review([claim(['/records/categories/0/requiredCredits'],{evidenceId:'account:other'})])],async()=>{
    const result=await verifyEvidenceAnswer({question,candidate,evidence:nativeSources(),deadline:Date.now()+10000});
    assert.equal(result.ok,false);assert.ok(result.feedback?.some(item=>item.includes('unknown_evidence_source')));
  });
});

test('strict reference correction uses at most two reviews and one repair, with no automatic approval',async()=>{
  const sources=nativeSources(),invalid=review([claim(['/records/reports/0/categories/0/requiredCredits'])]),valid=review([claim(['/records/categories/0/requiredCredits','/records/categories/0/completedCredits'])]);
  let repairs=0;
  await mockReview([invalid,valid],async(requests)=>{
    const result=await runAnswerVerification({question,initialAnswer:candidate,deadline:Date.now()+10000,loadEvidence:async()=>sources,verify:verifyEvidenceAnswer,
      repair:async({feedback,candidate:prior})=>{repairs++;assert.ok(feedback?.some((item:string)=>item.includes('invalid_json_pointer')));return prior;}});
    assert.equal(result.verification.status,'verified');assert.equal(result.verification.attempts,2);assert.equal(repairs,1);assert.equal(requests.length,2);
  });
  await mockReview([invalid,invalid],async(requests)=>{
    const result=await runAnswerVerification({question,initialAnswer:candidate,deadline:Date.now()+10000,loadEvidence:async()=>sources,verify:verifyEvidenceAnswer,repair:async({candidate:prior})=>prior});
    assert.equal(result.verification.status,'unverified');assert.equal(result.verification.attempts,2);assert.equal(result.status,'abstained');assert.equal(requests.length,2);
  });
});
