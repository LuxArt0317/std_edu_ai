import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildTeachingFeedbackNativeCases,teachingFeedbackNativeFixtureForCase,teachingFeedbackNativeManifest as manifest,gradeTeachingFeedbackNativeCase} from './teaching-feedback-native-cases.mjs';
import {parseTeachingFeedback,teachingFeedbackPaths} from '../../server/teachingFeedbackContract.js';
import {readTeachingFeedback} from '../../server/teachingFeedback.js';
import {readTeachingFeedbackEvidence} from '../../server/accountTeachingFeedbackEvidence.js';
import {teachingFeedbackLookupContext} from '../../server/teachingFeedbackEvidenceIntent.js';
import {formatSupplementalAccountAnswers} from '../../server/supplementalAccountAnswers.js';

const rows=buildTeachingFeedbackNativeCases(),copy=structuredClone;
const find=id=>{const row=rows.find(item=>item.id==='account:teaching-native-'+id);assert.ok(row,id);return row;};
const fixture=row=>teachingFeedbackNativeFixtureForCase(row);
const observed=row=>{const value=fixture(row);return {callerId:row.auth==='anonymous'?null:value.owner,reads:value.reads,evidence:value.evidence,companions:value.companions,writeRequests:[],storageRequests:[],publicRequests:[]};};
const envelope=(row,answer)=>({statusCode:200,execution:'recorded',fixtureKey:row.fixtureKey,events:row.toolPolicy.required.map(name=>({kind:'account-read:'+name+':1',status:row.toolPolicy.failed.includes(name)?'unavailable':'complete'})),
  body:{status:row.auth==='anonymous'?'handoff':row.expected.behavior==='clarify'?'clarification':'answered',answer,citations:row.expected.requiredLinks.map(url=>({chunkId:url==='/school-affairs/records'?'account:profile':url==='/school-affairs/records/subjects'?'account:courses':row.readExpectation.views.length?manifest.sourceId:'directory:teaching-feedback',title:'Saved local records',url})),views:[],verification:{status:'verified',attempts:1}}});
const grade=(row,answer,observation=observed(row))=>gradeTeachingFeedbackNativeCase(row,envelope(row,answer),{observation});
const pass=(row,answer)=>assert.deepEqual(grade(row,answer).failures,[],row.id+' '+JSON.stringify(grade(row,answer).failures));
const fail=(row,answer,id)=>{const result=grade(row,answer);assert.equal(result.passed,false,answer);if(id)assert.ok(result.failures.some(item=>item.id.startsWith(id)),JSON.stringify(result.failures));};
const prefix='These are saved local stu.best records.\n\n';
const statuses=prefix+'- DB701\n  Status: submitted\n- WS702\n  Status: reviewed';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'synthetic-key',token:'synthetic-token',user:{id:manifest.owners.A}};

test('independent lane declares both native services and no live or shared-suite registration',()=>{
  assert.equal(rows.length,40);assert.equal(new Set(rows.map(row=>row.id)).size,40);assert.deepEqual(manifest.paths,teachingFeedbackPaths);
  assert.equal(manifest.mounted,false);assert.equal(manifest.setupEligible,false);assert.equal(manifest.liveAcceptance,false);
  for(const row of rows){assert.equal(row.expected.noAction,true);assert.equal(row.capability.mounted,false);assert.ok(!row.toolPolicy.allowed.includes('manage'));}
  assert.throws(()=>fixture({id:'unknown'}));assert.throws(()=>fixture({...find('immediate-status'),fixtureKey:'other'}));
  const changed=fixture(find('immediate-comment'));changed.data.immediate.feedback[0].comment='changed';assert.notEqual(fixture(find('immediate-comment')).data.immediate.feedback[0].comment,'changed');
});

test('actual teaching selector preserves every authenticated independent question scope',()=>{
  const authenticated=rows.filter(row=>row.auth!=='anonymous');assert.equal(authenticated.length,39);
  for(const row of authenticated){
    const selection=teachingFeedbackLookupContext(row.question,row.route,row.history??[]).selection;
    assert.deepEqual({views:selection?.views??[],comments:selection?.commentRequested??false,courseFilter:selection?.course??null},
      {views:row.readExpectation.views,comments:row.readExpectation.comments,courseFilter:row.readExpectation.courseFilter},row.id);
  }
});

test('independent native DTOs obey actual contract, student views and exact per-course relationships',()=>{
  for(const row of rows){const value=fixture(row);for(const [view,data]of Object.entries(value.data))assert.deepEqual(parseTeachingFeedback(data,value.owner,view),data,row.id);}
  const value=fixture(find('survey-status'));
  assert.equal(value.data.survey.surveys[0].courses[0].completed,true);assert.equal(value.data.survey.surveys[1].courses[0].completed,false);
  assert.deepEqual(value.data.survey.results,[]);assert.deepEqual(value.data.immediate.terms,[]);
  assert.equal(value.data.immediate.feedback[0].reviewedAt,null);assert.equal(value.data.immediate.feedback[1].reviewedAt,'2026-11-14T05:06:07Z');
  assert.equal(fixture(find('survey-cap')).data.survey.surveys.length,50);assert.equal(fixture(find('feedback-cap')).data.immediate.feedback.length,100);assert.equal(fixture(find('eligible-cap')).data.immediate.courses.length,200);
});

test('saved course statuses are paired, cannot swap or borrow another row, and remain independent of review delivery',()=>{
  const row=find('immediate-status');pass(row,statuses);
  fail(row,prefix+'- DB701\n  Status: reviewed\n- WS702\n  Status: submitted','fact.');
  fail(row,statuses+'\n- DB701\n  Status: reviewed','fact.');
  const boundary=find('review-not-delivery');pass(boundary,prefix+'Reviewed does not prove your teacher read it or changed the lesson.');
  fail(boundary,prefix+'Reviewed does not prove delivery. Your teacher has read your feedback.','teaching.noActionOrOutcome');
  fail(boundary,prefix+'I cannot confirm any outcome. Your teacher changed the lesson.','teaching.noActionOrOutcome');
});

test('survey completion and windows remain course/phase bound, not anonymous response values',()=>{
  const row=find('course-completion');pass(row,prefix+'- DB701\n  Midterm completion: completed\n- WS702\n  Midterm completion: not completed');
  fail(row,prefix+'- DB701\n  Midterm completion: not completed\n- WS702\n  Midterm completion: completed','fact.');
  const phases=find('survey-phases');pass(phases,prefix+'These are separate surveys.\n- midterm\n  DB701 completion: completed\n- final\n  DB701 completion: not completed');
  fail(phases,prefix+'These are separate surveys.\n- midterm\n  DB701 completion: completed\n- final\n  DB701 completion: completed','fact.');
  const windows=find('survey-windows');pass(windows,prefix+'- midterm\n  Opens: 2026-11-01T00:00:00Z\n  Closes: 2026-11-30T00:00:00Z');
  fail(windows,prefix+'- midterm\n  Opens: 2026-11-30T00:00:00Z\n  Closes: 2026-11-01T00:00:00Z','fact.');
});

test('explicit comment selection preserves exact saved text and forbids unrequested comment leakage in prose/cards',()=>{
  const row=find('immediate-comment'),value=fixture(row),comment=value.data.immediate.feedback[0].comment;
  pass(row,prefix+'- DB701\n  Comment: '+comment);
  fail(row,prefix+'- DB701\n  Comment: '+comment+'\n- WS702\n  Comment: '+value.data.immediate.feedback[1].comment,'teaching.noUnrequestedComment');
  fail(row,prefix+'- DB701\n  Comment: '+value.data.immediate.feedback[1].comment,'teaching.commentPair');
  fail(row,prefix+'- DB701\n  Comment: '+comment+'\n- DB701\n  Comment: invented','teaching.commentPair');
  const status=find('without-comment');fail(status,statuses+'\nComment: '+comment,'teaching.noUnrequestedComment');
  const output=envelope(status,statuses);output.body.views=[{rows:[['DB701','Comment',comment]]}];
  assert.ok(gradeTeachingFeedbackNativeCase(status,output,{observation:observed(status)}).failures.some(item=>item.id==='teaching.noUnrequestedComment'));
  for(const view of [{rows:[['DB701','Comment','Invented conflicting comment']]},{rows:[['WS702','Comment',comment]]},{records:[{code:'DB701',comment:'Invented conflicting comment'}]},
    {columns:['Course','Comment'],rows:[['DB701','Invented conflicting comment']]},
    {columns:['Course'],rows:[['DB701']],note:'DB701 Comment: Invented conflicting comment'},
    {columns:['Course'],rows:[['DB701']],title:'DB701 Saved comment: Invented conflicting comment'}]){
    const wrong=envelope(row,prefix+'- DB701\n  Comment: '+comment);wrong.body.views=[view];
    assert.ok(gradeTeachingFeedbackNativeCase(row,wrong,{observation:observed(row)}).failures.some(item=>item.id==='teaching.cardCommentPair'));
  }
  const exact=envelope(row,prefix+'- DB701\n  Comment: '+comment);exact.body.views=[{rows:[['DB701','Comment',comment]]}];
  assert.equal(gradeTeachingFeedbackNativeCase(row,exact,{observation:observed(row)}).passed,true);
  exact.body.views=[{columns:['Course','Comment'],rows:[['DB701 QA Data Modeling',comment]],note:'DB701 Comment: '+comment}];
  assert.equal(gradeTeachingFeedbackNativeCase(row,exact,{observation:observed(row)}).passed,true);
  const unexpected=observed(row);unexpected.evidence[0].records[0].id='DATABASE-ID';assert.equal(grade(row,prefix+'- DB701\n  Comment: '+comment,unexpected).passed,false);
  const marked=find('markup-comment'),literal=fixture(marked).data.immediate.feedback[0].comment;
  pass(marked,prefix+'- DB701\n  Comment: `'+literal+'`');
  fail(marked,prefix+'- DB701\n  Comment: '+literal,'teaching.renderedLinks');
  fail(marked,prefix+'- DB701\n  Comment: `'+literal+'`\n[Open feedback](https://private.invalid/feedback)','teaching.renderedLinks');
});

test('raw scope, exact caller, selected projection and no-side-effect observations are mandatory',()=>{
  const row=find('immediate-status');
  for(const mutate of [value=>{value.callerId=manifest.owners.B;},value=>{value.reads[0].query.view='manage';},value=>{value.reads[0].result.userId=manifest.owners.B;},
    value=>{value.reads[0].result.results=[{anonymous:'SECRET'}];},value=>{value.evidence[0].records[0].status='reviewed';},value=>{value.evidence[0].records[0].comment='unrequested';},
    value=>{value.writeRequests=['submit'];},value=>{value.storageRequests=['download'];},value=>{value.publicRequests=['private prompt'];}]){
    const bad=observed(row);mutate(bad);assert.equal(grade(row,statuses,bad).passed,false);
  }
  assert.equal(gradeTeachingFeedbackNativeCase(row,envelope(row,statuses)).passed,false);
  const output=envelope(row,statuses);output.events.push({kind:'account-read:dtm:1',status:'complete'});assert.equal(gradeTeachingFeedbackNativeCase(row,output,{observation:observed(row)}).passed,false);
});

test('no private transport is authorized by navigation, exclusion, anonymous answers or another named owner',()=>{
  for(const id of ['survey-link','immediate-link','exclude-all','foreign-survey','foreign-immediate','foreign-postfix','foreign-zh','anonymous-responses','manager-results','submit-survey','submit-feedback','anonymous'])assert.deepEqual(fixture(find(id)).reads,[],id);
  const row=find('foreign-survey');pass(row,'I can only query your own account; I cannot access another student’s records.');
  const wrong=observed(row);wrong.reads=fixture(find('survey-status')).reads;assert.equal(grade(row,'I can only query your own account.',wrong).passed,false);
  fail(row,'I can only query your own account. FOREIGN TEACHING COMMENT','teaching.noPrivateMarkers');
  fail(row,'I can only query your own account. I can read Alice’s teaching evaluation.','teaching.foreignDenial');
  const anonymous=find('anonymous-responses');pass(anonymous,'Your anonymous responses are unavailable through this student view.');
  fail(anonymous,'Your anonymous responses are unavailable. ANONYMOUS RESPONSE SECRET','teaching.noPrivateMarkers');
  fail(anonymous,'Your anonymous responses are unavailable. Your survey rating was 5.','teaching.noManagerOrAnonymous');
  const privateCard=envelope(anonymous,'Your anonymous responses are unavailable.');privateCard.body.views=[{ratings:[5,4]}];
  assert.ok(gradeTeachingFeedbackNativeCase(anonymous,privateCard,{observation:observed(anonymous)}).failures.some(item=>item.id==='teaching.noManagerOrAnonymous'));
  const submitted=find('submit-feedback');pass(submitted,'I cannot submit or send teaching feedback for you from this lookup.');
  fail(submitted,'No submission was made. I have submitted your feedback.','teaching.noActionOrOutcome');
});

test('failed reads remain unknown; saved empty is not a claim about official university history',()=>{
  const failed=find('read-failure');pass(failed,prefix+'The immediate teaching feedback read failed; saved status is unknown.');
  fail(failed,prefix+'The immediate teaching feedback read failed. There are no saved feedback records.','teaching.failureNotEmpty');
  const empty=find('empty-immediate');pass(empty,prefix+'There is no saved immediate teaching feedback on stu.best. No saved records were returned.');
  const broken=observed(empty);broken.reads[0].state='unavailable';broken.reads[0].result=null;assert.equal(grade(empty,prefix+'There is no saved immediate teaching feedback.',broken).passed,false);
});

test('native caps never become exact history totals',()=>{
  for(const [suffix,count,label]of [['survey-cap',50,'Surveys returned'],['feedback-cap',100,'Feedback records returned'],['eligible-cap',200,'Eligible courses returned']]){
    const row=find(suffix);pass(row,prefix+label+': '+count+'. The total is unknown; there may be more.');
    fail(row,prefix+label+': '+count+'. The total is unknown. You have exactly '+count+' historical records.','teaching.capNotTotal');
    const forged=observed(row);forged.evidence[0].capReached=false;assert.equal(grade(row,prefix+count+' rows; completeness is unknown.',forged).passed,false);
    const partial=observed(row),view=partial.evidence[0];view.records=view.records.slice(0,2);view.eligibleCourses=view.eligibleCourses.slice(0,2);
    view.omitted={records:fixture(row).evidence[0].records.length-view.records.length,eligibleCourses:fixture(row).evidence[0].eligibleCourses.length-view.eligibleCourses.length};
    assert.equal(grade(row,prefix+label+': '+count+'. The total is unknown; there may be more.',partial).checks.find(item=>item.id==='teaching.selectedEvidence').passed,true);
    view.omitted.records++;assert.equal(grade(row,prefix+label+': '+count+'. The total is unknown.',partial).checks.find(item=>item.id==='teaching.selectedEvidence').passed,false);
  }
});

test('actual strict evidence reader matches independent native DTOs, opt-in projection, failures and whole-row caps',async()=>{
  for(const suffix of ['survey-status','course-completion','immediate-status','immediate-comment','both-views','empty-survey','empty-immediate','read-failure','one-view-failure','survey-cap','feedback-cap','eligible-cap','markup-comment']){
    const row=find(suffix),value=fixture(row),reads=[],callers=[];
    const result=await readTeachingFeedbackEvidence(account,{views:row.readExpectation.views,commentRequested:row.readExpectation.comments,
      ...(row.readExpectation.courseFilter?{course:row.readExpectation.courseFilter}:{})},{read:async(caller,query)=>{
      callers.push(caller.user.id);const expected=value.reads.find(item=>item.view===query.view);reads.push({...copy(expected),query:copy(query)});
      if(expected.state==='unavailable')throw new Error('synthetic read failure');return copy(expected.result);
    }});
    assert.ok(callers.every(id=>id===value.owner));assert.deepEqual(reads,value.reads,row.id);assert.ok(Buffer.byteLength(JSON.stringify(result))<=16000);
    assert.equal(result.evidence.id,manifest.sourceId);const payload=JSON.parse(result.evidence.content);
    assert.deepEqual(payload.provenance,{sourceMode:'saved_local',officialUniversityData:false,synchronized:false});
    const evidence=payload.views.map(view=>({view:view.view,state:view.readState==='unavailable'?'unavailable':'ok',
      records:view.surveys??view.feedback,eligibleCourses:view.courses??[],nativeCounts:view.readState==='unavailable'?null:{surveys:view.counts.surveys?.returned??0,feedback:view.counts.feedback?.returned??0,eligibleCourses:view.counts.eligibleCourses?.returned??0},
      capReached:Object.values(view.counts).some(counter=>counter.capReached===true),omitted:{records:(view.counts.surveys??view.counts.feedback).omitted??0,eligibleCourses:view.counts.eligibleCourses?.omitted??0},complete:view.complete}));
    const output=envelope(row,'Synthetic answer not used as a source of expected facts.');
    const gradeResult=gradeTeachingFeedbackNativeCase(row,output,{observation:{...observed(row),reads,evidence}});
    const projectionCheck=gradeResult.checks.find(item=>item.id==='teaching.selectedEvidence');assert.equal(projectionCheck.passed,true,row.id+' '+JSON.stringify(evidence));
    assert.ok(!JSON.stringify(payload.views).includes('userId'));assert.ok(!JSON.stringify(payload.views).includes('sectionId'));
    if(!row.readExpectation.comments)assert.ok(!JSON.stringify(payload.views).includes('"comment"'));
  }
});

test('mixed year/current subjects require both additional owned sources, in either clause order',()=>{
  for(const suffix of ['mixed-before','mixed-after']){
    const row=find(suffix),answer=statuses+'\nYear: 3\nCurrent subjects: CUR301, CUR302';pass(row,answer);
    fail(row,statuses,'fact.');fail(row,statuses+'\nYear: 2\nCurrent subjects: CUR301, CUR302','fact.');
    const missing=observed(row);delete missing.companions.profile;assert.equal(grade(row,answer,missing).passed,false);
    const output=envelope(row,answer);output.events=output.events.filter(event=>!event.kind.includes(':courses:'));assert.equal(gradeTeachingFeedbackNativeCase(row,output,{observation:observed(row)}).passed,false);
    const wrongSource=envelope(row,answer);wrongSource.body.citations.find(citation=>citation.chunkId==='account:courses').chunkId='account:profile';
    assert.equal(gradeTeachingFeedbackNativeCase(row,wrongSource,{observation:observed(row)}).passed,false);
  }
  const excluded=find('excluded-native');pass(excluded,prefix+'I did not read teaching feedback. Year: 3\nCurrent subjects: CUR301, CUR302');
  const wrong=observed(excluded);wrong.reads=fixture(find('immediate-status')).reads;assert.equal(grade(excluded,prefix+'Year: 3\nCurrent subjects: CUR301, CUR302',wrong).passed,false);
});

test('exact and prefixed public research events never masquerade as private-only retrieval',()=>{
  const row=find('immediate-status');
  for(const kind of ['knowledge','knowledge-query','knowledge:search','public','public-search','web','web-search','page-context']){
    const output=envelope(row,statuses);output.events.push({kind,status:'complete'});
    assert.ok(gradeTeachingFeedbackNativeCase(row,output,{observation:observed(row)}).failures.some(item=>item.id==='teaching.noPublicEvents'),kind);
  }
});

test('actual native RPC under intercepted transport reads only selected student scopes and retains no manager arguments',async()=>{
  const original=globalThis.fetch,row=find('both-views'),value=fixture(row),calls=[];
  globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,body,authorization:options.headers.Authorization});
    return Response.json(value.data[body.p_scope]);};
  try{
    for(const read of value.reads)assert.deepEqual(await readTeachingFeedback(account,read.query),read.result);
    assert.deepEqual(calls.map(call=>call.body),['survey','immediate'].map(p_scope=>({p_scope,p_term:null,p_survey:null,p_section:null})));
    assert.ok(calls.every(call=>call.url===account.url+'/rest/v1/rpc/affairs_read_teaching_feedback'&&call.authorization==='Bearer synthetic-token'));
  }finally{globalThis.fetch=original;}
});

test('legacy direct answer is not model-verification proof and its omitted comment is detected by the independent case',async()=>{
  const original=globalThis.fetch,row=find('immediate-comment'),value=fixture(row);
  globalThis.fetch=async()=>Response.json(value.data.immediate);
  try{
    const answer=await readTeachingFeedback(account,{scope:'teaching-feedback',view:'immediate',answer:'en'});
    const result=gradeTeachingFeedbackNativeCase(row,{statusCode:200,execution:'deterministic',fixtureKey:row.fixtureKey,body:answer,events:[]},{observation:observed(row)});
    assert.equal(result.passed,false);assert.ok(result.failures.some(item=>item.id==='answer.verification'));assert.ok(result.failures.some(item=>item.id==='fact.0'));
  }finally{globalThis.fetch=original;}
});

test('actual native reader and supplemental formatter preserve independently expected status and literal comment fields',async()=>{
  for(const suffix of ['immediate-status','immediate-comment']){
    const row=find(suffix),value=fixture(row);
    const evidence=await readTeachingFeedbackEvidence(account,{views:row.readExpectation.views,commentRequested:row.readExpectation.comments,
      ...(row.readExpectation.courseFilter?{course:row.readExpectation.courseFilter}:{})},{read:async(_caller,query)=>copy(value.data[query.view])});
    const body=formatSupplementalAccountAnswers([evidence],{question:row.question});
    const result=gradeTeachingFeedbackNativeCase(row,{statusCode:200,execution:'deterministic',fixtureKey:row.fixtureKey,body,events:envelope(row,'').events},{observation:observed(row)});
    assert.deepEqual(result.failures.map(item=>item.id),['answer.verification','answer.verification.expected'],row.id+' '+JSON.stringify(result.failures));
  }
});
