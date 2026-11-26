import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {loadPublicPageContext} from '../../server/publicPageContext.js';
import {compactClubDirectoryContext,isPublicClubQuestion} from '../../server/publicClubIntent.js';
import {answerLinksSupported} from '../../server/answerVerificationModel.js';

const route='/school-sites/activity.sao.stu.edu.tw/%E6%B4%BB%E5%8A%9B%E7%A4%BE%E5%9C%98%E4%BB%8B%E7%B4%B9/';
const load=()=>loadPublicPageContext(route,Date.now()+5000,{fetchCapture:async input=>
 new Response(await readFile('public'+new URL(String(input)).pathname))});

test('verified club source retains exact named Instagram contacts through compaction and link verification',async()=>{
 const context=(await load())!;assert.equal(context.contentAvailable,true);
 const focused=compactClubDirectoryContext(context),data=JSON.parse(focused.evidence.content);
 const published=[
  {label:'熱門音樂社',url:'https://www.instagram.com/stu_rock_club/'},
  {label:'吉他公社',url:'https://www.instagram.com/stu.ga/'},
  {label:'電子音樂研究社',url:'https://www.instagram.com/stu_emc/?hl=zh-tw'},
 ];
 for(const contact of published){
  assert.ok(JSON.parse(context.evidence.content).excerpt.includes(contact.label+' ('+contact.url+')'));
  assert.ok(data.clubContacts.some((row:any)=>row.label===contact.label&&row.url===contact.url));
  assert.ok(focused.evidence.urls?.includes(contact.url));
  assert.equal(answerLinksSupported('['+contact.label+']('+contact.url+')',[focused.evidence]),true);
 }
 assert.match(data.clubContactScope,/not a verified meeting location/u);
 assert.match(data.clubContactScope,/clarify an ambiguous club request/u);
 const again=compactClubDirectoryContext(focused);
 assert.deepEqual(JSON.parse(again.evidence.content).clubContacts,data.clubContacts);
 assert.deepEqual(again.evidence.urls,focused.evidence.urls);
 assert.ok(data.clubContacts.length<=64);
 assert.ok(new TextEncoder().encode(JSON.stringify(data.clubContacts)).length<=8000);
});

test('unsafe, unrelated and generic-button URLs cannot become named club contacts',async()=>{
 const context=(await load())!,data=JSON.parse(context.evidence.content);
 const unsafe=[
  '熱門音樂社 (https://www.instagram.com.evil.test/stu_rock_club/)',
  '熱門音樂社 (https://www.instagram.com@evil.test/stu_rock_club/)',
  '熱門音樂社 (https://www.instagram.com:444/stu_rock_club/)',
  '熱門音樂社 (http://www.instagram.com/stu_rock_club/)',
  '熱門音樂社 (https://www.instagram.com/accounts/)',
  '熱門音樂社 (https://www.instagram.com/../)',
  '熱門音樂社 (https://www.instagram.com/stu..club/)',
  '熱門音樂社 (https://www.instagram.com/stu_rock_club/?next=https%3A%2F%2Fevil.test)',
  '熱門音樂社 (https://www.instagram.com/stu_rock_club/?hl=%0A)',
  '熱門音樂社 (https://www.facebook.com/stu_rock_club/)',
  '探索社團 (https://www.instagram.com/stu_rock_club/)',
  'Unrelated office (https://www.instagram.com/some_profile/)',
 ];
 const focused=compactClubDirectoryContext({...context,evidence:{...context.evidence,
  content:JSON.stringify({...data,excerpt:unsafe.join('\n')})}});
 assert.deepEqual(JSON.parse(focused.evidence.content).clubContacts,[]);
 assert.deepEqual(focused.evidence.urls,context.evidence.urls);
});

test('unavailable or unverified contexts cannot promote contacts and named contacts are bounded',async()=>{
 const context=(await load())!,data=JSON.parse(context.evidence.content);
 const line='熱門音樂社 (https://www.instagram.com/stu_rock_club/)';
 for(const source of [
  {...context,contentAvailable:false},
  {...context,evidence:{...context.evidence,content:JSON.stringify({...data,contentStatus:'metadata_only',excerpt:line})}},
  {...context,page:{...context.page,route:'/another-page'}},
 ]){
  const focused=compactClubDirectoryContext(source);
  assert.deepEqual(focused.evidence.urls,context.evidence.urls);
 }
 const excerpt=Array.from({length:90},(_,index)=>'測試社'+index+' (https://www.instagram.com/source_club_'+index+'/)' ).join('\n');
 const focused=compactClubDirectoryContext({...context,evidence:{...context.evidence,content:JSON.stringify({...data,excerpt})}});
 const result=JSON.parse(focused.evidence.content);
 assert.ok(result.clubContacts.length<=64);assert.equal(result.clubContactsExcerpted,true);
 assert.equal(focused.evidence.urls?.length,(context.evidence.urls?.length??0)+result.clubContacts.length);
 assert.ok(new TextEncoder().encode(JSON.stringify(result.clubContacts)).length<=8000);
 assert.equal(isPublicClubQuestion('Where is the music club, and how do I contact them?'),true);
 assert.equal(isPublicClubQuestion('Which clubs have I joined?'),false);
});
