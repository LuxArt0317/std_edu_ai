import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {announcementEmailQuestion,parseAnnouncementEmail} from '../../server/announcementEmailContract.js';
import {createAnnouncementEmailDelivery} from '../../server/announcementEmailDelivery.js';

test('announcement email intent separates private status and navigation',()=>{
  for(const prompt of ['Is my campus announcement email on?','Will I receive campus announcements by email?','我的校園公告郵件設定有開啟嗎？'])
    assert.equal(announcementEmailQuestion(prompt),'status',prompt);
  for(const prompt of ['Where are announcement email settings?','校園公告 E-MAIL 設定在哪裡？'])
    assert.equal(announcementEmailQuestion(prompt),'guide',prompt);
  for(const prompt of ['What announcements were published today?','What is the registrar email?','Write code for announcement email'])
    assert.equal(announcementEmailQuestion(prompt),null,prompt);
});
test('preference parser rejects wrong-account and forged active responses',()=>{
  const id=randomUUID();
  const result={userId:id,enabled:false,active:false,effectiveAt:null,version:0};
  assert.deepEqual(parseAnnouncementEmail(result,id),result);
  assert.throws(()=>parseAnnouncementEmail(result,randomUUID()));
  assert.throws(()=>parseAnnouncementEmail({...result,active:true},id));
  assert.throws(()=>parseAnnouncementEmail({...result,enabled:true},id));
});

const secret='x'.repeat(40),origin='https://db.example.invalid',sender='Campus <notices@example.invalid>';
const env={CRON_SECRET:secret,ANNOUNCEMENT_EMAIL_RESEND_KEY:'fixture-key',ANNOUNCEMENT_EMAIL_FROM:sender,SUPABASE_SERVICE_ROLE_KEY:'fixture-db'};
const item={id:randomUUID(),lease:randomUUID(),to:'recipient@example.invalid',title:'Campus event',body:'An upcoming event.'};
function response(){
  const result={code:0,body:null as unknown};
  const output={status(code:number){result.code=code;return output;},json(body:unknown){result.body=body;},setHeader(){}};
  return {result,output};
}
const request={method:'GET',headers:{authorization:'Bearer '+secret},query:{resource:'announcement-email-delivery'}};

test('worker authorization and missing configuration fail before any provider access',async()=>{
  const fetchRequest:typeof fetch=async()=>{throw new Error('No network expected');};
  const runner=createAnnouncementEmailDelivery({env:{...env,ANNOUNCEMENT_EMAIL_RESEND_KEY:''},fetchRequest});
  const a=response();
  await runner({...request,headers:{}},a.output);assert.equal(a.result.code,401);
  const b=response();
  await runner(request,b.output);assert.equal(b.result.code,503);
  const c=response();
  await runner({...request,query:{...request.query,id:'other'}},c.output);assert.equal(c.result.code,400);
});
test('worker uses exact recipient, stable provider key, and fenced acknowledgements',async()=>{
  for(const providerStatus of [200,429,422]){
    const calls:Array<{url:string;body:Record<string,unknown>;headers:Headers}>=[];
    let claims=0;
    const fetchRequest:typeof fetch=async(input,init)=>{
      const url=String(input),body=JSON.parse(String(init?.body));
      calls.push({url,body,headers:new Headers(init?.headers)});
      if(url.endsWith('/affairs_claim_announcement_email'))return Response.json(claims++?null:item);
      if(url==='https://api.resend.com/emails')return Response.json({id:'provider-message'},{status:providerStatus});
      assert.ok(url.endsWith('/affairs_finish_announcement_email'));
      return Response.json(true);
    };
    const runner=createAnnouncementEmailDelivery({env,fetchRequest,database:()=>({url:origin,key:'public'})});
    const output=response();
    await runner(request,output.output);
    const [,mail,finish]=calls;
    assert.match(String(calls[0].body.p_envelope_digest),/^[a-f0-9]{64}$/);
    assert.equal(mail.headers.get('idempotency-key'),'stu-announcement/'+item.id);
    assert.deepEqual(mail.body,{from:sender,to:[item.to],subject:item.title,text:item.body});
    const outcome=providerStatus===200?'accepted':providerStatus===429?'retry':'failed';
    assert.deepEqual(finish.body,{p_id:item.id,p_lease:item.lease,p_result:outcome,p_provider_id:providerStatus===200?'provider-message':null});
    assert.equal(output.result.code,providerStatus===200?200:503);
    assert.equal(JSON.stringify(output.result.body).includes(item.to),false);
  }
});
