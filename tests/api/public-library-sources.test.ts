import assert from 'node:assert/strict';
import {test,type TestContext} from 'node:test';
import {createResearchAssistantHandler} from '../../api/research-assistant.ts';
import {readVerificationSources} from '../../server/answerVerificationSources.js';
import {findOfficialLibraryServiceLeads} from '../../server/publicLibrarySources.js';

const faq='https://www.lib.stu.edu.tw/service/faq/';
const rooms='https://www.lib.stu.edu.tw/service/roomequipmentreserve/';
const generic='https://about.stu.edu.tw/library-information/';
const question='Check the latest Shu-Te University library information. What do people without a university ID need to enter, how many students are needed to reserve a discussion room and for how long, and how do students access library databases from off campus? Please link the sources you verify.';

const fakeEntry='訪客出示測試訪客證。',fakeAccess='校外讀者進入測試資料庫平台。',fakeReservation='討論室測試規則為六人，使用九十分鐘。';
const genericFact='Shu-Te University provides a library service.';
const english='In this test source, visitors present a test visitor pass. Off campus, students use the test database portal. The test room takes six students for 90 minutes.';
const traditional='在這份測試資料中，訪客出示測試訪客證；校外讀者進入測試資料庫平台。討論室需要六人，可用九十分鐘。';
const wrongLocale='這次查到了圖書館的基本資料。館外規則和最新辦法仍無法確認。';
const provider=(value:unknown)=>Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
const empty=()=>Response.json({output:[]});
const search=(url:string,answer:string)=>Response.json({output:[
  {type:'web_search_call',status:'completed',action:{sources:[{url,title:'Controlled library source'}]}},
  {type:'message',content:[{text:JSON.stringify({status:'answered',source_urls:[url],answer})}]},
]});
const html=(url:string,document:string)=>({mimeType:'text/html',bytes:new TextEncoder().encode(document),finalUrl:url,status:200});

function environment(t:TestContext){
  const previous=new Map(Object.entries({
    OPENAI_API_KEY:'control-library-key',VITE_SUPABASE_URL:'https://control-library.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'control-publish',
  }).map(([key,value])=>{const old=process.env[key];process.env[key]=value;return [key,old];}));
  t.after(()=>{for(const [key,old] of previous){if(old===undefined)delete process.env[key];else process.env[key]=old;}});
}

type Handler=ReturnType<typeof createResearchAssistantHandler>;
type Activity={kind:string;status:string};
let counter=0;
async function request(handler:Handler,visibleQuestion:string,history:unknown[]=[]){
  let result:any;
  const events:Activity[]=[];
  const sink={status(status:number){assert.equal(status,200);return this;},setHeader(){},json(value:unknown){result=value;},
    write(raw:string){const [,name,value]=/^event: (\w+)\ndata: (.+)\n\n$/u.exec(raw)??[];
      if(name==='progress')events.push(JSON.parse(value));if(name==='result')result=JSON.parse(value);},end(){}};
  await handler({method:'POST',headers:{'x-forwarded-for':'192.0.2.'+(201+counter++)},body:{question:visibleQuestion,history,stream:true}},sink);
  assert.ok(result);
  return {result,events};
}

function mockProvider(t:TestContext,onResponse:(wire:any)=>Response){
  t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init:RequestInit)=>{
    const url=new URL(String(input));
    if(url.href==='https://api.openai.com/v1/embeddings')return Response.json({data:[{embedding:Array(1536).fill(0)}]});
    if(url.href==='https://api.openai.com/v1/responses')return onResponse(JSON.parse(String(init.body)));
    assert.equal(url.origin,'https://control-library.supabase.co','All provider traffic is controlled');
    if(url.pathname.endsWith('/search_public_knowledge'))return Response.json([]);
    return Response.json(null);
  });
}

test('the specific library subjects select bilingual official navigation before a generic search',()=>{
  for(const candidate of [question,'請問樹德圖書館的校外人士入館、討論室預約和電子資源校外連線規定？'])
    assert.deepEqual(findOfficialLibraryServiceLeads(candidate).map(source=>source.url),[faq,rooms]);
  assert.deepEqual(findOfficialLibraryServiceLeads('What is the STU library procedure off campus?').map(source=>source.url),[faq]);
  assert.deepEqual(findOfficialLibraryServiceLeads('Please find the STU library discussion room rules').map(source=>source.url),[rooms,faq]);
  assert.deepEqual(findOfficialLibraryServiceLeads('How old is the university library building?'),[]);
});

for(const localized of [false,true])test(`the real guest handler verifies accessible library contents before broad discovery (${localized?'Chinese':'English'})`,async t=>{
  environment(t);
  const order:string[]=[],before=localized?'請問圖書館的訪客入館、討論室人數與時間，以及電子資源校外連線規定？':question;
  mockProvider(t,wire=>{
    const name=wire.text.format.name,input=JSON.parse(wire.input[0].content[0].text);
    order.push(name);
    assert.deepEqual(input.evidence.map((source:{url:string})=>source.url),[faq,rooms]);
    if(name==='compose_grounded_answer'){
      assert.match(wire.instructions,localized?/all explanatory prose.*Traditional Chinese/u:/all explanatory prose.*English/u);
      return provider({status:'answered',answer:localized?traditional:english,sourceIds:input.evidence.map((source:{id:string})=>source.id)});
    }
    assert.equal(name,'answer_evidence_review');
    return provider({supported:true,answersQuestion:true,missingRequestedDetails:[],claims:[
      {claim:'Test entry and off-campus data procedure',supported:true,evidenceId:'library:faq',quotes:[fakeEntry,fakeAccess],jsonPaths:[]},
      {claim:'Test discussion-room minimum and duration',supported:true,evidenceId:'library:room-reservation',quotes:[fakeReservation],jsonPaths:[]},
    ]});
  });
  const handler=createResearchAssistantHandler({readSources:(citations,deadline,deps)=>readVerificationSources(citations,deadline,{
    ...deps,captures:[],acquire:async url=>{
      order.push(url);
      assert.ok([faq,rooms].includes(url));
      return html(url,url===faq?`<main><p>${fakeEntry}</p><p>${fakeAccess}</p></main>`:
        `<main><p>${fakeReservation}</p></main>`);
    },
  })});
  const {result,events}=await request(handler,before);
  assert.equal(result.verification.status,'verified');
  assert.equal(result.answer,localized?traditional:english);
  assert.deepEqual(result.citations.map((citation:{url:string})=>citation.url),[faq,rooms]);
  assert.deepEqual(order,[faq,rooms,'compose_grounded_answer','answer_evidence_review']);
  assert.equal(result.grounding.webSearched,false);
  assert.ok(events.some(step=>step.kind==='library-primary-source'&&step.status==='complete'));
  assert.equal(events.some(step=>step.kind==='school-source-lead'),false);
});

test('a 405 and an in-place browser challenge become English navigation leads, never evidence or school sign-in',async t=>{
  environment(t);
  const searches:any[]=[],direct:string[]=[];
  mockProvider(t,wire=>{
    assert.equal(wire.text.format.name,'stu_web_answer');
    searches.push(wire);
    if(searches.length===1)return search(rooms,'An unverified draft invents a 99-hour reservation.');
    return empty();
  });
  const handler=createResearchAssistantHandler({readSources:(citations,deadline,deps)=>readVerificationSources(citations,deadline,{
    ...deps,captures:[],acquire:async url=>{
      direct.push(url);
      if(url===faq)throw Error('The source returned HTTP 405.');
      assert.equal(url,rooms);
      return html(url,'<title>Human Verification</title><main><p>Challenge body contains a bogus 99-hour reservation claim.</p></main>');
    },
  })});
  const englishWithLabel=question+' The library label is 圖書館.';
  const {result,events}=await request(handler,englishWithLabel,[{role:'assistant',content:'PRIVATE_ASSISTANT_SENTINEL'},
    {role:'user',content:'What is my student ID PRIVATE_HISTORY_SENTINEL?'}]);
  assert.deepEqual(searches[0].tools[0].filters.allowed_domains,['lib.stu.edu.tw']);
  assert.match(searches[0].instructions,/faq\/.*roomequipmentreserve\//u);
  assert.equal(JSON.parse(searches[0].input).responseLanguage,'English');
  assert.doesNotMatch(JSON.stringify(searches),/PRIVATE_/u);
  assert.equal(result.status,'abstained');
  assert.match(result.answer,/^I could not verify the library details/u);
  assert.match(result.answer,/\[STU Library FAQ\]\(https:\/\/www\.lib\.stu\.edu\.tw\/service\/faq\/\)/u);
  assert.match(result.answer,/\[STU Library space and equipment reservations\]\(https:\/\/www\.lib\.stu\.edu\.tw\/service\/roomequipmentreserve\/\)/u);
  assert.match(result.answer,/I could not read this page to verify the details/u);
  assert.doesNotMatch(JSON.stringify(result),/登[入錄]|school sign-in|99-hour|Challenge body/iu);
  assert.deepEqual(result.citations,[]);
  assert.ok(direct.every(url=>[faq,rooms].includes(url)));
  assert.equal(events.filter(step=>step.kind==='school-source-lead').length,1);
  assert.ok(result.activity.some((step:Activity)=>step.kind==='library-primary-source'&&step.status==='unavailable'));
});

test('a wrong-language web draft is repaired in English before the partial answer can pass',async t=>{
  environment(t);
  const stages:string[]=[];
  mockProvider(t,wire=>{
    const name=wire.text.format.name;stages.push(name);
    if(name==='stu_web_answer')return stages.length===1?search(generic,wrongLocale):empty();
    const input=JSON.parse(wire.input[0].content[0].text);
    assert.deepEqual(input.evidence.map((source:{url:string})=>source.url),[generic]);
    if(name==='correct_grounded_answer'){
      assert.match(wire.instructions,/all explanatory prose.*English/u);
      return provider({status:'answered',answer:genericFact+' I could not verify visitor entry, discussion room reservation, or off-campus database access.',
        sourceIds:[input.evidence[0].id]});
    }
    assert.equal(name,'answer_evidence_review');
    assert.doesNotMatch(input.answer,/查到/u);
    return provider({supported:true,answersQuestion:true,missingRequestedDetails:['visitor entry','discussion rooms','off-campus databases'],
      claims:[{claim:genericFact,supported:true,evidenceId:input.evidence[0].id,quotes:[genericFact],jsonPaths:[]}]});
  });
  const handler=createResearchAssistantHandler({readSources:(citations,deadline,deps)=>readVerificationSources(citations,deadline,{
    ...deps,captures:[],acquire:async url=>{
      if(url===faq||url===rooms)throw Error('The source returned HTTP 405.');
      assert.equal(url,generic);
      return html(url,`<main><p>${genericFact}</p></main>`);
    },
  })});
  const {result}=await request(handler,question);
  assert.equal(result.verification.status,'verified');
  assert.match(result.answer,/^Shu-Te University provides a library service/u);
  assert.match(result.answer,/STU Library FAQ/u);
  assert.doesNotMatch(result.answer,/查到|school sign-in/u);
  assert.deepEqual(result.citations.map((citation:{url:string})=>citation.url),[generic]);
  assert.ok(stages.includes('correct_grounded_answer'));
});

test('a private library-record request never reaches website discovery or source reads',async t=>{
  environment(t);
  mockProvider(t,()=>assert.fail('No search or provider call for a private record request'));
  const handler=createResearchAssistantHandler({readSources:async()=>assert.fail('No public source read for a private record request')});
  const {result}=await request(handler,'What is my student ID for the library database?');
  assert.equal(result.status,'handoff');
  assert.doesNotMatch(result.answer,/www\.lib\.stu\.edu\.tw/u);
});
