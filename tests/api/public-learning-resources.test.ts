import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {loadPublicPageContext} from '../../server/publicPageContext.js';
import {focusLearningResourceContext,isPublicLearningResourceQuestion,publicLearningResourceRoute} from '../../server/publicLearningResources.js';

test('supplemental resources focus a verified existing library capture without inventing a subject',async()=>{
 const context=await loadPublicPageContext(publicLearningResourceRoute,Date.now()+5000,{fetchCapture:async input=>new Response(await readFile('public'+new URL(String(input)).pathname))});
 assert.equal(context?.contentAvailable,true);
 const focused=focusLearningResourceContext(context!);
 const metadata=JSON.parse(focused.evidence.content);
 assert.match(metadata.excerpt,/館藏查詢/u);
 assert.match(metadata.excerpt,/多媒體中心/u);
 assert.match(metadata.excerpt,/電子資源整合查詢系統/u);
 assert.doesNotMatch(metadata.excerpt,/科技管理|ISBN|Technology Management|https?:/iu);
 assert.equal(metadata.excerptTruncated,true);
 assert.equal(focused.evidence.id,context!.evidence.id);
 const tampered=await loadPublicPageContext(publicLearningResourceRoute,Date.now()+5000,{fetchCapture:async()=>new Response('<p>館藏查詢 Fake book</p>')});
 assert.equal(tampered?.contentAvailable,false);
 assert.equal(focusLearningResourceContext(tampered!),tampered);
});

test('public recommendations do not consume private viewed/material records or writes',()=>{
 assert.equal(isPublicLearningResourceQuestion('Can you recommend books or videos to supplement my learning?'),true);
 assert.equal(isPublicLearningResourceQuestion('推薦幾本書籍補充學習'),true);
 for(const q of ['Which videos have I watched?','Recommend my uploaded videos','Download extra books for me','Delete my saved reading materials'])assert.equal(isPublicLearningResourceQuestion(q),false,q);
});
