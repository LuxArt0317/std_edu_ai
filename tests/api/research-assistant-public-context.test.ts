import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {after,test} from 'node:test';
import captures from '../../src/features/public/mirror/pages.json' with {type:'json'};
import {createResearchAssistantHandler} from '../../api/research-assistant.ts';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {boundedPublicPageEvidence,institutionalFactAnswer,isPublicPageSummaryQuestion,loadPublicPageContext,publicPageCandidate,type PublicPageContext} from '../../server/publicPageContext.js';

const originalFetch=globalThis.fetch;
const names=['OPENAI_API_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'] as const;
const old=Object.fromEntries(names.map(name=>[name,process.env[name]]));
after(()=>{globalThis.fetch=originalFetch;for(const name of names){if(old[name]===undefined)delete process.env[name];else process.env[name]=old[name];}});
function configure(){process.env.OPENAI_API_KEY='synthetic-public-context';process.env.VITE_SUPABASE_URL='https://public-context-test.supabase.co';process.env.VITE_SUPABASE_PUBLISHABLE_KEY='synthetic-publishable';}
const page=captures.find(item=>decodeURI(item.route)==='/在校學生/')!;
const question='What is this page about? Give me its page title and a link to this page on stu.best. State its capture date.';
let address=0;
async function invoke(body:unknown,loadPublicPage?:typeof loadPublicPageContext,readSources?:NonNullable<Parameters<typeof createResearchAssistantHandler>[0]>['readSources']){
  const run=createResearchAssistantHandler({loadPublicPage,readSources});
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

const overviewSummary='This directory helps current students find School Affairs, Moodle teaching materials, course registration, and student leave services.';
const captureClaims=['校務資訊系統','Moodle數位教材網','學生選課系統','學生請假'];

test('the compound page question corrects a mismatched language and returns a verified summary, exact local title and link, and the capture date',async()=>{
  configure();
  let loads=0,reads=0;
  const saved=await loadPublicPageContext(page.route,Date.now()+5000,{fetchCapture:async url=>{
    reads++;
    assert.equal(String(url),'https://stu.best'+page.file);
    return new Response(await readFile(new URL('../../public'+page.file,import.meta.url)));
  }});
  assert.ok(saved?.contentAvailable);
  const before=structuredClone(saved),calls:string[]=[];
  const evidence=boundedPublicPageEvidence(saved);
  const bound=JSON.parse(evidence.content);
  for(const text of captureClaims)assert.ok(bound.excerpt.includes(text));
  globalThis.fetch=async(url,init)=>{
    assert.equal(String(url),'https://api.openai.com/v1/responses');
    const request=JSON.parse(String(init?.body)),name=request.text.format.name;
    const body=JSON.parse(request.input[0].content[0].text);
    calls.push(name);
    assert.deepEqual(body.evidence,[evidence]);
    if(name==='compose_grounded_answer'){
      assert.match(body.question,/Write the summary in English/u);
      return modelResponse({status:'answered',answer:'此頁列出校務資訊系統、數位教材網、學生選課及學生請假等服務。',sourceIds:[evidence.id]});
    }
    if(name==='correct_grounded_answer'){
      assert.match(body.question,/Write the summary in English/u);
      return modelResponse({status:'answered',answer:overviewSummary,sourceIds:[evidence.id]});
    }
    assert.equal(name,'answer_evidence_review');
    assert.equal(body.question,question);
    assert.ok(body.answer.includes(overviewSummary)&&body.answer.includes(page.title)&&body.answer.includes(page.route)&&body.answer.includes(page.capturedOn));
    return modelResponse({supported:true,answersQuestion:true,claims:[
      {claim:'The page is the dated student directory.',supported:true,evidenceId:evidence.id,quotes:[],jsonPaths:['/pageTitle','/localUrl','/capturedOn']},
      {claim:overviewSummary,supported:true,evidenceId:evidence.id,quotes:captureClaims,jsonPaths:['/excerpt']},
    ]});
  };
  const result=await invoke({question,route:page.route},async()=>{
    loads++;
    return saved;
  },async()=>assert.fail('No outside page can supply an archived summary'));
  assert.equal(result.statusCode,200);
  assert.deepEqual(result.body.verification,{status:'verified',attempts:2});
  assert.equal(result.body.grounding.source,'public-page-context');
  assert.equal(result.body.grounding.webSearched,false);
  assert.equal(result.body.grounding.contentAvailable,true);
  assert.equal(result.body.answer.split('Source snapshot: ').length,2);
  assert.ok(result.body.answer.includes(overviewSummary)&&result.body.answer.includes(`[${page.title}](${page.route})`)&&result.body.answer.includes(page.capturedOn));
  assert.deepEqual(result.body.citations.map((citation:{url:string})=>citation.url),[page.route]);
  assert.equal(reads,1);assert.equal(loads,1);
  assert.deepEqual(saved,before);
  assert.deepEqual(calls,['compose_grounded_answer','correct_grounded_answer','answer_evidence_review']);
});

test('the Traditional Chinese caption uses the exact saved date and removes duplicate date lines from a draft',async()=>{
  configure();
  const saved=await context();
  saved.contentAvailable=true;
  const prompt='這個在校學生頁面介紹什麼？請提供本頁連結與擷取日期。';
  const draft=publicPageCandidate(saved,prompt,{summary:`頁面彙整在校學生服務。\n\nSource snapshot: ${page.capturedOn}.\n擷取日期：${page.capturedOn}。`});
  assert.equal((draft.answer.match(/擷取日期：/gu)||[]).length,1);
  assert.match(draft.answer,new RegExp('擷取日期：'+page.capturedOn,'u'));
  assert.doesNotMatch(draft.answer,/Source snapshot/u);
  let calls=0;
  globalThis.fetch=async(url,init)=>{
    assert.equal(String(url),'https://api.openai.com/v1/responses');
    const call=JSON.parse(String(init?.body));
    const input=JSON.parse(call.input[0].content[0].text);
    calls++;
    if(call.text.format.name==='compose_grounded_answer')
      return modelResponse({status:'answered',answer:'此頁彙整在校學生使用的校務資源，包括課程選課與請假服務。',sourceIds:[saved.evidence.id]});
    assert.match(input.answer,new RegExp('擷取日期：'+page.capturedOn,'u'));
    return modelResponse({supported:true,answersQuestion:true,claims:[
      {claim:'課程選課及請假',supported:true,evidenceId:saved.evidence.id,quotes:[],jsonPaths:['/excerpt']},
    ]});
  };
  const metadata=JSON.parse(saved.evidence.content);
  saved.evidence.content=JSON.stringify({...metadata,contentAvailable:true,excerpt:'學生選課系統與學生請假。'});
  const result=await invoke({question:prompt,route:page.route},async()=>saved);
  assert.equal(result.body.verification.status,'verified');assert.equal(calls,2);
});

test('a title-only approval prompts correction against the excerpt or withholds the failed summary',async()=>{
  configure();
  for(const shouldCorrect of [true,false]){
    let reviews=0,corrections=0;
    const saved=await context(),metadata=JSON.parse(saved.evidence.content);
    metadata.contentAvailable=true;
    metadata.contentStatus='verified_snapshot';
    metadata.excerpt='校務資訊系統、Moodle數位教材網、學生選課系統、學生請假';
    saved.contentAvailable=true;
    saved.evidence.content=JSON.stringify(metadata);
    const evidence=boundedPublicPageEvidence(saved);
    globalThis.fetch=async(url,init)=>{
      assert.equal(String(url),'https://api.openai.com/v1/responses');
      const request=JSON.parse(String(init?.body)),name=request.text.format.name;
      const body=JSON.parse(request.input[0].content[0].text);
      assert.deepEqual(body.evidence,[evidence]);
      if(name==='compose_grounded_answer')return modelResponse({status:'answered',answer:'This is a saved public page.',sourceIds:[evidence.id]});
      if(name==='correct_grounded_answer'){
        corrections++;
        return modelResponse({status:'answered',answer:shouldCorrect?overviewSummary:'The page provides guaranteed scholarship approval.',sourceIds:[evidence.id]});
      }
      assert.equal(name,'answer_evidence_review');
      reviews++;
      if(shouldCorrect&&reviews===2)return modelResponse({supported:true,answersQuestion:true,claims:[
        {claim:overviewSummary,supported:true,evidenceId:evidence.id,quotes:captureClaims,jsonPaths:['/excerpt']},
      ]});
      // This authorizes page identity only, even if the provider says the
      // full compound question was answered.
      return modelResponse(review(saved.evidence));
    };
    const result=await invoke({question,route:page.route},async()=>saved,async()=>assert.fail('No public search on the exact capture path'));
    assert.equal(result.body.verification.status,shouldCorrect?'verified':'unverified');
    assert.equal(result.body.verification.attempts,shouldCorrect?2:3);
    assert.equal(reviews,shouldCorrect?2:3);
    assert.equal(corrections,shouldCorrect?1:2);
    assert.ok(result.body.answer.includes(page.title)&&result.body.answer.includes(page.route)&&result.body.answer.includes(page.capturedOn));
    assert.doesNotMatch(result.body.answer,/guaranteed scholarship/u);
    if(shouldCorrect)assert.ok(result.body.answer.includes(overviewSummary));
    else assert.match(result.body.answer,/could not verify a summary/u);
  }
});

test('summary routing recognizes content overviews without routing title or exact-detail questions to a summary',()=>{
  for(const prompt of [question,"What's this page about?",'What does the current page cover?','Give me an overview of this page.','請摘要這個頁面。','這個頁面主要內容是什麼？'])
    assert.equal(isPublicPageSummaryQuestion(prompt),true,prompt);
  for(const prompt of ['What title and date does this page have?','What opening time is given on this page?',"Explain this page’s title.","Summarize this page's application deadline.",'這一頁的電話號碼是什麼？'])
    assert.equal(isPublicPageSummaryQuestion(prompt),false,prompt);
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

test('a third correction for this page uses only the same immutable archived capture',async()=>{
  configure();
  const saved=await context(),data=JSON.parse(saved.evidence.content);
  data.contentAvailable=true;
  data.contentStatus='verified_snapshot';
  data.excerpt='The help desk opens at 08:30.';
  saved.contentAvailable=true;
  saved.evidence.content=JSON.stringify(data);
  const before=structuredClone(saved);
  const calls:string[]=[];
  let loads=0,reviews=0,corrections=0;
  globalThis.fetch=async(url,init)=>{
    assert.equal(String(url),'https://api.openai.com/v1/responses');
    const request=JSON.parse(String(init?.body)),name=request.text.format.name;
    const input=JSON.parse(request.input[0].content[0].text);
    calls.push(name);
    assert.deepEqual(input.evidence,[saved.evidence]);
    if(name==='correct_grounded_answer'){
      corrections++;
      if(corrections===2)assert.equal(request.reasoning.effort,'medium');
      return modelResponse({status:'answered',answer:corrections===1?'The help desk opens at 09:30.':'The help desk opens at 08:30.',sourceIds:[saved.evidence.id]});
    }
    assert.equal(name,'answer_evidence_review');
    reviews++;
    if(reviews<=2)return modelResponse(review(saved.evidence,false));
    assert.equal(request.reasoning.effort,'medium');
    return modelResponse({supported:true,answersQuestion:true,claims:[{
      claim:'The stored excerpt gives 08:30.',supported:true,evidenceId:saved.evidence.id,quotes:['The help desk opens at 08:30.'],jsonPaths:['/excerpt','/capturedOn'],
    }]});
  };
  const result=await invoke({question:'What opening time is given on this page?',route:page.route},async()=>{
    loads++;
    return saved;
  },async()=>assert.fail('No acquisition of general web sources for an archived page question'));
  assert.equal(result.statusCode,200);
  assert.equal(loads,1);
  assert.deepEqual(saved,before);
  assert.deepEqual(calls,['answer_evidence_review','correct_grounded_answer','answer_evidence_review','correct_grounded_answer','answer_evidence_review']);
  assert.deepEqual(result.body.verification,{status:'verified',attempts:3});
  assert.equal(result.body.grounding.source,'public-page-context');
  assert.equal(result.body.grounding.webSearched,false);
  assert.match(result.body.answer,/08:30/u);
  assert.doesNotMatch(result.body.answer,/09:30/u);
  assert.deepEqual(result.body.citations.map((citation:{url:string})=>citation.url),[page.route]);
  assert.equal(result.body.activity.filter((step:{kind:string;status:string})=>step.kind==='verification-3'&&step.status==='complete').length,1);
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

const about=captures.find(item=>decodeURI(item.route)==='/關於樹德/')!;
const foundingQuestion='What does Shu-Te University say about its founding and educational mission?';
const motto='學術、知性、快樂、希望';
const historicalSummary='The school received approval to establish and enroll students in 1997 (ROC 86). Its educational mission emphasizes the balance of theory and practice.';
const loadAbout=async(route:string,deadline:number)=>loadPublicPageContext(route,deadline,{fetchCapture:async url=>{
  assert.equal(String(url),'https://stu.best'+about.file);
  return new Response(await readFile(new URL('../../public'+about.file,import.meta.url)));
}});
const publicLatest='What is Shu-Te University’s latest educational mission?';

test('explicit English and Chinese institutional questions independently verify the actual approved capture',async()=>{
  configure();
  let networkCalls=0;
  globalThis.fetch=async()=>{networkCalls++;return Response.json({error:'Unavailable.'},{status:429});};
  for(const [question,fact,provenance] of [
    [foundingQuestion,/approval.*1997.*ROC year 86.*mission.*theory with practice/u,'Source snapshot: '],
    ['樹德科技大學的校訓是什麼？',new RegExp(motto,'u'),'擷取日期：'],
    ['When was Shu-Te University founded?',/approval.*1997.*ROC year 86/u,'Source snapshot: '],
    ['What year was Shu Te University established?',/approval.*1997.*ROC year 86/u,'Source snapshot: '],
    ['樹德科技大學哪一年成立？',/民國86年（西元1997年）獲准設校招生/u,'擷取日期：'],
  ] as const){
    const result=await invoke({question,route:'/campus-assistant',
      history:[{role:'user',content:'My private student number is PRIVATE-HISTORY-SENTINEL.'}]},loadAbout);
    assert.equal(result.statusCode,200);
    assert.deepEqual(result.body.verification,{status:'verified',attempts:1},question+' '+result.body.answer);
    assert.match(result.body.answer,fact);
    assert.ok(result.body.answer.includes(provenance+about.capturedOn));
    assert.doesNotMatch(result.body.answer,/PRIVATE-HISTORY-SENTINEL/);
    assert.deepEqual(result.body.citations.map((citation:{url:string})=>citation.url),[about.route]);
    assert.equal(result.body.grounding.source,'public-page-context');
    assert.equal(result.body.grounding.webSearched,false);
    assert.deepEqual(result.body.activity.map((step:{kind:string})=>step.kind),['saved-public-source','verification-1']);
    delete process.env.OPENAI_API_KEY;
  }
  assert.equal(networkCalls,0);
});

test('an exact institutional answer requires the requested scope and every source claim',async()=>{
  const context=(await loadAbout(about.route,Date.now()+5000))!;
  const metadata=JSON.parse(context.evidence.content);
  assert.equal(institutionalFactAnswer(context,foundingQuestion.slice(0,-1)+' and who is the current president?'),null);
  const incomplete={...context,evidence:{...context.evidence,content:JSON.stringify({...metadata,
    excerpt:metadata.excerpt.replace('落實現代大學理論與實務之平衡發展','')})}};
  assert.equal(institutionalFactAnswer(incomplete,foundingQuestion),null);
  assert.match(institutionalFactAnswer(incomplete,'When was Shu-Te University founded?')?.answer??'',/1997/u);
  assert.equal(institutionalFactAnswer(context,'When was Shu-Te University founded, and when is tuition due?'),null);
  assert.equal(institutionalFactAnswer({...context,evidence:{...context.evidence,id:'public-page:another'}},foundingQuestion),null);
});

test('a signed-in founding-year lookup uses the public capture without account reads',async t=>{
  t.mock.method(globalThis,'fetch',async()=>assert.fail('The saved About page needs no provider or database request'));
  const readPublic=createResearchAssistantHandler({loadPublicPage:loadAbout});
  const handler=createAffairsAssistantHandler({
    verifyToken:async()=>({user:{id:'10000000-0000-4000-8000-000000000001'},url:'https://public-context-test.supabase.co',key:'synthetic-key',token:'synthetic-token'}),
    loadSnapshot:async()=>assert.fail('Founding year must make no account reads'),
    answerAccount:async()=>assert.fail('The public date must not use private account inference'),
    publicResearch:async(request,response,context)=>{
      assert.equal(request.headers.authorization,undefined);
      assert.deepEqual((request.body as {history:string[]}).history,[]);
      return readPublic(request,response,context);
    },
  });
  let reply:any;
  const response={status(code:number){assert.equal(code,200);return response;},json(body:unknown){reply=body;},setHeader(){}};
  await handler({method:'POST',headers:{authorization:'Bearer synthetic-token'},body:{question:'What year was Shu Te University established?',
    history:[{role:'user',content:'My student identifier is PRIVATE-HISTORY-SENTINEL.'}],route:'/school-affairs'}},response);
  assert.match(reply.answer,/approval.*1997.*ROC year 86/u);
  assert.deepEqual(reply.verification,{status:'verified',attempts:1});
  assert.equal(reply.grounding.source,'public-page-context');
});

test('a rejected capture draft can read novel official content within the same verification budget',async()=>{
  configure();
  const url='https://www.stu.edu.tw/university-history/';
  const historyQuestion='What does Shu-Te University say about its history and educational mission?';
  const requests:string[]=[];
  let reviews=0,reads=0;
  globalThis.fetch=async (_input,init)=>{
    const body=JSON.parse(String(init?.body)),name=body.text.format.name;
    requests.push(name);
    if(name==='stu_web_answer'){
      assert.equal(JSON.parse(body.input).question,historyQuestion);
      const sources=[about.source,url].map(link=>({url:link,title:'Official university history'}));
      return Response.json({output:[{type:'web_search_call',status:'completed',action:{sources}}]});
    }
    const input=JSON.parse(body.input[0].content[0].text);
    if(name==='compose_grounded_answer'){
      return modelResponse({status:'answered',answer:'Shu-Te University was founded in 2040.',sourceIds:[input.evidence[0].id]});
    }
    if(name==='correct_grounded_answer'){
      assert.equal(input.evidence.length,2);
      assert.equal(input.evidence[0].url,url);
      assert.equal(input.evidence[1].url,about.route);
      return modelResponse({status:'answered',answer:historicalSummary,sourceIds:[input.evidence[0].id]});
    }
    assert.equal(name,'answer_evidence_review');
    reviews++;
    return modelResponse({supported:reviews===2,answersQuestion:reviews===2,claims:[{
      claim:reviews===1?'Unfounded 2040 date':historicalSummary,supported:reviews===2,evidenceId:input.evidence[0].id,
      quotes:reviews===2?[historicalSummary]:[],jsonPaths:[],
    }]});
  };
  const result=await invoke({question:historyQuestion,route:'/campus-assistant',
    history:[{role:'user',content:'Which events are listed by the STU library next month?'}]},loadAbout,async citations=>{
    reads++;
    assert.deepEqual(citations.map(item=>item.url),[url]);
    return citations.map(item=>({id:item.chunkId,url:item.url,content:historicalSummary}));
  });
  assert.deepEqual(requests,['compose_grounded_answer','answer_evidence_review','stu_web_answer','correct_grounded_answer','answer_evidence_review']);
  assert.equal(reads,1);
  assert.deepEqual(result.body.verification,{status:'verified',attempts:2});
  assert.equal(result.body.answer,historicalSummary);
  assert.equal(result.body.grounding.source,'web');
  assert.equal(result.body.grounding.webSearched,true);
  assert.equal(result.body.grounding.capturedOn,undefined);
  assert.deepEqual(result.body.activity.map((step:{kind:string})=>step.kind),
    ['saved-public-source','verification-1','verification-retry','web-follow-up','verification-2']);
});

test('tampered or unavailable capture contents fall through to regular public research',async()=>{
  configure();
  const requests:string[]=[];
  globalThis.fetch=async(input,init)=>{
    const url=String(input);
    if(url.includes('/embeddings'))return Response.json({data:[{embedding:Array(1536).fill(0)}]});
    if(url.includes('/rpc/search_public_knowledge'))return Response.json([]);
    if(!url.endsWith('/v1/responses'))return Response.json([]);
    const body=JSON.parse(String(init?.body)),name=body.text.format.name;
    requests.push(name);
    assert.equal(name,'stu_web_answer');
    return Response.json({output:[]});
  };
  const result=await invoke({question:foundingQuestion,route:'/campus-assistant'},async (route,deadline)=>
    loadPublicPageContext(route,deadline,{fetchCapture:async()=>new Response('<p>Tampered institutional content</p>')}));
  assert.ok(['abstained','handoff'].includes(result.body.status));
  assert.equal(result.body.grounding.webSearched,true);
  assert.equal(result.body.activity.find((step:{kind:string})=>step.kind==='saved-public-source')?.status,'unavailable');
  assert.ok(requests.length>0);
  assert.doesNotMatch(result.body.answer,/Tampered institutional content/);
});

test('fresh institutional and mixed private questions preserve their existing source scopes',async()=>{
  configure();
  let loads=0,searches=0;
  globalThis.fetch=async(input,init)=>{
    const url=String(input);
    if(url.includes('/embeddings'))return Response.json({data:[{embedding:Array(1536).fill(0)}]});
    if(url.includes('/rpc/search_public_knowledge'))return Response.json([]);
    if(!url.endsWith('/v1/responses'))return Response.json([]);
    assert.equal(JSON.parse(String(init?.body)).text.format.name,'stu_web_answer');
    searches++;
    return Response.json({output:[]});
  };
  const load:typeof loadPublicPageContext=(route,deadline)=>{loads++;return loadAbout(route,deadline);};
  const fresh=await invoke({question:publicLatest,route:'/campus-assistant'},load);
  assert.equal(fresh.body.grounding.webSearched,true);
  assert.equal(fresh.body.activity.some((step:{kind:string})=>step.kind==='saved-public-source'),false);
  assert.ok(searches>0);
  const publicSearches=searches;
  const privateAnswer=await invoke({question:'Give me my student number and the founding date of Shu-Te University.',route:'/campus-assistant'},load);
  assert.equal(privateAnswer.body.status,'handoff');
  assert.equal(searches,publicSearches);
  assert.equal(loads,0);
});
