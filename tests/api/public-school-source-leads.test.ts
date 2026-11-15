import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {acquireHttpsSource} from '../../server/knowledgeAcquisition.js';
import {createResearchAssistantHandler} from '../../api/research-assistant.ts';
import {readVerificationSources} from '../../server/answerVerificationSources.js';
import {createPublicSchoolSourceLeads,findOfficialDtmNoticeLeads,officialSchoolLeadUrl,isSchoolSignInDestination} from '../../server/publicSchoolSourceLeads.js';
import {sanitizeStoredConversation} from '../../server/assistantConversationData.js';

const notice='https://dtm.stu.edu.tw/mod/page/view.php?id=625803';
const googleNotice='https://dtm.stu.edu.tw/mod/page/view.php?id=505419';
const login='https://dtm.stu.edu.tw/login/index.php?opaque_login_identifier=LOGIN_MARKER';
const question='What is the current official Shu-Te University student per-account Microsoft Office 365 OneDrive storage quota, and what is the announcement date?';
const readerCite={chunkId:'notice-test',title:'Microsoft 365 and OneDrive storage quotas',url:notice};
const timeout=()=>new Error('Controlled timeout');
const reply={status:'abstained',answer:'I could not verify the student quota or announcement date.',citations:[],activity:[],
  verification:{status:'unverified',attempts:2},grounding:{source:'knowledge'}};

const html=(text:string)=>({bytes:new TextEncoder().encode(text),mimeType:'text/html',finalUrl:notice});

test('only high-specificity matching headlines locate a relevant official DTM notice',()=>{
  assert.deepEqual(findOfficialDtmNoticeLeads(question).map(lead=>lead.url),[notice]);
  assert.deepEqual(findOfficialDtmNoticeLeads('樹德學生的 OneDrive 儲存空間配額與公告日期是什麼？').map(lead=>lead.url),[notice]);
  assert.deepEqual(findOfficialDtmNoticeLeads('When is the school Google Drive storage quota rollout?').map(lead=>lead.url),[googleNotice]);
  assert.equal(findOfficialDtmNoticeLeads('What is the latest official school announcement?').length,0);
  assert.equal(findOfficialDtmNoticeLeads('When was the school founded?').length,0);
  assert.equal(findOfficialDtmNoticeLeads('What is my Moodle grade?').length,0);
});

test('the source reader stops before following a school login redirect and records only the original lead',async()=>{
  const starts:string[]=[],access:unknown[]=[];
  const evidence=await readVerificationSources([readerCite],Date.now()+10000,{captures:[],onAccessRequired:lead=>access.push(lead),
    acquire:async (url,options)=>{
      starts.push(url);
      (options?.onRedirect as (to:string)=>void)(login);
      assert.fail('A login destination would have been opened');
    }});
  assert.deepEqual(starts,[notice]);assert.deepEqual(evidence,[]);
  assert.deepEqual(access,[{url:notice,title:readerCite.title}]);
  assert.doesNotMatch(JSON.stringify(access),/login\/index|LOGIN_MARKER/u);
});

test('the actual redirect transport requests only the notice before reporting school sign-in',async t=>{
  const seen:string[]=[];
  t.mock.method(https,'request',(url:URL,_options:unknown,onResponse:(response:unknown)=>void)=>{
    seen.push(url.href);
    assert.equal(url.href,notice);
    const req=Object.assign(new EventEmitter(),{end(){
      const response=Object.assign(new EventEmitter(),{statusCode:303,headers:{location:'/login/index.php'},resume(){}});
      onResponse(response);
    }});
    return req;
  });
  const gates:string[]=[];
  const evidence=await readVerificationSources([readerCite],Date.now()+10000,{captures:[],onAccessRequired:lead=>gates.push(lead.url),
    acquire:(url,options)=>acquireHttpsSource(url,{...options,resolver:async()=>[{address:'8.8.8.8',family:4}]})});
  assert.deepEqual(seen,[notice]);assert.deepEqual(gates,[notice]);assert.deepEqual(evidence,[]);
});

test('verification never extracts a final or in-place login page, and a timeout supplies no authentication evidence',async()=>{
  for(const acquire of [async()=>({...html('<main><p>Untrusted login page text.</p></main>'),finalUrl:login}),
    async()=>html('<html><body id="page-login-index"><main><p>Sign in first.</p><input type="password"></main></body></html>')]){
    const gated:unknown[]=[];
    assert.deepEqual(await readVerificationSources([readerCite],Date.now()+10000,{captures:[],acquire,onAccessRequired:lead=>gated.push(lead)}),[]);
    assert.equal(gated.length,1);
  }
  const notGated:unknown[]=[];
  assert.deepEqual(await readVerificationSources([readerCite],Date.now()+10000,{captures:[],acquire:async()=>{throw timeout();},onAccessRequired:lead=>notGated.push(lead)}),[]);
  assert.deepEqual(notGated,[]);
});

test('a login gate can coexist with an independently checksummed older public capture',async()=>{
  const bytes=new TextEncoder().encode('<html><body><p>Contents of the prior public notice capture.</p></body></html>');
  const capture={source:notice,file:'/school-pages/0123456789abcdef0123.html',route:'/stored-notice',capturedOn:'2026-10-08',
    checksum:createHash('sha256').update(bytes).digest('hex')};
  const seen:string[]=[];
  const evidence=await readVerificationSources([readerCite],Date.now()+10000,{captures:[capture],onAccessRequired:lead=>seen.push(lead.url),
    acquire:async (_url,options)=>{(options?.onRedirect as (to:string)=>void)(login);assert.fail('Login attempted');},
    fetchCapture:async url=>{assert.equal(url,'https://stu.best'+capture.file);return new Response(bytes);},
  });
  assert.deepEqual(seen,[notice]);assert.equal(evidence[0].capturedOn,'2026-10-08');
  assert.match(evidence[0].content,/Contents of the prior public notice capture/u);
  assert.doesNotMatch(evidence[0].content,/LOGIN_MARKER/u);
});

test('safe link rendering excludes unsafe originals and uses no untrusted URL title',()=>{
  assert.equal(isSchoolSignInDestination(login),true);
  assert.equal(isSchoolSignInDestination('https://dtm.stu.edu.tw.attacker.example/login/index.php'),false);
  assert.equal(officialSchoolLeadUrl(notice+'#selected'),notice);
  for(const url of [login,'https://dtm.stu.edu.tw/login.aspx',notice+'&RelayState=LOGIN_MARKER',notice+'&signature=SIGNED_VALUE',
    'https://dtm.stu.edu.tw.attacker.example/onedrive','https://name:token@dtm.stu.edu.tw/onedrive'])assert.equal(officialSchoolLeadUrl(url),null,url);
  const findings=createPublicSchoolSourceLeads('What is the minutes policy for the school rowing race?');
  findings.recordAccessRequired({url:'https://sport.stu.edu.tw/rowing-race-policy/(minutes)',title:'[untrusted](https://attacker.example/)'});
  const result=findings.append(reply);
  assert.equal(result.step?.status,'complete');
  assert.match(result.reply.answer,/https:\/\/sport\.stu\.edu\.tw\/rowing-race-policy\/%28minutes%29/u);
  assert.doesNotMatch(result.reply.answer,/attacker\.example|untrusted/u);
  assert.deepEqual(result.reply.citations,[]);assert.deepEqual(result.reply.verification,reply.verification);
});

test('a known index link on timeout remains useful without claiming sign-in, and a readable original needs no handoff',()=>{
  const findings=createPublicSchoolSourceLeads(question);
  const unchecked=findings.append(reply);
  assert.match(unchecked.reply.answer,/notice index lists this link/u);
  assert.doesNotMatch(unchecked.reply.answer,/sign-in is required|2026-11-12/u);
  assert.match(unchecked.reply.answer,/id=625803/u);
  findings.recordAccessRequired({url:notice,title:'Any title is replaced by the indexed one'});
  const blocked=findings.append(reply);
  assert.match(blocked.reply.answer,/School sign-in is required/u);
  assert.doesNotMatch(blocked.reply.answer,/Any title/u);
  findings.recordReadable(notice);
  assert.equal(findings.append(reply).step,null);
});

const support='https://www.ecc.stu.edu.tw/services/cloud-storage/';
const content='Shu-Te University uses Microsoft 365 for campus cloud storage.';
const provider=(body:unknown)=>Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(body)}]}]});
const search=(url:string,answer:string)=>Response.json({output:[{type:'web_search_call',status:'completed',action:{sources:[{url,title:'STU Cloud Storage'}]}},
  {type:'message',content:[{text:JSON.stringify({status:'answered',source_urls:[url],answer})}]}]});

for(const verifiedPartial of [false,true])test(`the OneDrive response preserves its original login-gated lead with ${verifiedPartial?'verified partial facts':'unavailable details'}`,async t=>{
  const old={key:process.env.OPENAI_API_KEY,url:process.env.VITE_SUPABASE_URL,publish:process.env.VITE_SUPABASE_PUBLISHABLE_KEY};
  process.env.OPENAI_API_KEY='controlled-public-leads-key';process.env.VITE_SUPABASE_URL='https://controlled-public-leads.supabase.co';
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY='controlled-publishable-key';
  t.after(()=>{
    for(const [key,value] of Object.entries({OPENAI_API_KEY:old.key,VITE_SUPABASE_URL:old.url,VITE_SUPABASE_PUBLISHABLE_KEY:old.publish})) {
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  });
  let searches=0;
  t.mock.method(globalThis,'fetch',async (input:RequestInfo|URL,init:RequestInit)=>{
    const url=String(input);
    if(url.includes('/embeddings'))return Response.json({data:[{embedding:Array(1536).fill(0)}]});
    if(url.includes('/rpc/search_public_knowledge'))return Response.json([]);
    if(!url.endsWith('/v1/responses'))return Response.json(null);
    const request=JSON.parse(String(init?.body)),name=request.text.format.name;
    if(name==='stu_web_answer'){
      if(++searches>1)return Response.json({output:[]});
      return verifiedPartial?search(support,`${content} The student quota and announcement date could not be verified.`)
        :search(notice,'This unsupported draft invents a 987 GB quota and an announcement date of November 31.');
    }
    assert.equal(verifiedPartial,true,'Login shell or gated title must never produce a verification request.');
    assert.equal(name,'answer_evidence_review');
    const inputData=JSON.parse(request.input[0].content[0].text);
    assert.deepEqual(inputData.evidence.map((source:{url:string})=>source.url),[support]);
    assert.doesNotMatch(JSON.stringify(inputData),/625803|LOGIN_MARKER|987 GB/u);
    return provider({supported:true,answersQuestion:true,claims:[{claim:content,supported:true,evidenceId:inputData.evidence[0].id,quotes:[content],jsonPaths:[]}]});
  });
  const direct:string[]=[];
  const handler=createResearchAssistantHandler({readSources:(citations,deadline,dependencies)=>readVerificationSources(citations,deadline,{
    ...dependencies,captures:[],acquire:async (url,options)=>{
      direct.push(url);
      if(url===notice){(options?.onRedirect as (to:string)=>void)(login);assert.fail('Login page would have been followed.');}
      assert.equal(url,support);
      return {...html(`<html><body><p>${content}</p></body></html>`),finalUrl:support};
    },
  })});
  let body:any;
  const events: Array<{kind:string;status:string}>=[];
  const sink={status(status:number){assert.equal(status,200);return this;},setHeader(){},json(value:unknown){body=value;},write(raw:string){
    const [,event,value]=/^event: (\w+)\ndata: (.+)\n\n$/u.exec(raw)??[];
    if(event==='progress')events.push(JSON.parse(value));if(event==='result')body=JSON.parse(value);
  },end(){}};
  await handler({method:'POST',body:{question,stream:true},headers:{'x-forwarded-for':verifiedPartial?'192.0.2.47':'192.0.2.46'}},sink);
  assert.match(body.answer,/Microsoft 365 and OneDrive storage quotas\]\(https:\/\/dtm\.stu\.edu\.tw\/mod\/page\/view\.php\?id=625803\)/u);
  assert.match(body.answer,/School sign-in is required\. I could not verify the notice contents/u);
  assert.doesNotMatch(JSON.stringify(body),/LOGIN_MARKER|login\/index|987 GB|November 31/u);
  assert.doesNotMatch(body.answer,/Please try again or specify the course/u);
  assert.deepEqual(body.citations.map((citation:{url:string})=>citation.url),verifiedPartial?[support]:[],JSON.stringify({activity:body.activity,verification:body.verification,direct}));
  assert.equal(body.verification?.status,verifiedPartial?'verified':'unverified');
  assert.equal(events.filter(step=>step.kind==='school-source-lead'&&step.status==='complete').length,1);
  assert.deepEqual(direct,verifiedPartial?[notice,support]:[notice]);
  const messages=sanitizeStoredConversation([{id:'saved-lead',role:'assistant',content:body.answer,activity:body.activity,result:body}]);
  // The persisted text and append-only activity carry the navigation without a source-evidence claim.
  assert.ok(messages.length);
  assert.match(JSON.stringify(messages),/625803|school-source-lead/u);
});
