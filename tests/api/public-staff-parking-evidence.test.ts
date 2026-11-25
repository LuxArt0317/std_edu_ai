import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import test from 'node:test';
import source from '../../server/data/staffParkingSource.json' with {type:'json'};
import {extractStaffParkingSections} from '../../scripts/import-staff-parking-source.mjs';
import {isPublicStaffParkingQuestion,publicStaffParkingContext} from '../../server/publicStaffParkingEvidence.js';

test('staff parking source matches the actual capture and keeps teacher rules separate from student prices',async()=>{
 const bytes=await readFile('public'+source.captureFile);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),source.checksum);
 assert.deepEqual(extractStaffParkingSections(bytes.toString('utf8')),source.sections);
 const context=publicStaffParkingContext('Is there teacher parking, where, what are the rules, and how do I apply?')!;
 const metadata=JSON.parse(context.evidence.content);
 assert.match(metadata.sections.staffCar.text,/每學年上網申請/u);
 assert.match(metadata.sections.staffCar.text,/無證號教職員/u);
 assert.match(metadata.sections.staffCar.text,/單位主管蓋章/u);
 assert.match(metadata.sections.staffMotorcycle.text,/115學年度改回教職員證/u);
 assert.deepEqual(metadata.sections.contact.extensions,['2242','2239']);
 assert.doesNotMatch(metadata.excerpt,/3000元|1500元|電腦公開抽籤|駐校/u);
 assert.equal(context.evidence.urls?.includes('/school-affairs/services/46-1'),true);
 assert.equal(metadata.sections.general,undefined);
 assert.ok(JSON.parse(publicStaffParkingContext('When do staff apply for parking permits?')!.evidence.content).sections.general);
});
test('staff parking guidance does not answer private permit or student-price questions',()=>{
 assert.equal(isPublicStaffParkingQuestion('How do teachers apply for a parking permit?'),true);
 for(const question of ['Is my staff parking application approved?','How much is student parking?','Apply for a teacher parking permit for me.'])assert.equal(publicStaffParkingContext(question),null);
 assert.throws(()=>extractStaffParkingSections('<div class="entry-content"><div class="elementor-widget-text-editor">Student prices only</div></div>'),/boundary missing/u);
});
