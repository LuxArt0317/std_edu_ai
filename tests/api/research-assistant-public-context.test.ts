import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import captures from '../../src/features/public/mirror/pages.json' with {type:'json'};
import {createResearchAssistantHandler} from '../../api/research-assistant.ts';
import {loadPublicPageContext,type PublicPageContext} from '../../server/publicPageContext.js';

const originalFetch=globalThis.fetch;
const names=['OPENAI_API_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'] as const;
const old=Object.fromEntries(names.map(name=>[name,process.env[name]]));
after(()=>{globalThis.fetch=originalFetch;for(const name of names){if(old[name]===undefined)delete process.env[name];else process.env[name]=old[name];}});
function configure(){process.env.OPENAI_API_KEY='synthetic-public-context';process.env.VITE_SUPABASE_URL='https://public-context-test.supabase.co';process.env.VITE_SUPABASE_PUBLISHABLE_KEY='synthetic-publishable';}
const page=captures.find(item=>decodeURI(item.route)==='/在校學生/')!;
const question='What is this page about? Give me its page title and a link to this page on stu.best. State its capture date.';
let address=0;
async function invoke(body:unknown,loadPublicPage?:typeof loadPublicPageContext){
  const run=createResearchAssistantHandler({loadPublicPage});
  const result:{statusCode:number;body:any;headers:Record<string,string>}={statusCode:200,body:null,headers:{}};
  const response={status(code:number){result.statusCode=code;return response;},json(value:unknown){result.body=value;},setHeader(name:string,value:string){result.headers[name]=value;}};
  await run({method:'POST',body,headers:{'x-forwarded-for':'public-context-'+(++address)}},response);
  return result;
}
async function context(){return (await loadPublicPageContext(page.route,0))!;}
function review(evidence:PublicPageContext['evidence'],supported=true){return {supported,answersQuestion:supported,claims:[{claim:'Captured page identity and date.',supported,evidenceId:evidence.id,quotes:[],jsonPaths:['/pageTitle','/localUrl','/capturedOn','/contentAvailable']}]};}
const modelResponse=(payload:unknown)=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(payload)}]}]});

test('this-page requests preserve encoded public routes and send actual snapshot metadata to verification',async()=>{
  configure();const saved=await context();let loaded=0;const requests:any[]=[];
  globalThis.fetch=async(url,init)=>{
    assert.equal(String(url),'https://api.openai.com/v1/responses','No unrelated KB, original-source or database read is needed.');
    const body=JSON.parse(String(init?.body));requests.push(body);
    assert.equal(body.text.format.name,'answer_evidence_review');
    const input=JSON.parse(body.input[0].content[0].text),source=JSON.parse(input.evidence[0].content);
    assert.equal(source.pageTitle,page.title);assert.equal(source.localUrl,page.route);assert.equal(source.capturedOn,page.capturedOn);
    assert.equal(source.contentAvailable,false);assert.match(input.answer,/text is unavailable/);
    return modelResponse(review(saved.evidence));
  };
  const result=await invoke({question,route:encodeURI(decodeURI(page.route))+'#main'},async(route,deadline)=>{
    loaded++;assert.equal(route,page.route);assert.ok(deadline-Date.now()<=55000);return saved;
  });
  assert.equal(result.statusCode,200);assert.equal(result.body.status,'answered');assert.equal(result.body.verification.status,'verified');
  assert.match(result.body.answer,new RegExp(page.capturedOn));assert.equal(result.body.citations[0].url,page.route);
  assert.equal(result.body.grounding.source,'public-page-context');assert.equal(result.body.grounding.contentAvailable,false);
  assert.equal(loaded,1);assert.equal(requests.length,1);assert.match(result.headers['Cache-Control'],/no-store/);
});

test('content questions can be corrected once from the captured page without a web lookup or third review',async()=>{
  configure();const saved=await context(),data=JSON.parse(saved.evidence.content);
  data.contentAvailable=true;data.contentStatus='verified_snapshot';data.excerpt='The help desk opens at 08:30.';
  saved.contentAvailable=true;saved.evidence.content=JSON.stringify(data);let calls=0;
  globalThis.fetch=async(url,init)=>{
    assert.equal(String(url),'https://api.openai.com/v1/responses');const body=JSON.parse(String(init?.body));calls++;
    if(calls===1){assert.equal(body.text.format.name,'answer_evidence_review');return modelResponse(review(saved.evidence,false));}
    if(calls===2){assert.equal(body.text.format.name,'correct_grounded_answer');const input=JSON.parse(body.input[0].content[0].text);assert.match(input.evidence[0].content,/08:30/);return modelResponse({status:'answered',answer:`The help desk opens at 08:30. [${page.title}](${page.route})`,sourceIds:[saved.evidence.id]});}
    assert.equal(calls,3);assert.equal(body.text.format.name,'answer_evidence_review');return modelResponse({supported:true,answersQuestion:true,claims:[{claim:'Help desk opens at 08:30.',supported:true,evidenceId:saved.evidence.id,quotes:[],jsonPaths:['/excerpt','/capturedOn']}]});
  };
  const result=await invoke({question:'What opening time is given on this page?',route:page.route},async()=>saved);
  assert.equal(result.body.verification.status,'verified');assert.equal(result.body.verification.attempts,2);assert.match(result.body.answer,/08:30/);
  assert.match(result.body.answer,/Source snapshot: 2026-11-03/);assert.equal(calls,3);
});

test('unverified corrections stay withheld even when public page metadata exists',async()=>{
  configure();const saved=await context();let calls=0;
  globalThis.fetch=async(_url,init)=>{
    const body=JSON.parse(String(init?.body));calls++;
    if(body.text.format.name==='correct_grounded_answer')return modelResponse({status:'answered',answer:'The deadline is November 30.',sourceIds:[saved.evidence.id]});
    return modelResponse(review(saved.evidence,false));
  };
  const result=await invoke({question:'What is the deadline on this page?',route:page.route},async()=>saved);
  assert.equal(result.body.status,'abstained');assert.equal(result.body.verification.status,'unverified');assert.equal(result.body.verification.attempts,2);
  assert.doesNotMatch(result.body.answer,/November 30/);assert.equal(calls,3);
});

test('private questions mentioning this page do not enter public capture or model research',async()=>{
  configure();let loads=0;const network:string[]=[];
  globalThis.fetch=async(url)=>{network.push(String(url));return String(url).includes('record_public_ai_exchange')?Response.json([{feedback_token:'a'.repeat(64),feedback_expires_at:'2026-12-01T00:00:00Z'}]):Response.json({});};
  for(const privateQuestion of ['What are my grades on this page?','Explain this page and my current subjects.','這頁上我的課表是什麼？','How much is my tuition on this page?','這頁上我的學費是多少？']) {
    const result=await invoke({question:privateQuestion,route:page.route},async()=>{loads++;throw new Error('Public page must not answer private account questions');});
    assert.equal(result.body.status,'handoff',privateQuestion);assert.match(result.body.answer,/school-affairs\/login/);
  }
  assert.equal(loads,0);assert.ok(network.every(url=>url.includes('record_research_operational_event')||url.includes('record_public_ai_exchange')),'Only existing response/operational recording, no private retrieval or provider requests.');
});

test('unknown, private and absolute routes cannot be passed into the captured-page loader',async()=>{
  configure();let loads=0;
  globalThis.fetch=async()=>Response.json([]);
  for(const route of ['/app/knowledge','/school-affairs/services/leave','https://stu.best/在校學生/','/invented/','//127.0.0.1/']) {
    const result=await invoke({question,route},async()=>{loads++;throw new Error('Unknown context must not load');});
    assert.notEqual(result.body.grounding?.source,'public-page-context');
  }
  assert.equal(loads,0);
});

test('attached images retain the image flow instead of being replaced by page metadata',async()=>{
  configure();let loads=0;
  const image=Buffer.alloc(32);Buffer.from('89504e470d0a1a0a','hex').copy(image);
  globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));assert.equal(body.text.format.name,'school_affairs_image_answer');return new Response(null,{status:503});};
  const result=await invoke({question,route:page.route,images:[{name:'test.png',dataUrl:'data:image/png;base64,'+image.toString('base64')}]},async()=>{loads++;return context();});
  assert.equal(result.statusCode,502);assert.equal(loads,0);
});
