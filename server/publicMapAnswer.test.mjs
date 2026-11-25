import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {createHash} from 'node:crypto';
import {publicMapAnswer} from './publicMapAnswer.js';import {publicPageForRoute} from './publicPageContext.js';
test('map directory resolves the known local destination without promising a route',()=>{
 const result=publicMapAnswer('Where can I find the campus map?');assert.ok(result);assert.match(result.answer,/\/school-sites\/www.oica.stu.edu.tw\/en\/school-map\//);assert.match(result.answer,/static campus map/);
 for(const question of ['Where is my classroom on the campus map?','Where can I find an accessible campus map?','Where is the curriculum map?'])assert.equal(publicMapAnswer(question),null);
});
test('map page references a real publisher PNG and its capture checksum still matches',async()=>{
 const page=publicPageForRoute('/school-sites/www.oica.stu.edu.tw/en/school-map/');const html=await fs.readFile('public'+page.file);
 assert.equal(createHash('sha256').update(html).digest('hex'),page.checksum);
 const tag=html.toString().match(/<img\b(?=[^>]*\bwp-image-2025\b)[^>]*>/u)?.[0];const url=tag?.match(/src="([^"]+)"/u)?.[1];assert.match(url,/^\/school-assets\/[a-f0-9]{20}\.png$/u);
 const image=await fs.readFile('public'+url);assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(image.readUInt32BE(16),768);assert.equal(image.readUInt32BE(20),840);
});
