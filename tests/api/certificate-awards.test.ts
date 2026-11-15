import assert from 'node:assert/strict';
import test from 'node:test';
import {certificateAwardBankReceiptNote,certificateAwardBankReceiptQuestion,certificateAwardPath,certificateAwardQuestion,certificateAwardRecordId,certificateAwardScope} from '../../server/certificateAwardsContract.js';
import {certificateAwardGuide} from '../../server/certificateAwards.js';
import dataHandler from '../../api/affairs-data.ts';

test('certificate award queries distinguish navigation from private records',()=>{
  assert.equal(certificateAwardQuestion('How do I apply for a certificate award?'),'guide');
  assert.equal(certificateAwardQuestion('What is my certificate award status?'),'status');
  assert.equal(certificateAwardQuestion('我的證照獎助金審核狀態？'),'status');
  assert.equal(certificateAwardQuestion('How can I get an enrollment certificate?'),null);
  assert.equal(certificateAwardQuestion('write code for a certificate grant'),null);
  const paired='What is the status of my professional certificate subsidy application? Also tell me whether its payout has reached my bank.';
  assert.equal(certificateAwardQuestion(paired),'status');
  assert.equal(certificateAwardBankReceiptQuestion(paired),true);
  assert.equal(certificateAwardBankReceiptQuestion('Has my certificate award been paid into my bank account?'),true);
  assert.equal(certificateAwardBankReceiptQuestion('我的證照獎助金審核狀態？獎助金入帳了嗎？'),true);
  assert.equal(certificateAwardBankReceiptQuestion('Show my certificate award status and bank profile details.'),false);
  assert.equal(certificateAwardQuestion('Show another student’s certificate subsidy status.'),null);
  assert.equal(certificateAwardQuestion('Has its payout reached my bank?',certificateAwardPath),'status');
  assert.equal(certificateAwardQuestion('Has its payout reached my bank?','/dtm'),null);
  const publicPair=certificateAwardGuide(paired,'status');
  assert.ok(publicPair&&typeof publicPair==='object');
  assert.ok('status' in publicPair&&publicPair.status==='handoff');
  assert.ok('answer' in publicPair&&typeof publicPair.answer==='string'&&publicPair.answer.includes(certificateAwardBankReceiptNote[1]));

  assert.match(JSON.stringify(certificateAwardGuide('my certificate award status','status')),/%2Fschool-affairs%2Fservices%2F52-1/u);
});

const selected='45000000-0000-4000-8000-000000000001',otherOwn='45000000-0000-4000-8000-000000000002';
const foreign='45000000-0000-4000-8000-000000000003';
const recordPath=(id:string)=>`${certificateAwardPath}/record/${id}`;

test('certificate selection is bound to the exact local record path',()=>{
  assert.equal(certificateAwardRecordId(recordPath(selected)),selected);
  assert.equal(certificateAwardRecordId(recordPath(selected)+'?id='+foreign),selected);
  for(const invalid of [certificateAwardPath,certificateAwardPath+'/catalog',recordPath('invalid'),recordPath(selected)+'/edit',
    '//renderer.invalid'+recordPath(selected),'https://renderer.invalid'+recordPath(selected)])
    assert.equal(certificateAwardRecordId(invalid),null,invalid);
});

test('selected certificate answers use the actual handler and one caller-owned record',async t=>{
  const url='https://xiftudmvxphxcjtmfmib.supabase.co',key='synthetic-certificate-publishable-key';
  const previousUrl=process.env.VITE_SUPABASE_URL,previousKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  process.env.VITE_SUPABASE_URL=url;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=key;
  t.after(()=>{
    if(previousUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=previousUrl;
    if(previousKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=previousKey;
  });
  const ownerA='20000000-0000-4000-8000-000000000001',ownerB='20000000-0000-4000-8000-000000000002';
  const tokenA='certificate-selection-owner-a'.repeat(3),tokenB='certificate-selection-owner-b'.repeat(3);
  const users=new Map([[`Bearer ${tokenA}`,ownerA],[`Bearer ${tokenB}`,ownerB]]);
  const award=(id:string,name:string,status:string,award_amount:number|null)=>({id,name,status,wants_award:true,award_amount});
  const records=new Map([[ownerA,[award(otherOwn,'Newer unrelated certificate','approved',900),award(selected,'Selected certificate','reviewing',null)]],
    [ownerB,[award(foreign,'Another owner certificate','submitted',null)]]]);
  const reads:Array<{owner:string;p_target:null;p_id:string|null;p_status_only:boolean}>=[];
  let incorrectSelection:'multiple'|'different'|null=null;
  t.mock.method(globalThis,'fetch',async (input:RequestInfo|URL,init?:RequestInit)=>{
    const target=new URL(String(input)),headers=new Headers(init?.headers),owner=users.get(headers.get('authorization')??'');
    assert.equal(target.origin,url);assert.equal(headers.get('apikey'),key);assert.ok(owner);
    if(target.pathname==='/auth/v1/user')return Response.json({id:owner,identities:[{provider:'google'}]});
    assert.equal(target.pathname,'/rest/v1/rpc/affairs_read_certificate_awards');
    assert.equal(init?.redirect,'error');assert.equal(init?.method,'POST');
    const args=JSON.parse(String(init?.body));
    assert.deepEqual(args,{p_target:null,p_id:args.p_id,p_status_only:args.p_id===null});
    reads.push({owner,...args});
    const rows=records.get(owner)!;
    if(args.p_status_only)return Response.json({userId:owner,rows});
    const row=rows.find(record=>record.id===args.p_id);
    if(!row)return Response.json({error:'Application unavailable'},{status:404});
    const selection=incorrectSelection==='multiple'?rows:incorrectSelection==='different'?[rows[0]]:
      [{...row,phone:'PRIVATE_PHONE',review_note:'PRIVATE_REVIEW_NOTE'}];
    return Response.json({userId:owner,identity:{name:'PRIVATE_IDENTITY'},payout:{bank:'PRIVATE_BANK'},files:[{path:'PRIVATE_STORAGE_PATH'}],rows:selection});
  });
  async function read(token:string,params:Record<string,string|string[]>){
    const result:{status:number;body:Record<string,unknown>}={status:200,body:{}};
    const response={status(status:number){result.status=status;return response;},json(body:unknown){result.body=body as Record<string,unknown>;},setHeader(){}};
    await dataHandler({method:'GET',query:{scope:certificateAwardScope,view:'mine',answer:'en',...params},
      headers:{authorization:`Bearer ${token}`}},response);
    return result;
  }
  const exact=await read(tokenA,{id:selected});
  assert.equal(exact.status,200);
  assert.match(String(exact.body.answer),/Selected certificate · Under review/u);
  assert.doesNotMatch(JSON.stringify(exact.body),/Newer unrelated|Another owner|PRIVATE_/u);
  assert.match(String(exact.body.answer),new RegExp(recordPath(selected),'u'));
  assert.equal((exact.body.citations as Array<{url:string}>)[0].url,recordPath(selected));
  const aggregate=await read(tokenA,{});
  assert.equal(aggregate.status,200);
  assert.match(String(aggregate.body.answer),/Your recent certificate applications:/u);
  assert.match(String(aggregate.body.answer),/Newer unrelated certificate · Approved · NT\$900/u);
  assert.match(String(aggregate.body.answer),/Selected certificate · Under review/u);
  assert.equal((aggregate.body.citations as Array<{url:string}>)[0].url,certificateAwardPath);

  const paired=await read(tokenA,{id:otherOwn,bank_receipt:'requested'});
  assert.equal(paired.status,200);
  assert.match(String(paired.body.answer),/Newer unrelated certificate · Approved · NT\$900/u);
  assert.ok(String(paired.body.answer).includes(certificateAwardBankReceiptNote[1]));
  assert.doesNotMatch(JSON.stringify(paired.body),/PRIVATE_|Selected certificate|Another owner/u);
  assert.equal((paired.body.citations as Array<{url:string}>)[0].url,recordPath(otherOwn));
  assert.equal((paired.body.activity as Array<{status:string}>).at(-1)?.status,'unavailable');
  assert.doesNotMatch(String(exact.body.answer),/reached your bank/u);
  assert.equal((await read(tokenA,{bank_receipt:'yes'})).status,400);
  assert.equal((await read(tokenA,{bank_receipt:['requested','requested']})).status,400);
  assert.equal((await read(tokenA,{view:'catalog',bank_receipt:'requested'})).status,400);
  const localizedPair=await read(tokenB,{id:foreign,answer:'zh',bank_receipt:'requested'});
  assert.equal(localizedPair.status,200);
  assert.ok(String(localizedPair.body.answer).includes(certificateAwardBankReceiptNote[0]));
  assert.doesNotMatch(JSON.stringify(localizedPair.body),/PRIVATE_|Selected certificate/u);


  const ownB=await read(tokenB,{id:foreign,answer:'zh'});
  assert.equal(ownB.status,200);
  assert.match(String(ownB.body.answer),/Another owner certificate · 申請中/u);
  const crossed=await read(tokenB,{id:selected});
  assert.equal(crossed.status,404);
  assert.deepEqual(Object.keys(crossed.body),['error']);
  assert.doesNotMatch(JSON.stringify(crossed.body),/Selected certificate|Another owner|PRIVATE_/u);
  assert.equal((await read(tokenA,{id:[selected,otherOwn]})).status,400);
  assert.equal((await read(tokenA,{id:selected,user_id:ownerB})).status,400);
  incorrectSelection='multiple';
  assert.equal((await read(tokenA,{id:selected})).status,503);
  incorrectSelection='different';
  assert.equal((await read(tokenA,{id:selected})).status,503);
  assert.deepEqual(reads,[[ownerA,selected],[ownerA,null],[ownerA,otherOwn],[ownerB,foreign],[ownerB,foreign],[ownerB,selected],[ownerA,selected],[ownerA,selected]]
    .map(([owner,p_id])=>({owner,p_target:null,p_id,p_status_only:p_id===null})));
});
