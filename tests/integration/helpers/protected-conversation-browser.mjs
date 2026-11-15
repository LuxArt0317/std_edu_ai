import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {isConversationId} from '../../../src/services/assistantConversationId.js';
import {boundedAssistantActivity,boundedAssistantText,reconcileAssistantActivity} from '../../../src/services/assistantActivityBudget.js';
import {readAssistantReply} from '../../../src/services/assistantStreamReader.js';
import {assistantActivityStatus,assistantActivityTimeline} from '../../../src/features/public/assistantActivityTimeline.ts';
import {sanitizeStoredConversation} from '../../../server/assistantConversationData.js';
import {requireProtectedBrowser as check} from '../../evaluation/protected-browser-diagnostics.mjs';

export const protectedConversationQuestions=Object.freeze(['What is my display name?','How much is my unpaid tuition?']);
const conversationPath='/api/affairs-conversations',route='/dtm',savedLabel='Conversation saved to your private account.';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

/** Independently bind the exact persisted message and observed timeline to the endpoint SSE. */
export async function verifyProtectedBrowserSave({payload,question,assistantResponse,correlationId}){
  check(uuid.test(correlationId??'')&&Buffer.isBuffer(assistantResponse)&&assistantResponse.length>0,'save stream binding');
  let reply,progress=[];
  try{
    reply=await readAssistantReply(new Response(assistantResponse,{headers:{'Content-Type':'text/event-stream'}}),
      step=>{progress=boundedAssistantActivity(progress,[step]);});
  }catch{check(false,'save malformed assistant stream');}
  if(reply.status==='abstained')check(false,'save assistant abstained');
  if(reply.status==='clarification')check(false,'save assistant clarification');
  if(reply.status==='handoff')check(false,'save assistant handoff');
  check(reply.status==='answered','save unexpected assistant status');
  check(reply.verification?.status==='verified','save assistant unverified');
  check(reply.proposedAction===undefined,'save unexpected proposed action');
  check(payload?.title===question&&payload.version===0&&isConversationId(payload.id)&&payload.id[14]==='7','save envelope mismatch');
  const [prompt,answer,...rest]=sanitizeStoredConversation(payload.messages);
  check(!rest.length&&prompt?.role==='user'&&prompt.content===question&&answer?.role==='assistant'
    &&answer.phase==='complete'&&answer.actionExpired===false,'save message shape mismatch');
  const expectedContent=boundedAssistantText(reply.answer,8000);
  check(expectedContent&&answer.content===expectedContent&&answer.result?.answer===expectedContent
    &&answer.result.status===reply.status,'save answer mismatch');
  check(answer.result.verification?.status==='verified'&&answer.result.verification.attempts===reply.verification.attempts,
    'save verification mismatch');
  const expected=boundedAssistantActivity([],reconcileAssistantActivity(progress,reply.activity??[]).map(step=>step.status==='running'
    ?{...step,status:'unavailable',detail:step.detail+' No completion update was received.'}:step));
  check(expected.length>0&&expected.some(step=>step.status==='complete'),'save no completed activity');
  check(isDeepStrictEqual(answer.activity,expected),'save activity mismatch');
  check(isDeepStrictEqual(answer.result.activity,boundedAssistantActivity([],reply.activity??[])),'save terminal activity mismatch');
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
      }catch(error){
        onDenied({url,method,error});
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

/** Compare the visible native reply, local links and expanded Activity to the
 * verified save. Works in the original view and after an independent reload. */
export async function verifyRenderedCertificateBrowserTurn({dialog,expected}){
  const log=dialog.getByRole('log',{name:'Assistant conversation'});
  const articles=log.getByRole('article'),reply=articles.nth(1),display=expected.display;
  await reply.getByText(display.summary,{exact:true}).first().waitFor({state:'visible'});
  const header=articles.nth(0);
  check(await articles.count()===2&&await header.getByText(expected.question,{exact:true}).isVisible(),
    'rendered certificate transcript mismatch');
  const markdown=reply.locator('.nexus-message-markdown');
  const body=await markdown.evaluate(element=>({
    paragraphs:[...element.querySelectorAll(':scope > p')].map(row=>row.textContent),
    items:[...element.querySelectorAll(':scope > ul > li')].map(row=>row.textContent),
    links:[...element.querySelectorAll('a')].map(row=>({title:row.textContent,url:row.getAttribute('href')})),
    tags:[...element.children].map(row=>row.tagName),
  }));
  const links=[{title:display.title,url:display.url}];
  const paragraphs=display.paragraphs??[display.summary,...(display.bankNote?[display.bankNote]:[]),display.title];
  check(isDeepStrictEqual(body,{paragraphs,
    items:display.items,links,tags:['P',...(display.items.length?['UL']:[]),...paragraphs.slice(1).map(()=>'P')]}),
  'rendered certificate transcript mismatch');
  const sources=await reply.getByRole('list',{name:'Sources'}).evaluate(element=>({
    links:[...element.querySelectorAll('a')].map(row=>({title:row.textContent,url:row.getAttribute('href')})),
    names:[...element.querySelectorAll('li > span')].map(row=>row.textContent),
  }));
  const sourceLinks=display.sourceLinks??[{...links[0],sourceName:display.sourceName}];
  check(isDeepStrictEqual(sources,{links:sourceLinks.map(({title,url})=>({title,url})),
    names:sourceLinks.map(({sourceName})=>sourceName)}),'rendered certificate transcript mismatch');
  const activity=reply.locator('details').filter({hasText:'Activity'});
  check(await activity.count()===1&&await activity.locator('summary').getByText('Activity',{exact:true}).isVisible(),
    'rendered certificate activity mismatch');
  if(await activity.getAttribute('open')===null)await activity.locator('summary').click();
  const steps=await activity.getByRole('list',{name:'Observed assistant steps'}).evaluate(element=>
    [...element.querySelectorAll(':scope > li > span:not([aria-hidden])')].map(row=>
      [...row.children].map(node=>node.textContent)));
  check(isDeepStrictEqual(steps,assistantActivityTimeline(expected.activity).map(step=>[
    assistantActivityStatus(step)+': ',step.label,step.detail,
  ])),'rendered certificate activity mismatch');
  return {requestSequence:expected.requestSequence,observedSteps:steps.length};
}

/** Run the two browser saves, independent reads and fresh-context restoration. */
export async function runProtectedConversationBrowser({origin,openContext,verifyPersisted,onTurnVerified=()=>{},mark=()=>{}}){
  const completed=[];
  mark('protected browser: create and save two conversations');
  const live=await openContext('owner',[]);
  try{
    const {page,dialog}=live,picker=dialog.getByLabel('Conversations',{exact:true});
    for(const [index,question] of protectedConversationQuestions.entries()){
      const label='protected browser: turn '+(index+1);
      mark(label+' prepare conversation');
      if(index)await dialog.getByRole('button',{name:'New chat',exact:true}).click();
      const id=await picker.inputValue();
      assert.ok(isConversationId(id)&&id[14]==='7'&&!completed.some(item=>item.id===id));
      live.reserve({id,mode:'turn',question,route});
      const wait=waitForWrite(page,origin,id);
      mark(label+' await browser autosave');
      await dialog.getByRole('textbox',{name:'Your question',exact:true}).fill(question);
      await dialog.getByRole('button',{name:'Send',exact:true}).click();
      const failure=await Promise.race(live.denied?[wait,live.denied]:[wait]);
      if(failure)throw failure;
      const saveStatus=dialog.getByText(savedLabel,{exact:true}).waitFor().then(()=>null,error=>error);
      const missing=await Promise.race(live.denied?[saveStatus,live.denied]:[saveStatus]);
      if(missing)throw missing;
      mark(label+' check owned HTTP and SQL');
      const expected=await verifyPersisted({id,question});
      completed.push({id,question,expected});
      await onTurnVerified({turn:index+1,observedSteps:expected.activity.length});
    }
  }finally{await live.close();}
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
