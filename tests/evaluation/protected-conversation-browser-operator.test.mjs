import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {newConversationId} from '../../src/services/assistantConversationId.js';
import {installProtectedConversationBrowserRoute,protectedConversationQuestions,runProtectedConversationBrowser,verifyProtectedBrowserSave}
  from '../integration/helpers/protected-conversation-browser.mjs';

const origin='https://stdedu-abcdef123-v1-d286.vercel.app',path='/api/affairs-conversations',ids=[newConversationId(),newConversationId()];
const activity=[{kind:'lookup',label:'Checked tuition',detail:'Observed owned tuition records.',status:'complete'}];
const started={...activity[0],status:'running',detail:'Reading tuition rows.'};
const payload={answer:'Owned fixture answer',status:'answered',verification:{status:'verified',attempts:1},activity};
const event=(type,value)=>'event: '+type+'\ndata: '+JSON.stringify(value)+'\n\n';
const wire=Buffer.from(event('progress',started)+event('result',payload));
const save={id:ids[0],title:protectedConversationQuestions[0],version:0,messages:[
  {id:'u',role:'user',content:protectedConversationQuestions[0]},
  {id:'a',role:'assistant',phase:'complete',content:payload.answer,activity,result:payload},
]};

test('the operator independently compares the actual SSE Activity and answer before journaling',async()=>{
  const input={question:save.title,payload:save,assistantResponse:wire,correlationId:randomUUID()};
  assert.deepEqual(await verifyProtectedBrowserSave(input),{question:save.title,answer:payload.answer,activity,correlationId:input.correlationId});
  const missing=structuredClone(save);missing.messages[1].activity=[];
  await assert.rejects(verifyProtectedBrowserSave({...input,payload:missing}));
  const different=structuredClone(save);different.messages[1].content='Altered answer';
  await assert.rejects(verifyProtectedBrowserSave({...input,payload:different}));
  await assert.rejects(verifyProtectedBrowserSave({...input,assistantResponse:Buffer.from(event('result',{...payload,
    proposedAction:{kind:'unexpected'}}))}));
  await assert.rejects(verifyProtectedBrowserSave({...input,correlationId:'unbound'}));
});

test('Playwright wiring continues only Auth unchanged and fulfills checked app responses after journal receipt inspection',async()=>{
  let listener;
  const events=[],context={async route(pattern,handle){assert.equal(pattern,'**/*');listener=handle;}};
  const fakeRoute=(url,method,frame=origin+'/dtm')=>({
    request:()=>({url:()=>url,method:()=>method,allHeaders:async()=>({'x-fixture':'checked'}),postData:()=>method==='POST'?'{}':null,
      frame:()=>({url:()=>frame})}),
    async continue(...args){assert.deepEqual(args,[]);events.push('continue');},
    async abort(reason){events.push('abort:'+reason);},
    async fulfill({status,body}){assert.equal(status,200);assert.equal(body.toString(),'accepted');events.push('fulfill');},
  });
  const relay={async dispatch({url,method,headers,frameUrl}){
    assert.equal(headers['x-fixture'],'checked');assert.equal(frameUrl,origin+'/dtm');
    if(url.includes('.supabase.co'))return {kind:'supabase-auth'};
    if(!url.startsWith(origin))throw Error('scope denied');
    assert.equal(method,'POST');
    return {kind:'preview',status:200,headers:{'content-type':'application/json'},body:Buffer.from('accepted')};
  }};
  const drain=await installProtectedConversationBrowserRoute(context,{relay,onReply:()=>events.push('verified receipt'),
    onDenied:()=>events.push('denied')});
  await listener(fakeRoute('https://xiftudmvxphxcjtmfmib.supabase.co/auth/v1/user','GET'));
  await listener(fakeRoute(origin+path,'POST'));
  await listener(fakeRoute('https://example.invalid/blank','GET'));
  await drain();
  assert.deepEqual(events,['continue','verified receipt','fulfill','denied','abort:blockedbyclient']);
});

function fakeBrowser({skipSecondRead=false}={}){
  const events=[],sent=[],known=[],snapshots=[],contexts=[];
  function visible(text,current){
    return {async count(){return text===protectedConversationQuestions[ids.indexOf(current())]?1:0;},async waitFor(){
      assert.equal(await this.count(),1);
    }};
  }
  const steps={count:async()=>1,nth:index=>({innerText:async()=>{assert.equal(index,0);return activity[0].label+' '+activity[0].detail;}})};
  const timeline={filter(){return this;},count:async()=>1,locator:()=>({click:async()=>events.push('expand')}),getByRole:()=>({getByRole:()=>steps})};
  async function openContext(side,knownIds){
    const writes=contexts.length===0,fresh=side==='owner'&&!writes;
    contexts.push({side,knownIds:[...knownIds]});
    const reads=new Set(['index']);
    let current=ids[0],pendingAsk,pendingResponse;
    const log={locator:()=>timeline,getByText:text=>visible(text,()=>side==='other'?'none':current)};
    const page={
      locator:()=>({filter(){return this;}}),
      waitForResponse:matches=>new Promise(resolve=>{pendingResponse=response=>{assert.equal(matches(response),true);resolve(response);};}),
    };
    const dialog={
      getByText:text=>({async waitFor(){assert.equal(text,'Conversation saved to your private account.');}}),
      getByLabel:name=>{assert.equal(name,'Conversations');return {
        inputValue:async()=>current,waitFor:async()=>{},
        selectOption:async value=>{assert.ok(fresh&&knownIds.includes(value));current=value;events.push('reopen:'+ids.indexOf(value));
          if(!skipSecondRead||value!==ids[1])reads.add(value);},
      };},
      getByRole(role,{name}={}){
        if(role==='textbox')return {fill:async text=>{pendingAsk=text;}};
        if(role==='log')return log;
        if(name==='New chat')return {click:async()=>{current=ids[1];events.push('new chat');}};
        if(name==='Send')return {click:async()=>{
          assert.equal(known.find(row=>row.id===current)?.question,pendingAsk);
          sent.push(current);events.push('save:'+ids.indexOf(current));
          pendingResponse({url:()=>origin+path,ok:()=>true,request:()=>({method:()=>'POST',postDataJSON:()=>({id:current})})});
        }};
        throw Error('Unexpected mock locator.');
      },
    };
    return {page,dialog,reads,reserve:options=>{assert.ok(writes);known.push(options);},close:async()=>{events.push('close');}};
  }
  const verifyPersisted=async({id,question})=>{
    assert.equal(sent.length,2);
    assert.equal(question,protectedConversationQuestions[ids.indexOf(id)]);
    snapshots.push(id);events.push('independent read:'+ids.indexOf(id));
    return {activity,correlationId:randomUUID()};
  };
  return {openContext,verifyPersisted,events,sent,known,snapshots,contexts};
}

test('the protected browser packet creates two separate conversations and opens the second first in an empty context',async()=>{
  const h=fakeBrowser();
  assert.deepEqual(await runProtectedConversationBrowser({origin,openContext:h.openContext,verifyPersisted:h.verifyPersisted}),
    {conversations:2,observedSteps:[1,1]});
  assert.deepEqual(h.sent,ids);assert.deepEqual(h.snapshots,ids);
  assert.deepEqual(h.contexts,[{side:'owner',knownIds:[]},{side:'owner',knownIds:ids},{side:'other',knownIds:[]}]);
  assert.deepEqual(h.events,['save:0','new chat','save:1','close','independent read:0','independent read:1',
    'reopen:1','expand','reopen:0','expand','close','close']);
});

test('visible content cannot substitute for the fresh-context second detail read',async()=>{
  const h=fakeBrowser({skipSecondRead:true});
  await assert.rejects(runProtectedConversationBrowser({origin,openContext:h.openContext,verifyPersisted:h.verifyPersisted}),
    /Fresh context must fetch each saved conversation/u);
  assert.deepEqual(h.snapshots,ids);
});
