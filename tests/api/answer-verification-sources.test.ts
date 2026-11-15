import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {readVerificationSources} from '../../server/answerVerificationSources.js';
import {repairEvidenceAnswer,verifyEvidenceAnswer,snapshotProvenanceSupported} from '../../server/answerVerificationModel.js';
test('blocked public source falls back only to an exact checksum-verified dated capture',async()=>{
 const source='https://www.stu.edu.tw/about/',bytes=new TextEncoder().encode('<html><body><main><p>The public founding record dates to 1997.</p></main></body></html>');
 const citations=[{chunkId:'source-one',title:'About STU',url:source}],calls:string[]=[];
 const capture={source,aliases:[],file:'/school-pages/0123456789abcdef0123.html',route:'/about/',checksum:createHash('sha256').update(bytes).digest('hex'),capturedOn:'2026-11-03'};
 const deps={captures:[capture],acquire:async()=>{throw new Error('Source challenge');},fetchCapture:async(url:string)=>{calls.push(url);return new Response(bytes);}};
 const result=await readVerificationSources(citations,Date.now()+10000,deps);
 assert.equal(result.length,1);assert.match(result[0].content,/Previously captured/);assert.match(result[0].content,/2026-11-03/);assert.match(result[0].content,/1997/);
 assert.equal(result[0].capturedOn,'2026-11-03');
 assert.deepEqual(calls,['https://stu.best'+capture.file]);
 assert.equal((await readVerificationSources(citations,Date.now()+10000,{...deps,fetchCapture:async()=>new Response('tampered')})).length,0);
 assert.equal((await readVerificationSources([{...citations[0],url:'https://unmatched.example/about/'}],Date.now()+10000,deps)).length,0);
 assert.equal(calls.length,1,'Unmatched source must not fetch a guessed capture');
});

test('captured evidence cannot pass as live; correction visibly dates both answer and citation',async()=>{
 const evidence=[{id:'source-one',url:'https://www.stu.edu.tw/about/',title:'About STU',capturedOn:'2026-11-03',content:'The public founding record dates to 1997. Captured on 2026-11-03.'}];
 const candidate={status:'answered',answer:'The school was founded in 1997.',citations:[{chunkId:'source-one',url:evidence[0].url,sourceName:'Live web',reviewedAt:'2026-11-13'}]};
 const context={question:'When was the school founded?',candidate,evidence,deadline:Date.now()+10000};
 assert.equal((await verifyEvidenceAnswer(context)).reason,'snapshot_provenance_missing');
 const savedFetch=globalThis.fetch,savedKey=process.env.OPENAI_API_KEY;
 process.env.OPENAI_API_KEY='test';
 globalThis.fetch=async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({status:'answered',answer:candidate.answer,sourceIds:['source-one']})}]}]});
 try {
  const result=await repairEvidenceAnswer(context);
  assert.match(result.answer,/Source snapshot: 2026-11-03\./);
  assert.equal(result.answer.match(/Source snapshot:/g)?.length,1);
  assert.equal(result.citations[0].sourceName,'Public page snapshot · 2026-11-03');
  assert.equal(result.citations[0].reviewedAt,null);
  assert.equal(snapshotProvenanceSupported(result,evidence),true);
  assert.equal(candidate.citations[0].sourceName,'Live web','Correction must not mutate the previous candidate');
  assert.equal(snapshotProvenanceSupported({...candidate,citations:[]},evidence,['source-one']),false,'A reviewer-established source also requires visible provenance');
 } finally {globalThis.fetch=savedFetch;if(savedKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=savedKey;}
});

test('an image correction may cite the actual attachment but never invent an attachment source',async()=>{
 const savedFetch=globalThis.fetch,savedKey=process.env.OPENAI_API_KEY;
 process.env.OPENAI_API_KEY='test';
 globalThis.fetch=async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({status:'answered',answer:'The counter is Room A201.',sourceIds:['attached-image']})}]}]});
 const context={question:'What room is visible?',candidate:{answer:'Room A301.',status:'answered',citations:[]},evidence:[],deadline:Date.now()+10000};
 try {
  const result=await repairEvidenceAnswer(context,[{dataUrl:'data:image/png;base64,dGVzdA=='}]);
  assert.equal(result.answer,'The counter is Room A201.');assert.deepEqual(result.citations,[]);
  await assert.rejects(()=>repairEvidenceAnswer({...context,evidence:[{id:'text-only',content:'No image is attached.'}]}),/Invalid correction/);
 } finally {globalThis.fetch=savedFetch;if(savedKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=savedKey;}
});
