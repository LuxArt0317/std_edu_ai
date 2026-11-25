import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {assertPublishedOutlineRead, buildLiveOutlineCases, planPublishedOutlineAccess, publishedOutlineCases} from './elearning-outline-fixtures.mjs';
import {readElearningOutlineEvidence} from '../../server/accountElearningOutlineEvidence.js';
import {formatSupplementalAccountAnswers} from '../../server/supplementalAccountAnswers.js';
import {gradeCase} from './grading.mjs';

const owners = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'];
const cases = publishedOutlineCases();
const plan = planPublishedOutlineAccess(owners);

// Parse the committed seed tuple shapes independently of the oracle and
// reader. Changes here require reviewing the test questions and their facts.
function readSeed(courseId, userId) {
  const sql = readFileSync(new URL('../../supabase/migrations/'+cases[0].migrations[0], import.meta.url), 'utf8');
  const activitySql = readFileSync(new URL('../../supabase/migrations/'+cases[0].migrations[1], import.meta.url), 'utf8');
  const explicitPurpose = [...activitySql.matchAll(/when id(?: in \((\d+(?:,\d+)*)\)|=(\d+)) then '(\w+)'/gu)];
  const purposeFor = (id, kind) => explicitPurpose.find(([, many, one]) => (many ?? one).split(',').includes(String(id)))?.[3]
    ?? (kind === 'attendanceregister' ? 'attendance' : 'video');
  const rowPattern = /^\s*\((\d+),(\d+),(\d+),(\d+),'(url|attendanceregister)','([^']+)'\)[,;]$/gmu;
  const rows = [...sql.matchAll(rowPattern)].map(([, id, course, section, position, kind, title]) => ({
    id:Number(id), course:Number(course), section:Number(section), position:Number(position), kind, title,
  }));
  assert.equal(rows.length, 17);
  const sections = [...sql.matchAll(/^\s*\((\d+),(\d+),'([^']+)'\)[,;]$/gmu)]
    .filter(match => Number(match[1]) === courseId)
    .map(([, , section, title]) => ({position:Number(section), title,
      activities:rows.filter(row => row.course === courseId && row.section === Number(section))
        .sort((a,b) => a.position-b.position).map(({id,kind,title:activityTitle}) => ({id,kind,title:activityTitle,purpose:purposeFor(id,kind)}))}));
  return {userId, courseId, sections};
}

test('the independent oracle verifies both native outlines and both crossed access outcomes', () => {
  for (const [index, course] of [9408, 9098].entries()) {
    const own = readSeed(course, owners[index]);
    assert.deepEqual(assertPublishedOutlineRead(plan, owners[index], course, own), own);
    const crossed = {...own, userId:owners[1-index], sections:[]};
    assert.deepEqual(assertPublishedOutlineRead(plan, crossed.userId, course, crossed), crossed);
    assert.throws(() => assertPublishedOutlineRead(plan, crossed.userId, course, {...own, userId:crossed.userId}), /differs/u);
  }
  assert.throws(() => planPublishedOutlineAccess([owners[0],owners[0]]), /distinct/u);
  assert.throws(() => assertPublishedOutlineRead([{...plan[0],course_id:9098},plan[1]],owners[0],9408,readSeed(9408,owners[0])), /target/u);
});

test('wrong caller, altered activity purpose and misplaced section fail the outline readback', () => {
  const own = readSeed(9098, owners[1]);
  const retyped = structuredClone(own);
  retyped.sections[0].activities[0].purpose = 'video';
  const misplaced = structuredClone(own);
  misplaced.sections[0].activities.push(misplaced.sections[1].activities.pop());
  for (const payload of [{...own,userId:owners[0]}, retyped, misplaced]) {
    assert.throws(() => assertPublishedOutlineRead(plan, owners[1], 9098, payload), /differs/u);
  }
});

test('outline questions project exact activity links and source lineage with intercepted native transport', async () => {
  for (const row of cases) {
    const userId = owners[row.owner];
    const raw = row.limit ? {userId,courseId:row.courseId,sections:[]} : readSeed(row.courseId,userId);
    assertPublishedOutlineRead(plan,userId,row.courseId,raw);
    const result = await readElearningOutlineEvidence({url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'offline',token:'offline',user:{id:userId}},
      {question:row.question,route:row.route,history:row.history}, {read:async(account,selectors) => {
        assert.equal(account.user.id,userId);
        assert.deepEqual(selectors,{scope:'elearning-course-outline',course:String(row.courseId)});
        return raw;
      }});
    assert.equal(result.reason,row.limit ?? null,row.id);
    const payload = JSON.parse(result.evidence.content);
    const actual = payload.records.flatMap(section => section.activities.map(activity => ({id:activity.id,title:activity.title,
      purpose:activity.purpose,section:section.title,path:activity.url})));
    assert.deepEqual(actual,row.facts,row.id);
    assert.deepEqual(result.evidence.urls,[`/elearning/course/${row.courseId}`,...row.facts.map(activity => activity.path)]);
    assert.ok(row.forbiddenActivities.every(id => result.evidence.urls.every(url => !url.endsWith(`/activity/${id}`))));
    assert.equal(payload.capability.content,false);
    assert.equal(payload.capability.grades,false);
  }
  assert.deepEqual(cases.find(row => row.id === 'outline-mixed-enrollments').tools,['elearningOutline','elearningEnrollments']);
});

test('the authored live outlines accept local reference answers and reject wrong section and false absence',async()=>{
  const bank=buildLiveOutlineCases();
  const digest='a'.repeat(64);
  for(const row of bank.filter(item=>item.fixtureKey!=='elearningOutline:mixed-enrollments')){
    const livePlan=planPublishedOutlineAccess(owners,row.fixtureKey),userId=owners[0];
    const exemplar=cases.find(item=>'account:elearning-'+item.id===row.id),courseId=exemplar.courseId;
    const raw=exemplar.limit?{userId,courseId,sections:[]}:readSeed(courseId,userId);
    assertPublishedOutlineRead(livePlan,userId,courseId,raw);
    const source=await readElearningOutlineEvidence({url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'offline',token:'offline',user:{id:userId}},
      {question:row.question,route:row.route,history:row.history},{read:async()=>raw});
    const formatted=formatSupplementalAccountAnswers([source],{question:row.question});
    const envelope={statusCode:200,execution:'deterministic',fixtureKey:row.fixtureKey,
      stateBefore:{ownedRecordsDigest:digest},stateAfterProposal:{ownedRecordsDigest:digest},
      fixtureReadback:{verified:true,independentGolden:true},
      events:[{kind:'account-read:elearningOutline:1',status:'running'},
        {kind:'account-read:elearningOutline:1',status:source.readState==='unavailable'?'unavailable':'complete'}],
      body:{...formatted,verification:{status:'verified',attempts:1}}};
    assert.deepEqual(gradeCase(row,envelope).failures,[],row.id);
    if(row.id.endsWith('outline-videos')){
      const original=envelope.body.answer;
      envelope.body.answer=original.replace(/activity\/(293395|293396)/gu,(_match,id)=>'activity/'+(id==='293395'?'293396':'293395'));
      const swapped=gradeCase(row,envelope).failures;
      assert.deepEqual(swapped.map(failure=>failure.id),['links.record.0','links.record.1']);
      envelope.body.answer=original+'\n第一段影片: [Open activity](/elearning/course/9408/activity/293396)';
      assert.deepEqual(gradeCase(row,envelope).failures.map(failure=>failure.id),['links.record.0']);
      envelope.body.answer+=' and [another link](/elearning/course/9408/activity/293395)';
      assert.deepEqual(gradeCase(row,envelope).failures.map(failure=>failure.id),['links.record.0']);
      const explicit=exemplar.facts.map(activity=>`[${activity.title}](${activity.path})`).join(' · ');
      envelope.body.answer=original.replace(/^.*Open activity.*$/gmu,'')+'\n'+explicit;
      assert.deepEqual(gradeCase(row,envelope).failures,[],row.id);
      envelope.body.answer=envelope.body.answer.replace(explicit,
        explicit.replace(' · ',' · 第一段影片: [Open activity](/elearning/course/9408/activity/293396)\n'));
      assert.deepEqual(gradeCase(row,envelope).failures.map(failure=>failure.id),['links.record.0']);
      envelope.body.answer=original+'\n'+explicit+' and [Open activity](/elearning/course/9408/activity/293395)';
      assert.ok(gradeCase(row,envelope).failures.some(failure=>failure.id.startsWith('links.record.')));
    }
    if(row.id.endsWith('feedback-and-slides')){
      envelope.body.answer=envelope.body.answer.replace('Section: ` 課程回饋 `','Section: ` 課程主題 `');
      assert.ok(gradeCase(row,envelope).failures.some(failure=>failure.id.startsWith('fact.')));
    }
    if(exemplar.limit){
      envelope.body.answer+=' There are no slides.';
      assert.ok(gradeCase(row,envelope).failures.some(failure=>failure.id.startsWith('text.forbidden.')));
    }
  }
});
