import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {load} from 'cheerio';
import {publicCommunicationContext,isPublicCommunicationQuestion} from '../../server/publicCommunicationEvidence.js';
import source from '../../server/data/publicCommunicationSource.json' with {type:'json'};
import {boundedPublicPageEvidence} from '../../server/publicPageContext.js';
import {publicContactDirectoryPath} from '../../server/publicContactDirectoryContract.js';
import {announcementEmailPath} from '../../server/announcementEmailContract.js';

test('communication discovery does not take over private inbox reads or send requests',()=>{
 assert.equal(isPublicCommunicationQuestion('Can the website provide a way to communicate with students?'),true);
 assert.equal(isPublicCommunicationQuestion('網站有什麼方式可以與學生溝通？'),true);
 assert.equal(isPublicCommunicationQuestion('How can our website provide messages to students?'),true);
 for(const question of ['Show my unread messages from students','Please send an email to all students','Can you publish an announcement to students?','幫我發送訊息給同學','What is my tuition balance?'])assert.equal(publicCommunicationContext(question),null);
});
test('homepage links establish only external navigation and native permissions remain separate',async()=>{
 const bytes=await readFile('public'+source.home.captureFile);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),source.home.checksum);
 const $=load(bytes.toString('utf8'));
 for(const link of source.links){assert.ok($('a[href]').toArray().some(element=>$(element).attr('href')===link.url&&$(element).text().trim()===link.label));assert.equal(link.destinationBodyRead,false);assert.equal(link.localRoute,null);}
 const context=publicCommunicationContext('Can the website provide a way to communicate with students?')!;
 assert.ok(boundedPublicPageEvidence(context,{budget:6000}).content);
 const publicSource=JSON.parse(context.evidence.content),native=JSON.parse(context.additionalEvidence[0].content);
 assert.equal(publicSource.links.length,2);
 assert.match(publicSource.coverage,/No linked Google Sites body/u);
 assert.equal(publicSource.navigation,undefined);
 assert.ok(context.evidence.urls?.includes('https://sites.google.com/stu.edu.tw/stu-contacts/'));
 assert.equal(context.evidence.urls?.includes('/school-affairs/notifications'),false);
 assert.equal(context.additionalEvidence[0].id,'published-guidance');
 assert.equal(native.navigation[0].url,publicContactDirectoryPath);
 assert.match(native.navigation[0].contents,/school-office contacts/u);
 assert.match(native.navigation[0].contents,/not a student recipient list/u);
 assert.ok(context.additionalEvidence[0].urls?.includes(publicContactDirectoryPath));
 assert.equal(context.evidence.urls?.includes(publicContactDirectoryPath),false);
 assert.match(native.navigation.find((row:any)=>row.url==='/school-affairs/notifications').contents,/caller-owned.*service-request titles/u);
 assert.ok(native.navigation.some((row:any)=>row.url===announcementEmailPath));
 assert.ok(native.announcementProposal.requirements.some((condition:string)=>condition.includes('content-management')));
 assert.ok(native.announcementProposal.requirements.some((condition:string)=>condition.includes('confirmation')));
 for(const key of ['accountDataRead','permissionCheckPerformed','messageSent','deliveryVerified'])assert.equal(native[key],false);
 assert.deepEqual(native.availableRecipientData,[]);
 assert.equal(native.siteWideFeatureCoverage.inventoryComplete,false);
 assert.equal(native.siteWideFeatureCoverage.studentToStudentMessaging,'not_established');
 assert.equal(native.siteWideFeatureCoverage.studentRecipientDirectory,'not_established');
 assert.match(native.scope,/not a complete website feature inventory/u);
 assert.equal(native.unavailableInThisPublicContext,undefined);
 assert.deepEqual(native.channelSelectionNeeds,['Intended recipient group or office','Purpose of the communication','One-to-one conversation versus site announcement']);
});
