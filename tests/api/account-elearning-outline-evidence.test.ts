import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readElearningOutlineEvidence,elearningOutlineEvidenceMaxBytes} from '../../server/accountElearningOutlineEvidence.js';
import {selectElearningOutlineEvidence,isElearningOutlineEvidenceQuestion} from '../../server/elearningOutlineEvidenceIntent.js';

const userId='10000000-0000-4000-8000-000000000001';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'synthetic-public',token:'synthetic-caller',user:{id:userId}};
const route='/elearning/course/9408';
const activity=(id:number,title:string,purpose='video')=>({id,title,kind:purpose==='attendance'?'attendanceregister':'url',purpose});
const outline={userId,courseId:9408,sections:[
  {position:1,title:'Introduction',activities:[activity(11,'First video'),activity(12,'Lecture slides','slides'),activity(13,'Attendance register','attendance')]},
  {position:2,title:'Reflection',activities:[activity(14,'Feedback form','feedback')]},
]};
const payload=(result:Awaited<ReturnType<typeof readElearningOutlineEvidence>>)=>JSON.parse(result.evidence.content);
const run=(question:string,data:unknown=outline,options:Record<string,unknown>={})=>readElearningOutlineEvidence(account,{question,route,...options},{read:async()=>data});

test('outline selector accepts multi-purpose and multipart questions on the exact native course',()=>{
  for(const question of ['What videos are listed and where can I find the feedback form?','List videos and slides.', '本課程有哪些影片以及回饋單？']){
    const selected=selectElearningOutlineEvidence(question,route);
    assert.equal(selected?.courseId,9408);assert.equal(selected.reason,null);assert.equal(selected.purposes.length,2);
  }
  assert.equal(isElearningOutlineEvidenceQuestion('What videos are listed, and what are my remote-learning enrollments?',route),true);
  assert.equal(isElearningOutlineEvidenceQuestion('What is my tuition balance?',route),false);
  assert.equal(isElearningOutlineEvidenceQuestion('Show my DTM materials.',route),false);
});

test('links referring to selected videos are not third-party ownership, while possessive course subjects remain denied',async()=>{
  const result=await run('Which videos are linked in this remote-learning course? List all four with their local links.');
  assert.equal(result.readState,'ok');assert.deepEqual(payload(result).records[0].activities.map((row:{id:number})=>row.id),[11]);
  let reads=0;
  for(const question of ['Show their remote-learning videos.','Show her saved course outline.','Show videos for my colleague.',
    'Show her remote-learning feedback form.','Show their attendance form.','Show her feedback link.','Show his attendance link.',
    'Show their attendance register.','Show their section 2 activities.','Show her activity 11.','Show her e-learning feedback form.']){
    const denied=await readElearningOutlineEvidence(account,{question,route},{read:async()=>{reads++;return outline;}});
    assert.equal(denied.reason,'foreign_request',question);
  }
  assert.equal(reads,0);
});

test('latest exact course overrides route/history; bounded latest user follow-up is useful but never assistant evidence',()=>{
  const history=[{role:'user',content:'Show the remote-learning outline for course 9098.'}];
  const latest=selectElearningOutlineEvidence('Show the remote-learning videos for course 9408.','/elearning/course/9098',history);
  assert.equal(latest?.courseId,9408);assert.equal(latest.from,'question');
  const follow=selectElearningOutlineEvidence('What about slides?','/',history);
  assert.equal(follow?.courseId,9098);assert.equal(follow.from,'history');assert.deepEqual(follow.purposes,['slides']);
  assert.equal(selectElearningOutlineEvidence('What about slides?','/',[{role:'assistant',content:history[0].content}]),null);
  assert.equal(selectElearningOutlineEvidence('What about slides?','/',[...history,{role:'user',content:'What is my tuition balance?'}]),null);
  assert.equal(selectElearningOutlineEvidence('Show the remote-learning outline for course "Missing Studies".',route,history)?.reason,'choose_course');
  assert.equal(selectElearningOutlineEvidence('Show remote-learning course 9408 and course 9098 videos.',route)?.reason,'ambiguous_selector');
});

test('explicit own source and bounded section/activity selectors retain lineage',async()=>{
  let result=await run('Show section 2 activities.');
  assert.equal(result.readState,'ok');assert.deepEqual(payload(result).records.map((row:{sectionPosition:number})=>row.sectionPosition),[2]);
  assert.equal(payload(result).records[0].activities[0].courseId,9408);
  result=await run('Show activity 12.');
  assert.deepEqual(payload(result).records[0].activities.map((row:{id:number})=>row.id),[12]);
  result=await run('Show section "Reflection" activities.');
  assert.equal(payload(result).records[0].activities[0].id,14);
  result=await run('Show this activity.',outline,{route:route+'/activity/11'});
  assert.equal(payload(result).records[0].activities[0].id,11);
  result=await run('Show all course activities.',outline,{route:route+'/activity/11'});
  assert.equal(payload(result).counts.matchingActivities,4);
});

test('foreign, ambiguous and invalid selectors never call the native RPC',async()=>{
  let reads=0;
  for(const [question,path] of [
    ["Show Alice's remote-learning outline for course 9408.",route],
    ["Show my sister's videos.",route],
    ['Show the course outline for Alice.',route],
    ['Show another student’s course outline.',route],
    ['Show their remote-learning slides for course 9408.',route],
    ['Show section 65 activities.',route],
    ['Show activity 2147483648.',route],
    ['Show remote-learning videos for course 9408 and course 9098.',route],
    ['Show remote-learning videos.','https://evil.invalid/elearning/course/9408'],
    ['Show remote-learning videos.',route+'?user_id=another'],
    ['Show remote-learning videos.',route+'#user=another'],
  ]){
    const result=await readElearningOutlineEvidence(account,{question,route:path},{read:async()=>{reads++;return outline;}});
    assert.equal(result.readState,'unavailable',question);assert.equal(payload(result).counts,null);
  }
  assert.equal(reads,0);
});

test('negated purposes are excluded without swallowing independent requested outline clauses',()=>{
  assert.equal(selectElearningOutlineEvidence('Do not show videos and slides.',route),null);
  assert.equal(selectElearningOutlineEvidence('Don’t show videos and slides.',route),null);
  assert.deepEqual(selectElearningOutlineEvidence('Don’t show videos. Show slides.',route)?.purposes,['slides']);
  assert.deepEqual(selectElearningOutlineEvidence('Show videos. Do not show slides.',route)?.purposes,['video']);
  assert.deepEqual(selectElearningOutlineEvidence('Do not show videos. Show slides.',route)?.purposes,['slides']);
  for(const question of ['Show videos, not slides.','Show videos without slides.','Show videos but not slides.',
    'Show videos excluding slides.','顯示影片，不含簡報。','顯示影片，排除簡報。'])assert.deepEqual(selectElearningOutlineEvidence(question,route)?.purposes,['video'],question);
  assert.deepEqual(selectElearningOutlineEvidence('Show videos, not slides, but show the feedback form.',route)?.purposes,['video','feedback']);
  assert.deepEqual(selectElearningOutlineEvidence('Show activity "Video, not slides".',route)?.activityTitle,'Video, not slides');
});

test('explicit malformed or empty selectors cannot fall back to incidental course or all activities',async()=>{
  let reads=0;
  for(const question of ['Show remote-learning videos for course ID ABC.','Show activity ID ABC.','Show activity "".',
    'Show activity "   ".','Show section "" activities.','Show activity "Unclosed title.',
    'Show remote-learning videos for course ID 9408.5.','Show activity -1.','Show activity 11x.',
    'Show remote-learning videos for course #.','顯示活動編號 ABC。']){
    const result=await readElearningOutlineEvidence(account,{question,route},{read:async()=>{reads++;return outline;}});
    assert.equal(result.readState,'unavailable',question);assert.equal(result.reason,'invalid_selector',question);
  }
  assert.equal(reads,0);
  assert.equal((await run('Show activity ID 11.')).readState,'ok');
  assert.equal((await run('Show videos for course ID 9408.')).readState,'ok');
});

test('malformed options and nonprimitive identities never call the native read or coerce identity',async()=>{
  let reads=0,coercions=0;
  const deps={read:async()=>{reads++;return outline;}};
  for(const invalid of [null,[],42]){
    // @ts-expect-error Deliberately malformed runtime boundary input.
    const result=await readElearningOutlineEvidence(account,invalid,deps);
    assert.equal(result.reason,'invalid_options');
  }
  const badId={toString:()=>{coercions++;return userId;}};
  // @ts-expect-error Deliberately nonprimitive runtime account identity.
  const result=await readElearningOutlineEvidence({...account,user:{id:badId}},{question:'Show videos.',route},deps);
  assert.equal(result.reason,'unauthorized');assert.equal(reads,0);assert.equal(coercions,0);
});

test('raw normalized, encoded or protocol-relative paths never silently select another course',async()=>{
  let reads=0;
  for(const path of ['/elearning/course/1/../2','/elearning/course/1/%2e%2e/2','/elearning/course/./9408',
    'https://stu.best/elearning/course/1/../9408','//stu.best/elearning/course/9408']){
    const result=await readElearningOutlineEvidence(account,{question:'Show remote-learning videos.',route:path},{read:async()=>{reads++;return outline;}});
    assert.equal(result.reason,'invalid_route',path);
  }
  assert.equal(reads,0);
});

test('native fixed query and credentials are synchronously captured; no arbitrary account metadata is forwarded',async()=>{
  const mutable={...account,user:{id:userId},admin:'forbidden',email:'do-not-forward'};
  const resultPromise=readElearningOutlineEvidence(mutable,{question:'Show videos.',route},{read:async(selected,query)=>{
    assert.deepEqual(query,{scope:'elearning-course-outline',course:'9408'});
    assert.deepEqual(Object.keys(selected).sort(),['key','requestDeadline','token','url','user']);
    assert.deepEqual(selected.user,{id:userId});assert.equal(selected.token,'synthetic-caller');assert.equal(selected.url,account.url);
    assert.ok(Object.isFrozen(selected));assert.ok(Object.isFrozen(selected.user));
    assert.ok(selected.requestDeadline!<=Date.now()+8000);
    return outline;
  }});
  mutable.user.id='foreign';mutable.url='https://evil.invalid';mutable.token='changed';
  const result=await resultPromise;
  assert.equal(result.readState,'ok');assert.doesNotMatch(result.evidence.content,/synthetic-caller|do-not-forward|forbidden/);
});

test('only requested activity purposes are projected, with exact local URLs and explicit unavailable content capabilities',async()=>{
  const result=await run('Show videos and the feedback form link.');
  assert.equal(result.readState,'ok');const body=payload(result);
  assert.deepEqual(body.records.flatMap((section:{activities:Array<{id:number}>})=>section.activities.map(row=>row.id)),[11,14]);
  assert.deepEqual(result.evidence.urls,[route,route+'/activity/11',route+'/activity/14']);
  assert.doesNotMatch(result.evidence.content,/Lecture slides|Attendance register|userId|synthetic-caller/);
  assert.equal(body.capability.content,false);assert.equal(body.capability.personalAttendance,false);
  assert.equal(body.provenance.officialUniversityData,false);assert.equal(body.counts.availableActivities,4);
});

test('native zero-section response is unknown access/content, while successful scoped no-match is empty',async()=>{
  const unknown=await run('Show videos.',{...outline,sections:[]});
  assert.equal(unknown.readState,'unavailable');assert.equal(unknown.reason,'outline_access_or_content_unknown');assert.equal(payload(unknown).counts,null);
  const empty=await run('Show activity 99.');assert.equal(empty.readState,'empty');assert.equal(payload(empty).counts.matchingActivities,0);
  assert.equal(payload(empty).counts.availableActivities,4);assert.equal(payload(empty).complete,true);
  const denied=await readElearningOutlineEvidence(account,{question:'Show videos.',route},{read:async()=>{throw Object.assign(new Error('sensitive denial'),{status:403});}});
  assert.equal(denied.reason,'access_denied');assert.equal(payload(denied).counts,null);assert.doesNotMatch(denied.evidence.content,/sensitive denial/);
});

test('missing legacy purpose metadata is unknown rather than an empty purpose filter',async()=>{
  const data={userId,courseId:9408,sections:[{position:1,title:'Legacy section',activities:[{id:11,title:'Legacy item',kind:'url'}]}]};
  const result=await run('Show videos.',data);
  assert.equal(result.readState,'partial');assert.equal(result.reason,'purpose_metadata_missing');assert.equal(payload(result).counts.unknownPurposeActivities,1);
  assert.equal(payload(result).complete,false);
  const all=await run('Show course activities.',data);assert.equal(all.readState,'ok');assert.equal(payload(all).records[0].activities[0].purpose,null);
});

test('unrelated legacy activities do not invalidate exact selected activity completeness',async()=>{
  const data={userId,courseId:9408,sections:[{position:1,title:'Mixed section',activities:[activity(11,'Known video'),{id:12,title:'Legacy item',kind:'url'}]}]};
  for(const question of ['Show video activity 11.','Show video activity "Known video".']){
    const result=await run(question,data),body=payload(result);
    assert.equal(result.readState,'ok',question);assert.equal(body.complete,true);assert.equal(body.counts.unknownPurposeActivities,0);
    assert.equal(body.counts.matchingActivities,1);assert.equal(body.records[0].activities[0].id,11);
  }
  const unknown=await run('Show video activity 12.',data);
  assert.equal(unknown.reason,'purpose_metadata_missing');assert.equal(payload(unknown).counts.unknownPurposeActivities,1);
  for(const question of ['Show section 3 activities.','Show section "Missing section" activities.']){
    const result=await run(question,data);assert.equal(result.readState,'empty');assert.equal(payload(result).complete,true);
  }
});

test('foreign owners/courses, duplicate lineage, invalid purposes and unexpected data fail closed',async()=>{
  const invalid=[{...outline,userId:'other'}, {...outline,courseId:9098}, {...outline,secret:'do not leak'},
    {...outline,sections:[outline.sections[0],outline.sections[0]]},
    {...outline,sections:[outline.sections[0],{...outline.sections[1],activities:[activity(11,'Same ID wrong section')]}]},
    {...outline,sections:[{...outline.sections[0],activities:[{...activity(11,'Invalid kind'),'kind':'file'}]}]},
    {...outline,sections:[{...outline.sections[0],activities:[activity(11,'Bad purpose','attendance'),{...activity(12,'URL attendance'),kind:'url',purpose:'attendance'}]}]},
    {...outline,sections:[{...outline.sections[0],activities:[{...activity(11,'Secret'),'storagePath':'private/path'}]}]},
    {...outline,sections:[{...outline.sections[0],title:'bad\u0000text'}]},
  ];
  for(const data of invalid){const result=await run('Show course outline.',data);assert.equal(result.reason,'invalid_records');assert.equal(payload(result).counts,null);assert.equal(payload(result).records.length,0);}
});

test('duplicate requested section or activity titles require clarification rather than selecting unrelated rows',async()=>{
  const sections=[...outline.sections,{position:3,title:'Reflection',activities:[activity(99,'Feedback form','feedback')]}];
  assert.equal((await run('Show section "Reflection" activities.',{...outline,sections})).reason,'ambiguous_section');
  assert.equal((await run('Show activity "Feedback form".',{...outline,sections})).reason,'ambiguous_activity');
});

test('words in a literal activity or section title do not invent a purpose filter',async()=>{
  const data={userId,courseId:9408,sections:[{position:1,title:'Video guide',activities:[activity(11,'Video introduction','link')]}]};
  for(const question of ['Show activity "Video introduction".','Show section "Video guide" activities.']){
    const result=await run(question,data);assert.equal(result.readState,'ok');assert.equal(payload(result).records[0].activities[0].id,11);
    assert.deepEqual(payload(result).selection.purposes,[]);
  }
});

test('bounded whole envelope keeps complete Unicode rows and explicit exact omission counts',async()=>{
  const data={userId,courseId:9408,sections:Array.from({length:8},(_,section)=>({position:section+1,title:'章節'+section,
    activities:Array.from({length:30},(_,index)=>activity(section*100+index+1,'教材🌿'.repeat(60)+'-'+section+'-'+index))}))};
  const result=await run('Show all course activities.',data),body=payload(result);
  assert.equal(result.readState,'partial');assert.equal(body.counts.availableActivities,240);
  assert.equal(body.counts.matchingActivities,240);assert.equal(body.counts.includedActivities+body.counts.omittedActivities,240);
  assert.equal(body.counts.includedSections+body.counts.omittedSections,8);assert.equal(body.complete,false);
  assert.ok(Buffer.byteLength(JSON.stringify(result))<=elearningOutlineEvidenceMaxBytes);
  for(const section of body.records)for(const row of section.activities)assert.ok(data.sections.some(source=>source.activities.some(original=>original.id===row.id&&original.title===row.title)));
});

test('expired, malformed and hung read deadlines return unavailable rather than absence',async()=>{
  let reads=0;
  for(const deadline of [Date.now()-1,NaN]){
    const result=await readElearningOutlineEvidence(account,{question:'Show videos.',route,deadline},{read:async()=>{reads++;return outline;}});
    assert.equal(result.readState,'unavailable');
  }
  assert.equal(reads,0);
  const result=await readElearningOutlineEvidence(account,{question:'Show videos.',route,deadline:Date.now()+30},{read:()=>new Promise(()=>{})});
  assert.equal(result.reason,'deadline_exceeded');assert.equal(payload(result).counts,null);
  const failed=await readElearningOutlineEvidence(account,{question:'Show videos.',route},{read:async()=>{throw new Error('token-private');}});
  assert.equal(failed.reason,'read_failed');assert.doesNotMatch(failed.evidence.content,/token-private/);
});

test('actual native RPC transport uses only caller JWT and exact course ID, without a model or catalog fetch',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(input,init)=>{
    calls++;assert.equal(String(input),account.url+'/rest/v1/rpc/elearning_course_outline');
    assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+account.token);
    assert.deepEqual(JSON.parse(String(init?.body)),{p_course_id:9408});return Response.json(outline);
  };
  try{const result=await readElearningOutlineEvidence(account,{question:'Show slides.',route});assert.equal(result.readState,'ok');assert.equal(calls,1);}
  finally{globalThis.fetch=original;}
});
