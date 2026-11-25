import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {feeRemissionPath} from '../../server/feeRemissionContract.js';
import {learningSupportPath} from '../../src/features/public/affairs/studentServices.js';
import {studentAidPath} from '../../src/features/public/affairs/studentAidLinks.js';
import {boundedPublicPageEvidence} from '../../server/publicPageContext.js';
import {publicFundingContext,publicFundingIntent} from '../../server/publicFundingEvidence.js';
import data from '../../server/data/publicFundingSources.json' with {type:'json'};
import pages from '../../src/features/public/mirror/pages.json' with {type:'json'};
import assets from '../../src/features/public/mirror/assets.json' with {type:'json'};

test('public funding discovery excludes personal decisions and separate IPIAC policies',()=>{
 assert.equal(publicFundingIntent('What tuition discounts are available?'),'remission');
 assert.equal(publicFundingIntent('What scholarship programs does the school offer?'),'scholarships');
 for(const q of ['What is my scholarship application status?','What amount was my scholarship approved for?','Explain the IPIAC scholarship regulations','What language level do I need for a scholarship?'])assert.equal(publicFundingContext(q),null);
});
test('funding context preserves source roles, historical limits and distinct scholarship eligibility',async()=>{
 for(const document of data.documents){
  const registered=[...pages,...assets].find(row=>row.checksum===document.checksum);assert.ok(registered);
  assert.equal(createHash('sha256').update(await readFile('public'+registered.file)).digest('hex'),document.checksum);
 }
 const remission=publicFundingContext('What tuition discounts are available?')!;
 assert.ok(boundedPublicPageEvidence(remission,{budget:16000}).content);
 const body=JSON.parse(remission.evidence.content);
 assert.ok(body.sources.some((row:any)=>row.role==='disadvantaged-aid'));
 const native=JSON.parse(remission.additionalEvidence[0].content);
 assert.deepEqual(native.pages.map((page:any)=>page.url),[feeRemissionPath,studentAidPath]);
 assert.match(native.scope,/No account rows were read/u);
 assert.equal(remission.additionalEvidence[0].id,'published-guidance');
 assert.equal(body.accountNavigation,undefined);
 assert.equal(remission.evidence.urls?.includes(feeRemissionPath),false);
 assert.equal(remission.evidence.urls?.includes(studentAidPath),false);
 assert.deepEqual(body.sources.map((row:any)=>row.role),['moe-remission','tuition-gap-index','disadvantaged-aid']);
 assert.doesNotMatch(body.excerpt,/6,000|10月20/u);
 assert.match(body.sources.find((row:any)=>row.role==='disadvantaged-aid').coverage,/heading selected/u);
 const detailed=JSON.parse(publicFundingContext('What tuition discount amounts and eligibility conditions are available?')!.evidence.content);
 const gap=detailed.sources.find((row:any)=>row.role==='tuition-gap-rules');assert.match(gap.coverage,/114-2/u);assert.match(detailed.excerpt,/17,500/u);
 assert.match(detailed.excerpt,/pdf:page:3/u);
 const scholarship=JSON.parse(publicFundingContext('What scholarship programs does the school offer?')!.evidence.content);
 assert.match(scholarship.excerpt,/各項專班不適用/u);
 assert.match(scholarship.excerpt,/教育部臺灣獎學金/u);
 assert.doesNotMatch(scholarship.excerpt,/50%|6,000/u);
 const scholarshipDetails=JSON.parse(publicFundingContext('What scholarship programs are available and what amounts are offered?')!.evidence.content);
 assert.match(scholarshipDetails.excerpt,/50%/u);
 assert.match(scholarshipDetails.excerpt,/各項專班不適用/u);
 const scholarshipNative=JSON.parse(publicFundingContext('What scholarship programs does the school offer?')!.additionalEvidence[0].content);
 assert.ok(scholarshipNative.pages.some((page:any)=>page.url===learningSupportPath));
 for(const destination of [...remission.evidence.urls||[]])assert.ok(pages.some(page=>page.route===destination)||assets.some(asset=>asset.file===destination)||body.sources.some((source:any)=>source.source===destination));
 assert.doesNotMatch(remission.evidence.content,/Username|預設為個人身分證|流程 ２/u);
});


test('funding allows only exact captured original-source aliases alongside local destinations',()=>{
 for(const question of ['What scholarships are available?','What tuition discounts are available?']){
  const context=publicFundingContext(question)!;
  const metadata=JSON.parse(context.evidence.content);
  for(const document of metadata.sources){
   const captured=data.documents.find(row=>row.role===document.role)!;
   assert.equal(document.source,captured.source);
   assert.ok(context.evidence.urls!.includes(captured.source));
   assert.ok(context.evidence.urls!.includes(captured.url));
   assert.equal(context.evidence.urls!.includes(captured.source+'?unverified=1'),false);
  }
  for(const url of context.evidence.urls!.filter(url=>url.startsWith('https://')))assert.ok(metadata.sources.some((document:any)=>document.source===url));
 }
});
