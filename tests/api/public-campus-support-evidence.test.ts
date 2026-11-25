import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {loadPublicPageContext} from '../../server/publicPageContext.js';
import {campusSupportRoute,campusEmergencyRoute,focusCampusSupportContext,loadCampusSupportEvidence,publicCampusSupportIntent} from '../../server/publicCampusSupportEvidence.js';

const load=(route:string,deadline:number,options={})=>loadPublicPageContext(route,deadline,{...options,
 fetchCapture:async(input:Parameters<typeof fetch>[0])=>new Response(await readFile('public'+new URL(String(input)).pathname)),
});
test('campus support intent separates public guidance from private records',()=>{
 assert.equal(publicCampusSupportIntent('Is there a lost and found, and where is it?'),'lost-property');
 assert.equal(publicCampusSupportIntent('Where is Lost and Found?'),'lost-property');
 assert.equal(publicCampusSupportIntent("Is the school's location safe for students?"),'safety');
 assert.equal(publicCampusSupportIntent('Where can I see my grades?'),null);
 assert.equal(publicCampusSupportIntent('Is my bank balance safe?'),null);
});
test('campus support preserves literal safety topics and contact but makes no outcome or absence claim',async()=>{
 const context=(await load(campusSupportRoute,Date.now()+5000))!;
 const original=JSON.parse(context.evidence.content),focused=focusCampusSupportContext(context);
 const metadata=JSON.parse(focused.evidence.content);
 assert.match(metadata.excerpt,/07-6158000/u);
 assert.equal(metadata.publishedContact.phone,'07-6158000');
 assert.ok(original.excerpt.includes(metadata.publishedContact.sourceLine));
 assert.match(metadata.excerpt,/校園安全/u);
 assert.equal(metadata.excerptTruncated,true);
 for(const line of metadata.excerpt.split('\n'))assert.ok(original.excerpt.includes(line));
 assert.doesNotMatch(metadata.excerpt,/https?:\/\//u);
 assert.doesNotMatch(metadata.excerpt,/民眾通報假投資網站/u);
 const sources=await loadCampusSupportEvidence(load,Date.now()+5000);
 assert.equal(sources.length,2);
 assert.ok(sources.some(source=>/學生事務處/u.test(source.content)));
 assert.ok(sources.every(source=>!decodeURI(source.url||'').includes('/分機表/')));
 const tampered=await loadPublicPageContext(campusSupportRoute,Date.now()+1000,{fetchCapture:async()=>new Response('<main>Guaranteed safe campus with a recovered wallet.</main>')});
 assert.equal(focusCampusSupportContext(tampered!).contentAvailable,false);
});

test('safety additionally reads the existing emergency page without inheriting OICA office contacts',async()=>{
 const sources=await loadCampusSupportEvidence(load,Date.now()+5000,'safety');
 const emergency=sources.find(source=>source.url===campusEmergencyRoute)!;
 const metadata=JSON.parse(emergency.content);
 assert.equal(metadata.publishedEmergencyContact.phone,'07-6158024');
 assert.match(metadata.excerpt,/Emergency Call 07-6158024/u);
 assert.deepEqual(metadata.contactSections,[]);
 assert.doesNotMatch(metadata.excerpt,/oica@stu.edu.tw|A0428/u);
 const ordinary=await loadCampusSupportEvidence(load,Date.now()+5000,'lost-property');
 assert.equal(ordinary.some(source=>source.url===campusEmergencyRoute),false);
});

test('lost-property inquiry focuses the captured Student Affairs listing without inventing a desk or switchboard designation',async()=>{
 const sources=await loadCampusSupportEvidence(load,Date.now()+5000,'lost-property');
 const directory=sources.find(source=>decodeURI(source.url||'').includes('行政單位'))!;
 const metadata=JSON.parse(directory.content);
 assert.equal(metadata.inquiryChannel.officeLabel,'學生事務處');
 assert.equal(metadata.inquiryChannel.englishLabel,'Student Affairs');
 assert.ok(metadata.inquiryChannel.sourceText.includes('學生事務處'));
 assert.deepEqual(metadata.directoryEntries,[{label:'學生事務處',destinationAvailable:false}]);
 assert.match(metadata.inquiryChannel.scope,/does not identify it as a confirmed lost-property desk/u);
 const support=JSON.parse(sources.find(source=>source.url===campusSupportRoute)!.content);
 assert.equal(support.publishedContact.phone,'07-6158000');
 assert.match(support.publishedContact.usage,/does not identify/u);
 assert.equal(support.publishedContact.designation,undefined);
});
