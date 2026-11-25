import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import data from '../../server/data/academicContacts.json' with {type:'json'};
import {publicContactSections} from '../../server/publicContactDetails.js';
import {publicAcademicContactContext} from '../../server/publicAcademicContacts.js';
import {publicAcademicRulesContext} from '../../server/publicAcademicRulesEvidence.js';

test('compact academic contacts come from the actual pinned footer without inventing extensions or a form',async()=>{
 const bytes=await readFile('public'+data.captureFile);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),data.captureChecksum);
 const block=publicContactSections(bytes.toString()).find(row=>row.locator===data.locator)!;
 assert.ok(block.text.includes(data.text));
 assert.ok(data.text.includes(data.contacts.email));
 assert.ok(data.text.includes(data.contacts.phone));
 assert.ok(data.text.includes(data.contacts.address));
 assert.match(data.text,/行政大樓1樓/u);
 assert.equal(Object.hasOwn(data.contacts,'extension'),false);
 const context=publicAcademicContactContext(['semester_suspension','withdrawal_from_study','approve_my_withdrawal'])!;
 const metadata=JSON.parse(context.evidence.content);
 assert.deepEqual(metadata.inquiryNavigation.roles,['semester_suspension','withdrawal_from_study']);
 assert.equal(metadata.inquiryNavigation.kind,'public_contact_inquiry');
 assert.ok(Buffer.byteLength(context.evidence.content)<3000);
 assert.equal(context.evidence.url,data.url);
 assert.doesNotMatch(context.evidence.content,/\/services\/6-4/u);
});

test('academic policy supplements formal-status inquiries with public contact evidence, not a native application claim',()=>{
 const context=publicAcademicRulesContext('Can I graduate without attending classes?')!;
 const contact=context.additionalEvidence.find(source=>source.id.startsWith('public-page:'))!;
 assert.ok(contact);
 assert.match(JSON.parse(contact.content).scope,/no extension number/u);
 const urls=context.additionalEvidence.find(source=>source.id==='published-guidance')!.urls!;
 for(const url of ['/school-affairs/services/13-1/graduation','/school-affairs/services/15-1','/school-affairs/services/7-2','/school-affairs/services/leave','/school-affairs/services/12-5'])assert.ok(urls.includes(url));
});
