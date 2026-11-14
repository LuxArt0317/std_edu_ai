import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import {createResearchAssistantHandler} from '../../api/research-assistant.ts';

// All source contents and model responses below are synthetic. No school,
// database or provider request leaves the injected transport.
const originalFetch=globalThis.fetch;
const envNames=['OPENAI_API_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY'] as const;
const previous=Object.fromEntries(envNames.map(name=>[name,process.env[name]]));
after(()=>{globalThis.fetch=originalFetch;for(const name of envNames){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}});
const exactFirstWeekQuestion='How should I plan a first week of study at Shu-Te University? Give me three practical steps using public school resources and cite the sources.';
const question='What are three practical ways to organize my first week of studying at Shu-Te University using public school resources?';
const history=[{role:'user',content:'Where can I find campus Wi-Fi instructions?'},{role:'assistant',content:'Use the public campus Wi-Fi guide.'}];
const sources=Array.from({length:7},(_,index)=>({
  chunk_id:`10000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,
  document_id:`20000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,
  source_id:`30000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,
  source_name:'Synthetic official STU resource',authority_level:'primary_official',
  document_title:index===0?'Public study resources':`Public resource ${index+1}`,
  document_domain:'student-services',document_language:'en',
  source_url:`https://www.stu.edu.tw/study-resources/${index+1}`,
  source_locator:'section:1',effective_at:null,reviewed_at:'2026-11-01T00:00:00Z',
  content:index===0?'The public student resource page links to library study guides and campus Wi-Fi instructions.':`Public resource excerpt ${index+1}.`,
  keyword_score:0.4,vector_score:0.8,exact_score:0.6,fused_score:0.2,document_version:1,content_checksum:String(index+1).repeat(64),
}));
const link=`[Public study resources](${sources[0].source_url})`;
const useful=`Suggested plan, not an official university schedule.\n\nThe indexed ${link} links to library study guides and campus Wi-Fi instructions.\n\n1. Open the resource page and bookmark a guide you want to use.\n\n2. Set aside a short study block and try one activity from that guide.\n\n3. Review your notes and write down one question to investigate next.\n\nCheck the linked page before relying on opening hours or deadlines; those details are not established here.`;
const chinese=`建議安排，並非校方規定的課表。\n\n索引中的[公開學習資源](${sources[0].source_url})列有圖書館學習指南與校園 Wi-Fi 說明。\n\n1. 開啟資源頁，收藏一份想使用的指南。\n\n2. 安排一小段讀書時間，試做指南中的活動。\n\n3. 整理筆記，寫下一個要繼續查找的問題。`;
type Packet={text:{format:{name:string;schema:Record<string,unknown>}};input:string|Array<{content:Array<{text:string}>}>;instructions:string;[key:string]:unknown};
const packetInput=(packet:Packet):any=>typeof packet.input==='string'?JSON.parse(packet.input):JSON.parse(packet.input[0].content[0].text);
const model=(body:unknown)=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(body)}]}]});
function initial(answer:string){return{status:'answered',answer,citations:[{chunkId:sources[0].chunk_id,claim:'Public resource contents.'}],suggestedQuestions:[]};}
function audit(packet:Packet,{unsupported=false,badPointer=false}:{unsupported?:boolean;badPointer?:boolean}={}){
  const input=packetInput(packet);
  // Reproduce the failure caused by treating an unsourced proposed timetable
  // as a factual school claim in the old records-only public review contract.
  if(!input.answerParts)return{supported:false,answersQuestion:false,claims:[{claim:'The sources prescribe these study steps.',supported:false,evidenceId:sources[0].chunk_id,quotes:[],jsonPaths:['/content']}]};
  return{supported:!unsupported,answersQuestion:!unsupported,parts:input.answerParts.map((part:{id:number;text:string})=>({
    id:part.id,kind:part.text.includes(sources[0].source_url)?'factual':'suggestion',accepted:!unsupported,
    claims:part.text.includes(sources[0].source_url)?[{claim:'The public resource page links to study guides and Wi-Fi instructions.',supported:!unsupported,evidenceId:input.evidence[0].id,quotes:[],jsonPaths:[badPointer?'/invented':'/content']}]:[],
  }))};
}
let serial=0;
async function invoke(body:unknown,options:{answer?:string;repairAnswer?:string;review?:(packet:Packet,n:number)=>unknown;empty?:boolean;web?:boolean;refreshEmpty?:boolean}={}){
  process.env.OPENAI_API_KEY='synthetic-study-key';process.env.VITE_SUPABASE_URL='https://study-test.supabase.co';process.env.VITE_SUPABASE_PUBLISHABLE_KEY='synthetic-study-public';delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const packets:Packet[]=[],requests:Array<{url:string;body:string}>=[];let searches=0,reviews=0,readSources=0;
  globalThis.fetch=async(input,init)=>{
    const url=String(input),raw=String(init?.body||'');requests.push({url,body:raw});
    if(url.endsWith('/v1/embeddings'))return Response.json({data:[{embedding:Array.from({length:1536},(_,i)=>i===0?1:0)}]});
    if(url.includes('/rpc/search_public_knowledge')){searches++;return Response.json(options.empty||options.refreshEmpty&&searches>1?[]:sources);}
    if(url.includes('/knowledge_documents?'))return Response.json(sources.map(source=>({id:source.document_id,logical_key:source.document_id,content_checksum:source.content_checksum})));
    if(url.includes('/rpc/record_public_ai_exchange'))return Response.json([{feedback_token:'a'.repeat(64),feedback_expires_at:'2026-12-01T00:00:00Z'}]);
    if(url.includes('/rpc/record_research_operational_event'))return Response.json({});
    if(url==='https://api.openai.com/v1/responses'){
      const packet=JSON.parse(raw) as Packet;packets.push(packet);
      if(packet.text.format.name==='public_grounded_answer')return model(initial(options.answer||useful));
      if(packet.text.format.name==='answer_evidence_review')return model(options.review?.(packet,++reviews)||audit(packet));
      if(packet.text.format.name==='correct_grounded_answer'){
        const input=packetInput(packet);
        return model({status:input.responseIntent==='mixed'?'answered':'abstained',answer:options.repairAnswer||useful,sourceIds:[input.evidence[0]?.id||sources[0].chunk_id]});
      }
      if(packet.text.format.name==='stu_web_answer'&&options.web)return Response.json({status:'completed',output:[{type:'web_search_call',status:'completed',action:{sources:[{url:sources[0].source_url,title:sources[0].document_title}]}},{type:'message',content:[{type:'output_text',text:JSON.stringify({status:'answered',answer:useful,source_urls:[sources[0].source_url]})}]}]});
      if(packet.text.format.name==='stu_web_answer')return new Response(null,{status:503});
    }
    throw new Error(`Unexpected synthetic transport: ${url}`);
  };
  const result:{statusCode:number;body:any}={statusCode:200,body:null};
  const response={status(code:number){result.statusCode=code;return response;},json(value:unknown){result.body=value;},setHeader(){}};
  const handler=createResearchAssistantHandler({readSources:async(citations)=>{readSources++;return citations.map(source=>({id:source.chunkId,title:source.title,url:source.url,content:JSON.stringify({content:sources[0].content})}));}});
  await handler({method:'POST',body,headers:{'x-forwarded-for':`study-plan-${++serial}`}},response);
  return{...result,packets,requests,searches,readSources};
}

test('public first-week planning after Wi-Fi returns three grounded suggestions instead of records-only abstention',async()=>{
  const result=await invoke({question,history,route:'/campus-assistant'});
  assert.equal(result.statusCode,200);assert.equal(result.body.status,'answered');assert.equal(result.body.verification.status,'verified');
  assert.equal(result.body.verification.attempts,1);assert.equal(result.body.grounding.retrieved,7);assert.equal(result.body.grounding.webSearched,false);
  assert.equal(result.body.answer,useful);assert.equal(result.body.citations[0].url,sources[0].source_url);
  assert.deepEqual(result.packets.map(packet=>packet.text.format.name),['public_grounded_answer','answer_evidence_review']);
  assert.equal(packetInput(result.packets[1]).responseIntent,'mixed');
  assert.match(result.packets[0].instructions,/proposed study steps/i);
});

test('a failed school assertion is repaired once using refreshed public evidence while useful guidance remains',async()=>{
  const result=await invoke({question,route:'/campus-assistant'},{answer:useful+'\n\nAll first-year students must study for five hours daily.',review:(packet,n)=>audit(packet,{unsupported:n===1})});
  assert.equal(result.body.status,'answered');assert.equal(result.body.verification.attempts,2);assert.equal(result.searches,2);
  assert.equal(result.body.answer,useful);assert.doesNotMatch(result.body.answer,/five hours/);
  assert.deepEqual(result.packets.map(packet=>packet.text.format.name),['public_grounded_answer','answer_evidence_review','correct_grounded_answer','answer_evidence_review']);
  assert.equal(packetInput(result.packets[2]).responseIntent,'mixed');
});

test('bad factual references never pass merely because guidance was requested',async()=>{
  const result=await invoke({question},{review:packet=>audit(packet,{badPointer:true})});
  assert.equal(result.body.status,'abstained');assert.equal(result.body.verification.attempts,2);
  assert.deepEqual(result.body.citations,[]);assert.doesNotMatch(result.body.answer,/bookmark/);
});

test('public guidance requires a supplied source link and cannot replace unavailable resources with uncited advice',async()=>{
  const noResources='1. Pick a study time.\n\n2. Take notes.\n\n3. Review your notes.';
  const result=await invoke({question},{answer:noResources,repairAnswer:noResources});
  assert.equal(result.body.status,'abstained');assert.equal(result.body.verification.attempts,2);assert.deepEqual(result.body.citations,[]);
});

test('freshly revoked public evidence cannot support the corrected study plan',async()=>{
  const result=await invoke({question},{review:packet=>audit(packet,{unsupported:true}),refreshEmpty:true});
  assert.equal(result.body.status,'abstained');assert.equal(result.body.verification.attempts,2);assert.equal(result.searches,2);
  assert.equal(result.packets.filter(packet=>packet.text.format.name==='correct_grounded_answer').length,0);
});

test('private records stay behind sign-in and never enter public study-planning retrieval',async()=>{
  const result=await invoke({question:'Plan my first week of study using my grades and my class schedule, and cite public school resources.'});
  assert.equal(result.body.status,'handoff');assert.match(result.body.answer,/school-affairs\/login/);assert.equal(result.packets.length,0);assert.equal(result.searches,0);
});

test('public planning does not transmit earlier private or assistant-authored facts to generation',async()=>{
  const privateMarker='PRIVATE_STUDENT_RECORD_91';
  const result=await invoke({question:'Plan a study week using public school resources.',history:[history[0],{role:'user',content:`My grades are ${privateMarker}.`},{role:'user',content:`What is my tuition ${privateMarker}?`},{role:'assistant',content:`You have ${privateMarker}.`}],route:'/campus-assistant'});
  assert.equal(result.body.status,'answered');
  for(const request of result.requests.filter(request=>request.url.includes('api.openai.com')||request.url.includes('search_public_knowledge')))assert.ok(!request.body.includes(privateMarker));
});

test('invented destinations cannot be approved alongside a real cited resource',async()=>{
  const invented=useful+'\n\nApply at [unsupported office](https://unverified.invalid/stu).';
  const result=await invoke({question},{answer:invented,repairAnswer:invented});
  assert.equal(result.body.status,'abstained');assert.equal(result.body.verification.attempts,2);assert.deepEqual(result.body.citations,[]);
  assert.equal(result.packets.filter(packet=>packet.text.format.name==='answer_evidence_review').length,0,'The exact URL guard runs before a permissive reviewer can approve it.');
});

test('ordinary factual questions keep the original claim schema',async()=>{
  const result=await invoke({question:'Which resources does the public student resource page list?',history},{answer:`The indexed ${link} links to library study guides and campus Wi-Fi instructions.`,review:packet=>{
    const input=packetInput(packet);assert.equal(input.responseIntent,undefined);assert.equal(input.answerParts,undefined);
    return{supported:true,answersQuestion:true,claims:[{claim:'Resource contents',supported:true,evidenceId:sources[0].chunk_id,quotes:[],jsonPaths:['/content']}]};
  }});
  assert.equal(result.body.status,'answered');assert.equal(result.body.verification.attempts,1);
});

test('Traditional Chinese public study-planning requests use the same grounded mixed review',async()=>{
  const result=await invoke({question:'如何安排在樹德科技大學第一週的讀書計畫？請給我三個使用公開校園資源的實用步驟並附上來源。'},{answer:chinese});
  assert.equal(result.body.status,'answered');assert.equal(result.body.answer,chinese);assert.equal(packetInput(result.packets.at(-1)!).responseIntent,'mixed');
});

test('the existing official-web fallback applies the same guidance review to read source content',async()=>{
  const result=await invoke({question,history},{empty:true,web:true});
  assert.equal(result.body.status,'answered');assert.equal(result.body.verification.attempts,1);assert.equal(result.body.grounding.source,'web');assert.equal(result.readSources,1);
  assert.equal(packetInput(result.packets.at(-1)!).responseIntent,'mixed');assert.match(result.body.answer,/1\. Open/);
});

test('the first-week campus guide provides three linked suggestions from the campus directory',async()=>{
  const result=await invoke({question:exactFirstWeekQuestion,history,route:'/campus-assistant'},{empty:true});
  assert.equal(result.statusCode,200);
  assert.equal(result.body.status,'answered');
  assert.equal(result.body.grounding.source,'directory');
  assert.deepEqual(result.body.verification,{status:'verified',attempts:0});
  assert.equal(result.body.answer.match(/^\d\. /gm)?.length,3);
  assert.match(result.body.answer,/A suggested plan/u);
  assert.deepEqual(result.body.citations.map((item:{url:string})=>item.url),[
    '/school-sites/www.aca.stu.edu.tw/%E8%A1%8C%E4%BA%8B%E6%9B%86%EF%BD%9Ccalendar/',
    '/school-affairs/services/12-4',
    '/school-sites/help.ecc.stu.edu.tw/wireless-setting/',
  ]);
  assert.equal(result.packets.length,0);
});
