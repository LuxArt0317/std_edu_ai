import assert from 'node:assert/strict';
import {isConversationId} from '../../../src/services/assistantConversationId.js';
import {boundedAssistantActivity,boundedAssistantText,reconcileAssistantActivity} from '../../../src/services/assistantActivityBudget.js';
import {readAssistantReply} from '../../../src/services/assistantStreamReader.js';
import {assistantActivityTimeline} from '../../../src/features/public/assistantActivityTimeline.ts';
import {sanitizeStoredConversation} from '../../../server/assistantConversationData.js';

export const protectedConversationQuestions=Object.freeze(['What is my display name?','How much is my unpaid tuition?']);
const conversationPath='/api/affairs-conversations',route='/dtm',savedLabel='Conversation saved to your private account.';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

/** Independently bind the exact persisted message and observed timeline to the endpoint SSE. */
export async function verifyProtectedBrowserSave({payload,question,assistantResponse,correlationId}){
  assert.ok(uuid.test(correlationId??'')&&Buffer.isBuffer(assistantResponse)&&assistantResponse.length>0);
  let progress=[];
  const reply=await readAssistantReply(new Response(assistantResponse,{headers:{'Content-Type':'text/event-stream'}}),
    step=>{progress=boundedAssistantActivity(progress,[step]);});
  assert.equal(reply.status,'answered');
  assert.equal(reply.verification?.status,'verified');
  assert.equal(reply.proposedAction,undefined);
  assert.equal(payload.title,question);assert.equal(payload.version,0);
  assert.equal(isConversationId(payload.id)&&payload.id[14]==='7',true);
  const [prompt,answer,...rest]=sanitizeStoredConversation(payload.messages);
  assert.deepEqual(rest,[]);assert.equal(prompt?.role,'user');assert.equal(prompt.content,question);
  assert.equal(answer?.role,'assistant');assert.equal(answer.phase,'complete');assert.equal(answer.actionExpired,false);
  const expectedContent=boundedAssistantText(reply.answer,8000);
  assert.ok(expectedContent.length>0);
  assert.equal(answer.content,expectedContent);assert.equal(answer.result?.answer,expectedContent);
  assert.equal(answer.result.status,reply.status);
  assert.deepEqual(answer.result.verification,{status:'verified',attempts:reply.verification.attempts});
  const expected=boundedAssistantActivity([],reconcileAssistantActivity(progress,reply.activity??[]).map(step=>step.status==='running'
    ?{...step,status:'unavailable',detail:step.detail+' No completion update was received.'}:step));
  assert.ok(expected.length>0&&expected.some(step=>step.status==='complete'));
  assert.deepEqual(answer.activity,expected);
  assert.deepEqual(answer.result.activity,boundedAssistantActivity([],reply.activity??[]));
  return {question,answer:expectedContent,activity:expected,correlationId};
}

/** Keep Playwright forwarding and all response reads in the isolated Node process. */
export async function installProtectedConversationBrowserRoute(context,{relay,onReply=()=>{},onDenied=()=>{}}){
  const pending=new Set();
  await context.route('**/*',route=>{
    const task=(async()=>{
      const request=route.request(),url=request.url(),method=request.method();
      let frameUrl;
      try{frameUrl=request.frame().url();}catch{/* A document navigation may precede its first frame. */}
      try{
        const reply=await relay.dispatch({url,method,headers:await request.allHeaders(),body:request.postData()??undefined,frameUrl});
        if(reply.kind==='supabase-auth'){await route.continue();return;}
        await onReply({url,method,reply});
        await route.fulfill({status:reply.status,headers:reply.headers,body:reply.body});
      }catch{
        onDenied({url,method});
        await route.abort('blockedbyclient').catch(()=>{});
      }
    })();
    pending.add(task);
    return task.finally(()=>pending.delete(task));
  });
  return ()=>Promise.all([...pending]);
}

function waitForWrite(page,origin,id){
  // Attach before the click and observe the browser's own save, not a parallel HTTP write.
  return page.waitForResponse(response=>{
    const request=response.request();
    if(response.url()!==origin+conversationPath||request.method()!=='POST'||!response.ok())return false;
    try{return request.postDataJSON()?.id===id;}catch{return false;}
  },{timeout:65000}).then(()=>null,error=>error);
}

/** Run the two browser saves, independent reads and fresh-context restoration. */
export async function runProtectedConversationBrowser({origin,openContext,verifyPersisted,mark=()=>{}}){
  const completed=[];
  mark('protected browser: create and save two conversations');
  const live=await openContext('owner',[]);
  try{
    const {page,dialog}=live,picker=dialog.getByLabel('Conversations',{exact:true});
    for(const [index,question] of protectedConversationQuestions.entries()){
      if(index)await dialog.getByRole('button',{name:'New chat',exact:true}).click();
      const id=await picker.inputValue();
      assert.ok(isConversationId(id)&&id[14]==='7'&&!completed.some(item=>item.id===id));
      live.reserve({id,mode:'turn',question,route});
      const wait=waitForWrite(page,origin,id);
      await dialog.getByRole('textbox',{name:'Your question',exact:true}).fill(question);
      await dialog.getByRole('button',{name:'Send',exact:true}).click();
      const failed=await wait;if(failed)throw failed;
      await dialog.getByText(savedLabel,{exact:true}).waitFor();
      completed.push({id,question});
    }
  }finally{await live.close();}
  mark('protected browser: verify independent stored conversations');
  for(const item of completed)item.expected=await verifyPersisted(item);
  assert.notEqual(completed[0].expected.correlationId,completed[1].expected.correlationId);

  mark('protected browser: reopen second conversation in a fresh context');
  const fresh=await openContext('owner',completed.map(item=>item.id));
  try{
    const {page,dialog}=fresh,picker=dialog.getByLabel('Conversations',{exact:true}),log=dialog.getByRole('log');
    for(const item of [...completed].reverse()){
      await picker.selectOption(item.id);
      await dialog.getByText(savedLabel,{exact:true}).waitFor();
      assert.ok(fresh.reads.has(item.id),'Fresh context must fetch each saved conversation.');
      await log.getByText(item.question,{exact:true}).waitFor();
      const timeline=log.locator('details').filter({has:page.locator('summary').filter({hasText:'Activity'})});
      assert.equal(await timeline.count(),1);
      const summary=timeline.locator('summary');await summary.click();
      const steps=timeline.getByRole('list',{name:'Observed assistant steps'}).getByRole('listitem');
      const rendered=assistantActivityTimeline(item.expected.activity);
      assert.equal(await steps.count(),rendered.length);
      for(const [index,expected] of rendered.entries()){
        const text=await steps.nth(index).innerText();
        assert.ok(text.includes(expected.label)&&text.includes(expected.detail),'Persisted Activity step differs from the observed response.');
      }
      const other=completed.find(candidate=>candidate.id!==item.id);
      assert.equal(await log.getByText(other.question,{exact:true}).count(),0);
    }
    assert.ok(fresh.reads.has('index'));
  }finally{await fresh.close();}

  mark('protected browser: verify second account isolation');
  const other=await openContext('other',[]);
  try{
    await other.dialog.getByLabel('Conversations',{exact:true}).waitFor();
    assert.ok(other.reads.has('index'),'Other account must receive a server index.');
    for(const item of completed)assert.equal(await other.dialog.getByRole('log').getByText(item.question,{exact:true}).count(),0);
  }finally{await other.close();}
  return {conversations:completed.length,observedSteps:completed.map(item=>item.expected.activity.length)};
}
