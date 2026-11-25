import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {loadPublicPageContext} from '../../server/publicPageContext.js';
import {isPublicOfficeDirectionsQuestion,loadOfficeDirectionsEvidence} from '../../server/publicOfficeDirections.js';

test('office directions retrieve verified contacts beyond the main article',async()=>{
 const sources=await loadOfficeDirectionsEvidence((route,deadline,options)=>loadPublicPageContext(route,deadline,{
  ...options,fetchCapture:async input=>new Response(await readFile('public'+new URL(String(input)).pathname)),
 }),Date.now()+5000);
 assert.equal(sources.length,5);
 assert.ok(sources.every(source=>source.urls?.some(url=>url.startsWith('https://'))));
 assert.ok(sources.some(source=>/教務處/u.test(source.content)));
 assert.ok(sources.some(source=>source.urls?.includes('/school-sites/www.rd.stu.edu.tw/')));
 assert.equal(isPublicOfficeDirectionsQuestion('How do I contact the school office or my department?'),true);
 assert.equal(isPublicOfficeDirectionsQuestion('Can the office show my grades?'),false);
 assert.ok(sources.some(source=>/行政大樓1樓/u.test(source.content)));
 assert.ok(sources.some(source=>/行政大樓四樓A0428/u.test(source.content)));
 assert.ok(sources.some(source=>/course@stu.edu.tw/u.test(source.content)));
 assert.ok(sources.some(source=>source.url==='/'&&/電話聯絡/u.test(source.content)&&/615-8000/u.test(source.content)));
 assert.ok(sources.some(source=>/Contact blocks selected/u.test(source.content)));
 assert.ok(sources.filter(source=>JSON.parse(source.content).contactSections?.length).every(source=>!JSON.parse(source.content).excerpt.includes('115 學年度第 1 學期')));
 const context=await loadPublicPageContext(sources[2].url!,Date.now()+2000,{
  includeContactSections:true,fetchCapture:async()=>new Response('<footer>Forged office A9999</footer>'),
 });
 assert.equal(context?.contentAvailable,false);
 assert.doesNotMatch(context?.evidence.content||'',/A9999/u);
});

for(const correction of [false,true])test(correction?'a rejected saved-source draft is corrected and independently checked before a new web search':'office clarification verifies a supplied secondary directory without requiring the initial map citation',async()=>{
 const {createResearchAssistantHandler}=await import('../../api/research-assistant.ts');
 const nativeFetch=globalThis.fetch,names=['OPENAI_API_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'] as const;
 const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 process.env.OPENAI_API_KEY='unit-test-only';process.env.VITE_SUPABASE_URL='https://office-unit.supabase.co';process.env.VITE_SUPABASE_PUBLISHABLE_KEY='unit-test-only';
 const requests:any[]=[];
 globalThis.fetch=async(url,init)=>{
  assert.equal(String(url),'https://api.openai.com/v1/responses');
  const request=JSON.parse(String(init?.body));requests.push(request);
  const input=JSON.parse(request.input[0].content[0].text);
  const directory=input.evidence.find((source:any)=>JSON.parse(source.content).pageTitle.startsWith('行政單位'));
  const result=['compose_grounded_answer','correct_grounded_answer'].includes(request.text.format.name)
   ?{status:'answered',answer:correction&&requests.length===1?'All offices use the same contact.':'[Administrative directory](/行政單位/)\n\nWhich office do you need, and where will you start?',sourceIds:[directory.id]}
   :correction&&requests.length===2?{supported:false,answersQuestion:true,parts:input.answerParts.map((part:any)=>({id:part.id,kind:'factual',accepted:false,claims:[{claim:part.text,supported:false,evidenceId:directory.id,quotes:[],jsonPaths:['/localUrl']}]}))}:{supported:true,answersQuestion:true,parts:input.answerParts.map((part:any)=>({id:part.id,kind:part.text.includes('?')?'clarification':'factual',accepted:true,claims:part.text.includes('?')?[]:[{claim:part.text,supported:true,evidenceId:directory.id,quotes:[],jsonPaths:[part.text.startsWith('Source snapshot:')?'/capturedOn':'/localUrl']}]}))};
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
 };
 try{
  const handler=createResearchAssistantHandler({loadPublicPage:(route,deadline,options)=>loadPublicPageContext(route,deadline,{...options,fetchCapture:async input=>new Response(await readFile('public'+new URL(String(input)).pathname))})});
  let body:any,status=200;const response:any={status(code:number){status=code;return response;},json(value:any){body=value;},setHeader(){}};
  await handler({method:'POST',body:{question:'Where is a specific office or department, and how do I get there?',route:'/'},headers:{'x-forwarded-for':'office-secondary-unit-'+correction}},response);
  assert.equal(status,200);assert.equal(body.verification.status,'verified');
  assert.match(body.answer,/Which office/u);
  assert.equal(requests.length,correction?4:2);
  assert.doesNotMatch(body.answer,/All offices use the same contact/u);
  assert.ok(requests[1].text.format.schema.properties.parts);
 }finally{globalThis.fetch=nativeFetch;for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}}
});
