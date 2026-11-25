import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {sanitizeStoredConversation} from '../../server/assistantConversationData.js';

const origin=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5173';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Use a local compiled build.');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const title='What are my saved subjects?';
const activity=[{kind:'subjects',label:'Checked saved subjects',detail:'Read the selected account records.',status:'complete'}];
const questionAnswer='Your saved subjects were checked.';
async function check(failure) {
  const context=await browser.newContext({viewport:{width:390,height:900}});
  try {
    await mockAffairsAuth(context);
    const saved=new Map(),writes=[],deletes=[],errors=[];
    await context.route('**/api/affairs-assistant',route=>{
      assert.equal(route.request().postDataJSON().question,title);
      return route.fulfill({json:{status:'answered',answer:questionAnswer,citations:[],suggestedQuestions:[],activity,
        grounding:{source:'account',webSearched:false},verification:{status:'verified',attempts:1}}});
    });
    await context.route('**/api/affairs-conversations*',route=>{
      const method=route.request().method(),id=new URL(route.request().url()).searchParams.get('id');
      assert.match(route.request().headers().authorization??'',/^Bearer /u);
      if(method==='DELETE'){
        deletes.push(id);
        saved.delete(id);
        return route.fulfill({json:{deleted:true}});
      }
      if(method==='GET'){
        if(id)return saved.has(id)?route.fulfill({json:saved.get(id)}):route.fulfill({status:404,json:{error:'Conversation not found.'}});
        return route.fulfill({json:{conversations:[...saved.values()].map(({messages:_,...index})=>index)}});
      }
      assert.equal(method,'POST');
      const draft=route.request().postDataJSON();
      writes.push(draft);
      const recorded={id:draft.id,title:draft.title,messages:sanitizeStoredConversation(draft.messages),version:draft.version+1,updated_at:'2026-11-15T02:00:00Z'};
      if(failure==='ambiguous-delete'){
        saved.set(draft.id,recorded);
        return route.fulfill({status:503,json:{error:'Save response unavailable.'}});
      }
      if(writes.length===1){
        return route.fulfill({json:{...recorded,messages:recorded.messages.map(message=>message.role==='assistant'?
          {...message,activity:[]}:message)}});
      }
      saved.set(draft.id,recorded);
      return route.fulfill({json:recorded});
    });
    const page=await context.newPage();
    page.setDefaultTimeout(5000);
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/campus-assistant');
    await page.getByRole('link',{name:'School Affairs account',exact:true}).waitFor();
    await page.getByPlaceholder('Ask a school question…').fill(title);
    await page.getByRole('button',{name:'Send',exact:true}).click();
    await page.getByText(questionAnswer,{exact:true}).waitFor();
    if(failure==='ambiguous-delete'){
      await page.getByText('Save response unavailable.',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Delete this conversation'}).click();
      await page.getByText(questionAnswer,{exact:true}).waitFor({state:'hidden'});
      assert.deepEqual(deletes,[writes[0].id],'a timed-out save can already exist on the account');
      assert.equal(saved.size,0);
      await page.reload();
      await page.getByRole('combobox',{name:'Conversations'}).getByRole('option',{name:'New conversation'}).waitFor({state:'attached'});
      assert.equal(await page.getByRole('combobox',{name:'Conversations'}).getByRole('option',{name:title,exact:true}).count(),0);
    } else {
      await page.getByText('The saved conversation did not match this version. Retry saving it.',{exact:true}).waitFor();
      assert.equal(await page.getByText('Conversation saved to your private account.',{exact:true}).count(),0);
      await page.getByRole('button',{name:'Retry save'}).click();
      await page.getByText('Conversation saved to your private account.',{exact:true}).waitFor();
      assert.equal(writes.length,2);
      assert.deepEqual(writes[0],writes[1]);
      await page.getByRole('button',{name:'New chat'}).click();
      await page.getByText(questionAnswer,{exact:true}).waitFor({state:'hidden'});
      await page.evaluate(()=>sessionStorage.clear());
      await page.reload();
      await page.getByRole('link',{name:'School Affairs account',exact:true}).waitFor();
      await page.getByRole('combobox',{name:'Conversations'}).getByRole('option',{name:title,exact:true}).waitFor({state:'attached'});
      await page.getByRole('combobox',{name:'Conversations'}).selectOption(writes[0].id);
      await page.getByText(questionAnswer,{exact:true}).waitFor();
      await page.locator('article').last().locator('summary').click();
      await page.getByText('Checked saved subjects',{exact:true}).waitFor();
    }
    assert.deepEqual(errors,[]);
  } finally {await context.close();}
}
try {
  const outcomes=await Promise.allSettled(['ambiguous-delete','mismatched-receipt'].map(check));
  for(const [index,outcome] of outcomes.entries())if(outcome.status==='rejected')console.error(index,outcome.reason);
  assert.ok(outcomes.every(outcome=>outcome.status==='fulfilled'),'Both signed-in session scenarios must pass.');
  console.log(JSON.stringify({status:'ok',ambiguousDeleteRemovedAccountCopy:true,unmatchedReceiptWithheld:true,replayPreservedActivity:true}));
} finally {await browser.close();}
