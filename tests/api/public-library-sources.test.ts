import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test,type TestContext} from 'node:test';
import {createResearchAssistantHandler} from '../../api/research-assistant.ts';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {readVerificationSources} from '../../server/answerVerificationSources.js';
import {findOfficialLibraryServiceLeads} from '../../server/publicLibrarySources.js';

const faq='https://www.lib.stu.edu.tw/service/faq/';
const rooms='https://www.lib.stu.edu.tw/service/roomequipmentreserve/';
const hours='https://lis.stu.edu.tw/115-08-26-9/';
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
async function request(handler:Handler,visibleQuestion:string,history:unknown[]=[],authorization?:string){
  let result:any;
  const events:Activity[]=[];
  const sink={status(status:number){assert.equal(status,200);return this;},setHeader(){},json(value:unknown){result=value;},
    write(raw:string){const [,name,value]=/^event: (\w+)\ndata: (.+)\n\n$/u.exec(raw)??[];
      if(name==='progress')events.push(JSON.parse(value));if(name==='result')result=JSON.parse(value);},end(){}};
  await handler({method:'POST',headers:{'x-forwarded-for':'192.0.2.'+(201+counter++),authorization},body:{question:visibleQuestion,history,stream:true}},sink);
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
  assert.deepEqual(findOfficialLibraryServiceLeads('When does the STU library archive exhibition open?'),[]);
  for (const inquiry of ['When does the STU library open?','Is the STU library open this weekend?','樹德圖書館星期日有開嗎？',
    'Does the Shu-Te University library opening-hours notice list a closure on December 25, 2026?'])
    assert.deepEqual(findOfficialLibraryServiceLeads(inquiry).map(source=>source.url),[hours]);
  assert.deepEqual(findOfficialLibraryServiceLeads('What are the library opening hours and discussion room rules?').map(source=>source.url),
    [hours,rooms,faq]);
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

for (const scenario of ['guest English','guest Chinese','signed-in follow-up'] as const) test(`the published library schedule is read and checked independently (${scenario})`,async t=>{
  environment(t);
  const chinese=scenario==='guest Chinese',signedIn=scenario==='signed-in follow-up';
  const sourceId='library:opening-hours',capturedOn='2026-11-03',stages:string[]=[];
  const weekday='| 各樓層閱覽區 | 08:30 ～ 19:00 | 08:30 ～ 17:00 |';
  const holiday='12/25 (五) 行憲紀念日(閉館)';
  const regularEn='Library reading areas are open 08:30–19:00 Monday through Thursday and 08:30–17:00 Friday.';
  const draft=chinese
    ? '圖書館閱覽區週一至週四開放 08:30–19:00，週五開放 08:30–17:00。115 學年度上學期公告列出 12 月 25 日行憲紀念日閉館。'
    : signedIn?regularEn:regularEn+' The first-semester 115 academic year notice lists a December 25 closure for Constitution Day.';
  const capture=await readFile(new URL('../../public/school-pages/302bc419719c9772ed6b.html',import.meta.url));
  mockProvider(t,wire=>{
    const name=wire.text.format.name,packet=JSON.parse(wire.input[0].content[0].text);
    stages.push(name);
    assert.doesNotMatch(JSON.stringify(packet),/PRIVATE_/u);
    if(signedIn)assert.equal(packet.question,'What are the opening hours for the Shu-Te University library?');
    assert.deepEqual(packet.evidence.map((source:{id:string;url:string;capturedOn:string})=>
      [source.id,source.url,source.capturedOn]),[[sourceId,hours,capturedOn]]);
    const body=JSON.parse(packet.evidence[0].content).content;
    assert.ok(body.includes(weekday));
    assert.match(body,/115學年度上學期 特殊假日閉館公告/u);
    assert.ok(body.includes(holiday),body);
    if(name==='compose_grounded_answer'){
      assert.match(wire.instructions,chinese?/all explanatory prose.*Traditional Chinese/u:/all explanatory prose.*English/u);
      return provider({status:'answered',answer:draft,sourceIds:[sourceId]});
    }
    assert.equal(name,'answer_evidence_review');
    return provider({supported:true,answersQuestion:true,missingRequestedDetails:[],claims:[
      {claim:'Regular reading-area hours',supported:true,evidenceId:sourceId,quotes:[weekday],jsonPaths:[]},
      ...(!signedIn?[{claim:'Holiday closure listed separately',supported:true,evidenceId:sourceId,quotes:[holiday],jsonPaths:[]}]:[]),
    ]});
  });
  const research=createResearchAssistantHandler({readSources:(citations,deadline,deps)=>readVerificationSources(citations,deadline,{
    ...deps,acquire:async url=>{
      assert.equal(url,hours);
      throw Error('The source returned HTTP 403.');
    },
    fetchCapture:async input=>{
      assert.equal(input,'https://stu.best/school-pages/302bc419719c9772ed6b.html');
      return new Response(capture);
    },
  })});
  const auth='synthetic-auth';
  const handler=signedIn?createAffairsAssistantHandler({publicResearch:research,verifyToken:async token=>{
    assert.equal(token,auth);
    return {user:{id:'PRIVATE_USER_ID'},token:auth,key:'PRIVATE_ACCOUNT_KEY',url:'https://synthetic.supabase.co'};
  },loadSnapshot:async()=>assert.fail('Public follow-up must not read account records')}):research;
  const {result,events}=await request(handler,signedIn?'And what are the opening hours?':chinese
    ?'樹德科技大學圖書館平日的開館時間是幾點？12 月 25 日照常開館嗎？'
    :'What does the Shu-Te University library opening-hours notice say about weekdays and a closure on December 25?',
    signedIn?[{role:'user',content:'Where can I find the Shu-Te University library?'},{role:'assistant',content:'PRIVATE_HISTORY'}]:[],
    signedIn?'Bearer '+auth:undefined);
  assert.equal(result.verification.status,'verified',JSON.stringify(result));
  assert.ok(result.answer.startsWith(draft),result.answer);
  assert.match(result.answer,/2026-11-03/u);
  assert.equal(result.grounding.webSearched,false);
  assert.deepEqual(result.citations.map((item:{url:string;sourceName:string})=>[item.url,item.sourceName]),
    [[hours,'Public page snapshot · 2026-11-03']]);
  assert.deepEqual(stages,['compose_grounded_answer','answer_evidence_review']);
  assert.ok(events.some(step=>step.kind==='library-primary-source'&&step.status==='complete'));
});

for (const signedIn of [false,true]) test(`a registrar phone question does not hide the independently grounded library hours (${signedIn?'signed in':'guest'})`,async t=>{
  environment(t);
  const regular='Library reading areas are open 08:30–19:00 Monday through Thursday.';
  const hoursQuote='Reading areas: Monday to Thursday, 08:30–19:00.';
  const auth='controlled-public-lookup';
  const wifi='https://help.ecc.stu.edu.tw/wireless-setting/';
  let reads=0;
  mockProvider(t,wire=>{
    const name=wire.text.format.name,packet=JSON.parse(wire.input[0].content[0].text);
    assert.match(packet.question,/library opening hours/iu);
    assert.doesNotMatch(packet.question,/registrar|PRIVATE_/iu);
    if(name==='compose_grounded_answer')return provider({status:'answered',answer:regular,sourceIds:[packet.evidence[0].id]});
    assert.equal(name,'answer_evidence_review');
    return provider({supported:true,answersQuestion:true,missingRequestedDetails:[],claims:[
      {claim:regular,supported:true,evidenceId:packet.evidence[0].id,quotes:[hoursQuote],jsonPaths:[]},
    ]});
  });
  const research=createResearchAssistantHandler({readSources:(citations,deadline,deps)=>readVerificationSources(citations,deadline,{
    ...deps,acquire:async url=>{
      assert.equal(url,hours);reads++;
      return html(url,`<main><p>${hoursQuote}</p></main>`);
    },
  })});
  const handler=signedIn?createAffairsAssistantHandler({publicResearch:research,verifyToken:async token=>{
    assert.equal(token,auth);
    return {user:{id:'PRIVATE_USER_ID'},token:auth,key:'PRIVATE_ACCOUNT_KEY',url:'https://synthetic.supabase.co'};
  },loadSnapshot:async()=>assert.fail('Public questions must not read account records')}):research;
  const authorization=signedIn?'Bearer '+auth:undefined;
  const history=[{role:'assistant',content:'PRIVATE_ANSWER'}];
  const {result,events}=await request(handler,"What is the STU registrar's phone number, and what are the library opening hours?",history,authorization);
  assert.match(result.answer,/615 8000[\s\S]+08:30–19:00/u);
  assert.equal(result.verification?.status,'verified');
  assert.equal(result.citations[0].chunkId,'campus-navigation:registrar');
  assert.equal(result.citations[1].url,hours);
  assert.ok(events.some(step=>step.kind==='directory'&&step.status==='complete'));
  const reversed=await request(handler,'What are the library opening hours? Also, where can I find the campus Wi-Fi setup guide?',history,authorization);
  assert.match(reversed.result.answer,/08:30–19:00[\s\S]+wireless-setting/u);
  assert.equal(reversed.result.verification?.status,'verified');
  assert.equal(reversed.result.citations[0].url,hours);
  assert.ok(reversed.result.answer.includes(wifi));
  assert.equal(reads,2);
});

test('a failed library lookup preserves the separately verified registrar result and its link',async t=>{
  environment(t);
  mockProvider(t,wire=>{
    assert.equal(wire.text.format.name,'stu_web_answer');
    assert.doesNotMatch(wire.input,/registrar|PRIVATE_/iu);
    return empty();
  });
  const handler=createResearchAssistantHandler({readSources:async()=>[]});
  const {result,events}=await request(handler,"What is the STU registrar's phone number, and what are the library opening hours?");
  assert.match(result.answer,/615 8000/u);
  assert.match(result.answer,/could not verify the library details/u);
  assert.ok(result.answer.includes(`[STU Library opening hours](${hours})`));
  assert.equal(result.status,'handoff');
  assert.notEqual(result.verification?.status,'verified');
  assert.deepEqual(result.citations.map((citation:{chunkId:string})=>citation.chunkId),['campus-navigation:registrar']);
  assert.ok(events.some(step=>step.kind==='library-primary-source'&&step.status==='unavailable'));
  assert.ok(result.activity.some((step:Activity)=>step.kind==='directory'&&step.status==='complete'));
});

test('a library inquiry alongside a private grade request cannot be sent to public research',async t=>{
  environment(t);
  let providerCalls=0,sourceReads=0;
  mockProvider(t,()=>{providerCalls++;return empty();});
  const question='What are my Moodle grades, and what are the library opening hours?';
  const research=createResearchAssistantHandler({readSources:async()=>{sourceReads++;return [];}});
  const {result}=await request(research,question);
  assert.equal(result.status,'handoff');
  assert.equal(providerCalls,0);
  assert.equal(sourceReads,0);
  assert.ok(!result.citations.some((citation:{url:string})=>citation.url===hours));
});

test('unreadable library hours keep the official library domain and link for fallback',async t=>{
  environment(t);
  const searches:any[]=[];
  mockProvider(t,wire=>{
    assert.equal(wire.text.format.name,'stu_web_answer');
    searches.push(wire);
    return empty();
  });
  const handler=createResearchAssistantHandler({readSources:(citations,deadline,deps)=>readVerificationSources(citations,deadline,{
    ...deps,captures:[],acquire:async url=>{
      assert.equal(url,hours);
      return html(url,'<title>Human Verification</title><main><p>Bogus challenge hours 08:00–23:00.</p></main>');
    },
  })});
  const {result}=await request(handler,'What are the opening hours for the Shu-Te University library?');
  const domains=searches.flatMap(search=>search.tools[0].filters?.allowed_domains??[]);
  assert.ok(domains.length>0);
  assert.deepEqual([...new Set(domains)],['lis.stu.edu.tw']);
  assert.ok(searches.every(search=>search.instructions.includes(hours)));
  assert.equal(result.status,'abstained');
  assert.match(result.answer,/I could not verify the library details/u);
  assert.ok(result.answer.includes(`[STU Library opening hours](${hours})`));
  assert.doesNotMatch(result.answer,/08:00|23:00|sign-in/u);
  assert.deepEqual(result.citations,[]);
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
