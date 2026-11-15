import assert from 'node:assert/strict';
import {test} from 'node:test';
import {micromark} from 'micromark';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {AffairsWorkspaceError} from '../../server/affairsWorkspace.js';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';

const owner='47000000-0000-4000-8000-000000000001';
const foreign='47000000-0000-4000-8000-000000000002';
const profileEmail='private-sign-in@example.invalid';
const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const account={url:origin,key:'SYNTHETIC_PUBLIC',token:'SYNTHETIC_CALLER',user:{id:owner,email:profileEmail}};
const displayQuestion='What is my display name?';
const chineseQuestion='我的顯示名稱是什麼？';
const checkedProfile={user_id:owner,display_name:'Fallback profile value',preferred_name:'林小文'};
type Handler=ReturnType<typeof createAffairsAssistantHandler>;

async function ask(handler:Handler,question:string,{signed=true,route='/dtm',stream=true}={}){
  const received:{status:number;body:any;events:any[]}={status:200,body:null,events:[]};
  const response={
    status(status:number){received.status=status;return response;},
    json(body:unknown){received.body=body;},
    setHeader(){},
    write(text:string){
      const match=/^event: (.+)\ndata: (.+)\n\n$/u.exec(text);
      assert.ok(match);
      const data=JSON.parse(match[2]);
      if(['result','error'].includes(match[1]))received.body=data;
      else received.events.push(data);
    },
    end(){},
  };
  await handler({method:'POST',headers:signed?{authorization:'Bearer '+account.token}:{},body:{question,route,stream}},response);
  return received;
}

const scopedSource=(rows:unknown[],count=rows.length)=>Response.json(rows,{headers:{
  'content-range':rows.length?'0-'+(rows.length-1)+'/'+count:'*/'+count,
}});
const exactHandler=()=>createAffairsAssistantHandler({verifyToken:async token=>{
  assert.equal(token,account.token);
  return account;
},loadSnapshot:async()=>assert.fail('The display-name question must not load the workspace'),
answerAccount:async()=>assert.fail('The display-name question must not use the broad account graph'),
publicResearch:async()=>assert.fail('The display-name question must not query public sources')});

async function withProfileTransport(source:()=>Response,run:()=>Promise<void>,expectedReads=1){
  const original=globalThis.fetch;
  let requests=0;
  const unexpected:unknown[]=[];
  globalThis.fetch=async(input,init)=>{
    try{
      const url=new URL(String(input));
      assert.equal(url.origin,origin);
      assert.equal(url.pathname,'/rest/v1/affairs_profiles');
      assert.deepEqual(Object.fromEntries(url.searchParams),{
        select:'user_id,display_name,preferred_name',user_id:'eq.'+owner,limit:'1',
      });
      const headers=new Headers(init?.headers);
      assert.equal(headers.get('authorization'),'Bearer '+account.token);
      assert.equal(headers.get('prefer'),'count=exact');
      assert.equal(init?.method,'GET');
      assert.equal(init?.redirect,'error');
      requests++;
      return source();
    }catch(error){unexpected.push(error);throw error;}
  };
  try{await run();assert.equal(requests,expectedReads);assert.deepEqual(unexpected,[]);}
  catch(error){throw unexpected[0]??error;}
  finally{globalThis.fetch=original;}
}

test('the normal signed-in DTM entry verifies only the saved effective display name and the local workspace link',async()=>{
  const stored='**Lin** \`staff\` [outside](https://unsafe.invalid/)';
  for(const [question,name,preferred,prefix] of [
    [displayQuestion,stored,stored,/Your display name is/u],
    [chineseQuestion,'林小文','林小文',/你的顯示名稱是/u],
    [displayQuestion,'😀'.repeat(80),'😀'.repeat(80),/Your display name is/u],
    [displayQuestion,'Fallback profile value',null,/Your display name is/u],
  ] as const){
    await withProfileTransport(()=>scopedSource([{...checkedProfile,preferred_name:preferred}]),async()=>{
      const result=await ask(exactHandler(),question);
      assert.equal(result.status,200);
      assert.equal(result.body.status,'answered');
      assert.deepEqual(result.body.verification,{status:'verified',attempts:1});
      assert.match(result.body.answer,prefix);
      const html=micromark(result.body.answer);
      assert.ok(html.includes('<code>'+name+'</code>'));
      assert.doesNotMatch(html,/<strong>|href="https:\/\/unsafe/u);
      assert.deepEqual([...html.matchAll(/href="([^"]+)"/gu)].map(match=>match[1]),['/school-affairs']);
      assert.deepEqual(result.body.citations.map((citation:{chunkId:string;url:string})=>[citation.chunkId,citation.url]),[['account:profile','/school-affairs']]);
      assert.deepEqual(result.events.filter(event=>event.kind.startsWith('account-read:')).map(event=>[event.kind,event.status]),
        [['account-read:profile:1','running'],['account-read:profile:1','complete']]);
      assert.equal(result.body.proposedAction,undefined);
      assert.doesNotMatch(JSON.stringify(result),/private-sign-in|SYNTHETIC_CALLER|47000000|student number/u);
      if(preferred!==null)assert.doesNotMatch(result.body.answer,/Fallback profile value/u);
    });
  }
});

test('profile absence is verified separately from malformed or unavailable owner evidence',async()=>{
  for(const rows of [[],[{...checkedProfile,preferred_name:null,display_name:''}]]){
    await withProfileTransport(()=>scopedSource(rows),async()=>{
      const result=await ask(exactHandler(),displayQuestion);
      assert.equal(result.status,200);
      assert.deepEqual(result.body.verification,{status:'verified',attempts:1});
      assert.match(result.body.answer,/no saved display name/i);
      assert.doesNotMatch(result.body.answer,/could not be checked/iu);
    });
  }
  const failures=[
    ()=>new Response(null,{status:503}),
    ()=>scopedSource([{...checkedProfile,user_id:foreign,preferred_name:'Foreign display name'}]),
    ()=>scopedSource([checkedProfile],2),
    ()=>scopedSource([{...checkedProfile,preferred_name:profileEmail}]),
    ()=>scopedSource([{...checkedProfile,preferred_name:'fake-display@example.invalid'}]),
    ()=>scopedSource([{...checkedProfile,preferred_name:'x'.repeat(81)}]),
    ()=>scopedSource([{...checkedProfile,preferred_name:'Unsafe\nName'}]),
    ()=>scopedSource([{...checkedProfile,email:profileEmail}]),
  ];
  for(const [index,source] of failures.entries()){
    await withProfileTransport(source,async()=>{
      const result=await ask(exactHandler(),index?displayQuestion:chineseQuestion);
      assert.match(result.body.error,index?/saved display name could not be checked/u:/無法查詢已儲存/u);
      assert.ok(result.events.some(event=>event.kind==='account-read:profile:1'&&event.status==='unavailable'));
      assert.equal(result.body.verification,undefined);
      assert.doesNotMatch(JSON.stringify(result),/Foreign display name|private-sign-in|no saved display name|林小文/u);
    });
  }
  await withProfileTransport(()=>new Response(null,{status:503}),async()=>{
    const result=await ask(exactHandler(),displayQuestion,{stream:false});
    assert.equal(result.status,503);
    assert.match(result.body.error,/saved display name could not be checked/u);
  });
});

test('guests are offered sign-in without a profile read or account disclosure',async()=>{
  await withProfileTransport(()=>assert.fail('Guest path must not read a profile'),async()=>{
    const direct=await ask(createAffairsAssistantHandler({verifyToken:async token=>{
      assert.equal(token,'');throw new AffairsWorkspaceError('Sign in to School Affairs again.',401);
    }}),displayQuestion,{signed:false});
    assert.equal(direct.status,401);
    const guest=createResearchAssistantHandler() as unknown as Handler;
    for(const question of [displayQuestion,chineseQuestion]){
      const result=await ask(guest,question,{signed:false});
      assert.equal(result.status,200);
      assert.equal(result.body.status,'handoff');
      assert.equal(result.body.citations[0].url,'/school-affairs/login');
      assert.doesNotMatch(JSON.stringify(result),/account:profile|private-sign-in|林小文/u);
    }
  },0);
});

test('mixed or unrelated prompts still use their normal route',async()=>{
  const questions=['What is my display name and email?','What is my account profile?'];
  let snapshots=0;
  const checked:string[]=[];
  const handler=createAffairsAssistantHandler({verifyToken:async()=>account,
    loadSnapshot:async()=>{snapshots++;return {profile:{userId:owner},checkedAt:new Date().toISOString()};},
    answerAccount:async ({question})=>{checked.push(question);return {status:'answered',answer:'Existing account route',citations:[]};}});
  await withProfileTransport(()=>assert.fail('Mixed or unrelated route used the isolated reader'),async()=>{
    for(const question of questions){
      const result=await ask(handler,question,{route:'/school-affairs'});
      assert.equal(result.status,200);
      assert.equal(result.body.answer,'Existing account route');
    }
    assert.equal(snapshots,questions.length);
    assert.deepEqual(checked,questions);
  },0);
});
