import assert from 'node:assert/strict';
import test from 'node:test';
import document from '../../server/data/ipiac115.json' with {type:'json'};
import {publicProspectusContext} from '../../server/publicProspectusEvidence.js';
import {boundedPublicPageEvidence} from '../../server/publicPageContext.js';

test('scholarship application evidence retains signed form, policy and complete tiers without admission-checklist prefix',()=>{
 const context=publicProspectusContext('What are the requirements for applying for the IPIAC scholarship?')!;
 const metadata=JSON.parse(context.evidence.content);
 assert.deepEqual(metadata.selectedPages,['pdf:page:1','pdf:page:27','pdf:page:12','pdf:page:29','pdf:page:31']);
 assert.match(metadata.excerpt,/Applicant Signature/u);
 assert.match(metadata.excerpt,/submits along with/u);
 assert.doesNotMatch(metadata.excerpt,/English proficiency B1/u);
 const bounded=boundedPublicPageEvidence(context,{budget:16000});
 for(const text of ['Applicant Signature','top 20%','top 50%','20,000','10,000','3,000','TOCFL'])assert.ok(bounded.content.includes(text),text);
 assert.equal(metadata.sectionRoles['pdf:page:27'],'Annex IV application form, signature and application notes');
 const nav=JSON.parse(context.additionalEvidence![0].content);
 assert.equal(nav.services.length,1);assert.equal(nav.services[0].url,'/school-affairs/services/9-1');assert.equal(nav.services[0].requiresSignIn,true);
 assert.match(nav.scope,/no caller records were read/u);
 for(const locator of metadata.selectedPages)assert.ok(document.pages.some(page=>page.locator===locator));
});
test('financial arithmetic and language source paths remain separate from application-form selection',()=>{
 const arithmetic=publicProspectusContext('How do I calculate IPIAC tuition after scholarship deduction?')!;
 assert.ok(JSON.parse(arithmetic.evidence.content).financialArithmetic);
 assert.equal(JSON.parse(arithmetic.evidence.content).sectionRoles,undefined);
 const language=publicProspectusContext('What are the IPIAC English language proficiency requirements?')!;
 assert.equal(JSON.parse(language.evidence.content).sectionRoles,undefined);
});
