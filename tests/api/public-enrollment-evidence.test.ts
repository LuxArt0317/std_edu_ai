import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import test from 'node:test';
import document from '../../server/data/ipiac115.json' with {type:'json'};
import {publicPageForRoute} from '../../server/publicPageContext.js';
import {extractEnrollmentMilestones,isPublicEnrollmentDateQuestion,publicEnrollmentContext} from '../../server/publicEnrollmentEvidence.js';

test('admission milestones come from the actual source PDF and retain event/cohort distinctions',async()=>{
 const bytes=await readFile('public'+document.pdfUrl);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),document.checksum);
 const rows=extractEnrollmentMilestones(document.pages);
 const byRole=Object.fromEntries(rows.map(row=>[row.role,row]));
 assert.equal(byRole['application-opening'].date,'2026-05-20');
 assert.equal(byRole['document-submission-deadline'].date,'2026-06-11');
 assert.equal(byRole['classes-start'].date,'2026-09-07');
 assert.equal(byRole['check-in-registration-deadline'].date,'2026-10-12');
 for(const row of rows)assert.ok(document.pages.find(page=>page.locator===row.locator)?.text.includes(row.text));
});
test('an unspecified enrollment question requests selectors instead of assuming the source cohort',async()=>{
 const context=publicEnrollmentContext('When does enrollment start?',{now:new Date('2026-11-25T00:00:00Z')})!;
 const metadata=JSON.parse(context.evidence.content);
 assert.equal(metadata.questionScope.resolvedToThisSource,false);
 assert.deepEqual(metadata.questionScope.missingSelectors,['admission track/program','entry academic year/intake']);
 assert.equal(metadata.sourceCohort.program,'IPIAC');
 assert.ok(metadata.milestones.every((row:{temporalStatus:string})=>row.temporalStatus==='past'));
 assert.equal(metadata.milestones.some((row:{role:string})=>row.role==='check-in-registration-deadline'),false);
 const nav=JSON.parse(context.additionalEvidence[0].content).navigation;
 for(const entry of nav){const page=publicPageForRoute(entry.url)!;assert.ok(page);assert.equal(createHash('sha256').update(await readFile('public'+page.file)).digest('hex'),page.checksum);}
 assert.ok(nav.some((entry:{url:string})=>entry.url==='/admissions'));
 assert.ok(nav.some((entry:{url:string})=>entry.url.includes('admission-information')));
});
test('another year or track never inherits IPIAC dates and private/course questions stay outside this path',()=>{
 for(const question of ['When does enrollment start in 2027?','When does transfer admission start?']){
  const context=publicEnrollmentContext(question,{now:new Date('2026-11-25T00:00:00Z')})!;
  const metadata=JSON.parse(context.evidence.content);assert.deepEqual(metadata.milestones,[]);assert.equal(metadata.questionScope.historicalMilestonesOmitted,true);
 }
 const matching=publicEnrollmentContext('When does 115 IPIAC registration start?',{now:new Date('2026-11-25T00:00:00Z')})!;
 assert.equal(JSON.parse(matching.evidence.content).questionScope.resolvedToThisSource,true);
 assert.ok(JSON.parse(matching.evidence.content).milestones.some((row:{role:string})=>row.role==='check-in-registration-deadline'));
 assert.equal(isPublicEnrollmentDateQuestion('When can I enroll at STU?'),true);
 for(const question of ['When do dorm applications open?','When does teacher workshop registration start?','When does parking registration open?','When does course registration start?','When did my enrollment start?','When can you apply for me?'])assert.equal(isPublicEnrollmentDateQuestion(question),false);
 assert.throws(()=>extractEnrollmentMilestones([]),/timeline table missing/u);
});

test('the actual handler selects scoped admission evidence and mixed review instead of an unrelated new-student capture',async()=>{
 const {createResearchAssistantHandler}=await import('../../api/research-assistant.ts');
 const originalFetch=globalThis.fetch,names=['OPENAI_API_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'] as const;
 const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 process.env.OPENAI_API_KEY='unit-test-only';process.env.VITE_SUPABASE_URL='https://enrollment-unit.supabase.co';process.env.VITE_SUPABASE_PUBLISHABLE_KEY='unit-test-only';
 const requests:any[]=[];let captureReads=0,liveReads=0;
 globalThis.fetch=async(url,options)=>{
  assert.equal(String(url),'https://api.openai.com/v1/responses');
  const request=JSON.parse(String(options?.body));requests.push(request);
  const input=JSON.parse(request.input[0].content[0].text);
  const source=input.evidence.find((row:any)=>row.id.startsWith('public-document:admission-milestones:'));
  assert.ok(source,'The known cohort timeline must be selected before generic admissions search');
  const metadata=JSON.parse(source.content),nav=input.evidence.find((row:any)=>row.id==='published-guidance');
  assert.equal(metadata.sourceCohort.program,'IPIAC');
  assert.equal(metadata.questionScope.resolvedToThisSource,false);
  const deadlineIndex=metadata.milestones.findIndex((row:any)=>row.role==='document-submission-deadline');
  const classesIndex=metadata.milestones.findIndex((row:any)=>row.role==='classes-start');
  let result;
  if(request.text.format.name==='compose_grounded_answer')result={status:'answered',sourceIds:[source.id,nav.id],
   answer:`Which admission track and entry year do you mean?\n\nFor the source's ${metadata.sourceCohort.academicYear} IPIAC intake, document submission was due ${metadata.milestones[deadlineIndex].date} and classes started ${metadata.milestones[classesIndex].date}. These are source-specific milestones, not a universal registration opening.\n\n[Admissions](${JSON.parse(nav.content).navigation[0].url})`};
  else{
   assert.ok(request.text.format.schema.properties.parts,'The independent review must retain mixed fact/clarification mode');
   result={supported:true,answersQuestion:true,parts:input.answerParts.map((part:any)=>({id:part.id,kind:part.text.endsWith('?')?'clarification':'factual',accepted:true,
    claims:part.text.endsWith('?')?[]:[{claim:part.text,supported:true,evidenceId:part.text.startsWith('[Admissions]')?nav.id:source.id,quotes:[],
     jsonPaths:part.text.startsWith('Source snapshot:')?['/capturedOn']:part.text.startsWith('[Admissions]')?['/navigation/0/url']:
      ['/sourceCohort/academicYear',`/milestones/${deadlineIndex}/date`,`/milestones/${classesIndex}/date`,'/coverage']}]}))};
  }
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
 };
 try{
  const handler=createResearchAssistantHandler({loadPublicPage:async()=>{captureReads++;return null;},readSources:async()=>{liveReads++;return [];}});
  let body:any,status=200;const response:any={status(code:number){status=code;return response;},json(value:any){body=value;},setHeader(){}};
  await handler({method:'POST',body:{question:'When does enrollment start?',route:'/admissions',history:[]},headers:{'x-forwarded-for':'enrollment-source-unit'}},response);
  assert.equal(status,200);assert.equal(body.verification.status,'verified');
  assert.equal(body.verification.attempts,1);assert.equal(requests.length,2);
  assert.equal(captureReads,0);assert.equal(liveReads,0);
  assert.match(body.answer,/Which admission track/u);
 }finally{globalThis.fetch=originalFetch;for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}}
});


test('event admission and exhibition entry do not become degree enrollment dates',()=>{
 for(const question of ['When does STU exhibition admission open?','When can visitors register for the campus concert event?','樹德展覽的門票何時開放？']){
  assert.equal(isPublicEnrollmentDateQuestion(question),false);
  assert.equal(publicEnrollmentContext(question),null);
 }
 assert.equal(isPublicEnrollmentDateQuestion('When does IPIAC admission open?'),true);
});
