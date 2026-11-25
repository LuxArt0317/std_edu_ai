import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resolvePublicJudgeEvidence,publicJudgeMethodVersion} from './public-judge-evidence.mjs';
import pages from '../../src/features/public/mirror/pages.json' with {type:'json'};
import doc from '../../server/data/ipiac115.json' with {type:'json'};
const root=new URL('../../',import.meta.url).pathname;
const run=(urls,extra={})=>({scope:'public',response:{answer:'',citations:urls.map(url=>({url})),...extra}});
test('actual registered prospectus supplies literal historical timeline from checked HTML, ignoring client evidence',async()=>{
 const result=await resolvePublicJudgeEvidence(root,run([doc.url],{verification:{status:'verified'},excerpt:'invented date 2099'}));
 assert.equal(result.methodVersion,publicJudgeMethodVersion);assert.equal(result.sources.length,1);
 assert.equal(result.sources[0].checksum,doc.captureChecksum);
 assert.match(result.sources[0].excerpt,/May 20/u);assert.match(result.sources[0].excerpt,/Application Begins/u);
 assert.doesNotMatch(JSON.stringify(result),/invented date 2099/u);
 assert.match(result.provenance,/not proof of original retrieval/u);
});
test('registered originals and same-site absolute aliases deduplicate without arbitrary fetch',async()=>{
 const page=pages[0];const result=await resolvePublicJudgeEvidence(root,run([page.source,'https://stu.best'+page.route,page.route]));
 assert.equal(result.sources.length,1);assert.equal(result.destinationMappings[0].originalUrl,page.source);
});
test('private scopes, native routes, unknown hosts, traversal and client flags never create evidence',async()=>{
 const unsafe=['/school-affairs/records/grades','/dtm/assignments','https://evil.test/a','//evil.test/a','/school-pages/../secret','https://stu.best@evil.test/a','https://stu.best/ignored/../source-documents/ipiac-115/index.html'];
 const result=await resolvePublicJudgeEvidence(root,run(unsafe,{verified:true,sources:[{excerpt:'TRUST ME'}]}));
 assert.equal(result.sources.length,0);assert.equal(result.unresolved.length,unsafe.length);
 const privateResult=await resolvePublicJudgeEvidence(root,{...run([doc.url]),scope:'account'});
 assert.equal(privateResult.scope,'not_public');assert.equal(privateResult.sources.length,0);
});
test('missing or tampered bytes fail closed, even with verified response',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'judge-evidence-'));try{
  await mkdir(join(temp,'public/school-pages'),{recursive:true});
  await writeFile(join(temp,'public',doc.captureFile),'tampered');
  const result=await resolvePublicJudgeEvidence(temp,run([doc.url],{verification:{status:'verified'}}));
  assert.equal(result.sources.length,0);assert.equal(result.unresolved[0].reason,'capture_unavailable_or_integrity_failed');
 }finally{await rm(temp,{recursive:true,force:true});}
});
test('source count, total text and expired deadlines are bounded',async()=>{
 const result=await resolvePublicJudgeEvidence(root,run([doc.url,...pages.slice(0,9).map(page=>page.route)]),{deadline:Date.now()+15000});
 assert.ok(result.sources.length<=4);assert.ok(result.sources.reduce((sum,row)=>sum+row.excerpt.length,0)<=24000);
 assert.ok(result.unresolved.some(row=>row.reason==='source_limit'));
 const expired=await resolvePublicJudgeEvidence(root,run([doc.url]),{deadline:Date.now()-1});
 assert.equal(expired.sources.length,0);assert.equal(expired.unresolved[0].reason,'deadline');
});
test('hosted missing files fetch only the fixed registered static capture with checked bytes',async()=>{
 const previous=process.env.VERCEL_ENV,original=globalThis.fetch;let calls=0;
 process.env.VERCEL_ENV='preview';
 try{
  const {readFile}=await import('node:fs/promises');const bytes=await readFile(join(root,'public',doc.captureFile));
  globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://stu.best'+doc.captureFile);assert.equal(options.redirect,'error');assert.deepEqual(options.headers,{Accept:'text/html'});return new Response(bytes);};
  const result=await resolvePublicJudgeEvidence('/nonexistent-judge-root',run([doc.url]));
  assert.equal(result.sources.length,1);assert.equal(result.sources[0].transport,'pinned-stu-best-static');assert.match(result.sources[0].excerpt,/Application Begins/u);assert.equal(calls,1);
  await resolvePublicJudgeEvidence('/nonexistent-judge-root',run(['/school-affairs/records/grades','https://evil.test/a']));
  await resolvePublicJudgeEvidence('/nonexistent-judge-root',{...run([doc.url]),scope:'account'});assert.equal(calls,1);
 }finally{globalThis.fetch=original;if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous;}
});
test('hosted fallback rejects bad hashes, redirects and both declared and streamed oversize',async()=>{
 const previous=process.env.VERCEL_ENV,original=globalThis.fetch;process.env.VERCEL_ENV='production';
 try{
  for(const response of [new Response('tampered'),{ok:true,redirected:true,url:'https://evil.test/a'},new Response('small',{headers:{'content-length':'4000001'}}),new Response(new Uint8Array(4000001))]){
   globalThis.fetch=async()=>response;
   const result=await resolvePublicJudgeEvidence('/nonexistent-judge-root',run([doc.url]));assert.equal(result.sources.length,0);assert.equal(result.unresolved[0].reason,'capture_unavailable_or_integrity_failed');
  }
 }finally{globalThis.fetch=original;if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous;}
});
test('missing files outside hosted environments never trigger a network fetch',async()=>{
 const previous=process.env.VERCEL_ENV,original=globalThis.fetch;delete process.env.VERCEL_ENV;
 try{globalThis.fetch=async()=>assert.fail('local resolver must not fetch');const result=await resolvePublicJudgeEvidence('/nonexistent-judge-root',run([doc.url]));assert.equal(result.sources.length,0);}
 finally{globalThis.fetch=original;if(previous!==undefined)process.env.VERCEL_ENV=previous;}
});
