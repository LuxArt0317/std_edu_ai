import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import test from 'node:test';
import {publicContactSections} from '../../server/publicContactDetails.js';
import {extractStaffParkingSections} from '../../scripts/import-staff-parking-source.mjs';
import {publicContactDirectory,publicContactDirectoryPath,findPublicContacts,publicContactPhoneHref} from '../../server/publicContactDirectoryContract.js';
import {publicContactDirectoryContext,isPublicContactDirectoryQuestion} from '../../server/publicContactDirectoryEvidence.js';
import {boundedPublicPageEvidence,loadPublicPageContext} from '../../server/publicPageContext.js';
import {directSchoolPages} from '../../scripts/lib/direct-school-pages.mjs';

test('native contact directory exposes only source-backed contact fields',async()=>{
 assert.equal(publicContactDirectory.records.length,5);
 for(const row of publicContactDirectory.records){
  const bytes=await readFile('public'+row.source.captureFile);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),row.source.checksum);
  if(row.id==='registrar-teaching-feedback'){
   const $=load(bytes.toString()),[clause,attribution,phoneLine]=row.source.text.split('\n');
   const paragraph=$('article#post-1602 p').toArray().map(node=>$(node).text().replace(/\s+/gu,' ').trim()).find(text=>text.includes('提出課程教學上的問題')&&text.includes(attribution))!;
   assert.ok(paragraph.includes(clause));
   assert.equal(attribution,'教務處註冊課務組啟');
   assert.ok(publicContactSections(bytes.toString()).some(block=>block.text.split('\n').includes(phoneLine)));
   assert.match(row.name,/課程教學意見反應/u);
  }else if(row.id==='general-affairs')assert.equal(extractStaffParkingSections(bytes.toString()).contact.text,row.source.text);
  else assert.ok(publicContactSections(bytes.toString()).some(block=>block.text.includes(row.source.text)));
  assert.ok(row.source.text.includes(row.phone));
  if(row.email)assert.ok(row.source.text.includes(row.email));
  if(row.address)assert.ok(row.source.text.includes(row.address));
  assert.ok(row.extensions.every(extension=>row.source.text.includes(extension)));
 }
 assert.deepEqual(publicContactDirectory.records.find(row=>row.id==='academic-affairs')?.extensions,[],'No extension is invented from an unread extension-list link.');
 assert.deepEqual(findPublicContacts('2242').map(row=>row.id),['general-affairs']);
 assert.deepEqual(findPublicContacts('2007').map(row=>row.id),['registrar-teaching-feedback']);
 const scoped=publicContactDirectory.records.find(row=>row.id==='registrar-teaching-feedback')!;
 assert.deepEqual(scoped.extensions,['2007','2009','2010','2012','2014','2016']);
 assert.equal(scoped.extensions.includes('2008'),false,'The different midterm-enquiry list is not merged into this course-feedback row.');
 assert.deepEqual(findPublicContacts('COURSE@STU.EDU.TW').map(row=>row.id),['academic-affairs','registrar-teaching-feedback']);
 assert.equal(findPublicContacts('unknown office').length,0);
 assert.equal(publicContactPhoneHref('(+886) 7-615-8000'),'tel:+88676158000');
});
test('public contact context is bounded and preserves incomplete-directory meaning',()=>{
 const context=publicContactDirectoryContext('How do I contact the school office or my department?')!;
 const evidence=boundedPublicPageEvidence(context,{budget:16000}),metadata=JSON.parse(evidence.content);
 assert.equal(context.page.route,publicContactDirectoryPath);
 assert.equal(metadata.contacts.length,5);
 assert.match(metadata.coverage,/not a complete/u);
 assert.equal(metadata.contacts.find((row:any)=>row.id==='academic-affairs').extensionsStatus,'not_recorded_in_selected_source');
 for(const question of ['What is my email address?','Give me another student email list'])assert.equal(isPublicContactDirectoryQuestion(question),false);
});
test('the extension directory no longer serves the imported not-found HTML',async()=>{
 const routes=directSchoolPages(process.cwd());
 assert.equal(routes.has(publicContactDirectoryPath),false);
 assert.equal(routes.has('/'),true);
 const config=JSON.parse(await readFile('vercel.json','utf8'));
 assert.equal(config.rewrites.some((row:any)=>decodeURI(row.source).replace(/\/$/u,'')==='/分機表'),false);
 assert.equal(config.rewrites.at(-1).destination,'/app-shell.html');
});

test('assistant current-page reads see the native directory instead of the obsolete capture',async()=>{
 const context=await loadPublicPageContext(publicContactDirectoryPath,Date.now()+1000,{fetchCapture:async()=>{throw Error('Native contact rows do not read the obsolete not-found capture.');}});
 assert.equal(context?.contentAvailable,true);assert.equal(context?.page.title,publicContactDirectory.title);
 assert.ok(JSON.parse(context!.evidence.content).contacts.some((row:any)=>row.email==='course@stu.edu.tw'));
});

test('contact answer uses the native catalog without a duplicate page-fetch round',async()=>{
 const {createResearchAssistantHandler}=await import('../../api/research-assistant.ts');
 const nativeFetch=globalThis.fetch,names=['OPENAI_API_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'] as const;
 const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 process.env.OPENAI_API_KEY='unit-test';process.env.VITE_SUPABASE_URL='https://contact-unit.supabase.co';process.env.VITE_SUPABASE_PUBLISHABLE_KEY='unit-test';
 let pageReads=0;
 globalThis.fetch=async(url,options)=>{
  assert.equal(String(url),'https://api.openai.com/v1/responses');
  const request=JSON.parse(String(options?.body)),input=JSON.parse(request.input[0].content[0].text),source=input.evidence[0],data=JSON.parse(source.content);
  assert.equal(input.evidence.length,1);assert.equal(data.contacts.length,5);
  const result=request.text.format.name==='compose_grounded_answer'
   ?{status:'answered',answer:`[聯絡資訊與分機查詢](${source.url})：${data.contacts[0].phone}`,sourceIds:[source.id]}
   :{supported:true,answersQuestion:true,parts:input.answerParts.map((part:any)=>({id:part.id,kind:'factual',accepted:true,claims:[{claim:part.text,supported:true,evidenceId:source.id,quotes:[],jsonPaths:part.text.startsWith('Source snapshot:')?['/capturedOn']:['/localUrl','/contacts/0/phone']}]}))};
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
 };
 try{
  const handler=createResearchAssistantHandler({loadPublicPage:async()=>{pageReads++;throw Error('Already compiled source');}});
  let body:any;const response:any={status(code:number){assert.equal(code,200);return response;},json(value:any){body=value;},setHeader(){}};
  await handler({method:'POST',body:{question:'How do I contact the school office or my department?',route:'/'},headers:{'x-forwarded-for':'contact-catalog-unit'}},response);
  assert.equal(body.verification.status,'verified');assert.match(body.answer,/615-8000/u);assert.equal(pageReads,0);
 }finally{globalThis.fetch=nativeFetch;for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}}
});
