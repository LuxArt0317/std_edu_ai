import {isDeepStrictEqual} from 'node:util';

const courseA={id:9718,title:'111-1遠距教學研習_20220902',category_id:41,position:9};
const courseB={id:9408,title:'一般安全衛生教育訓練-1100330',category_id:18,position:8};
const joinedAt='2026-11-14T00:00:00.000Z';
const table='elearning_enrollments';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const bad=code=>{throw new Error('Remote-learning fixture '+code+'.');};
export const elearningFixtureManifest=Object.freeze({
  table,courseA:Object.freeze(courseA),courseB:Object.freeze(courseB),joinedAt,
  keys:Object.freeze(['elearningEnrollments','empty:elearningEnrollments']),
});
const nativeEnrollmentCases=new Set(['enrollment','enrollment-mixed','enrollment-empty','grades-unlinked']
  .map(suffix=>'account:elearning-'+suffix));
export const isNativeElearningEnrollmentCase=testCase=>testCase?.domain==='elearningEnrollments'&&nativeEnrollmentCases.has(testCase.id);
export function verifiedElearningEnrollmentRun(testCase,envelope){
  const before=envelope?.stateBefore?.ownedRecordsDigest,after=envelope?.stateAfterProposal?.ownedRecordsDigest;
  const readback=envelope?.fixtureReadback,proof=readback?.elearningEnrollment,activity=envelope?.body?.activity;
  return isNativeElearningEnrollmentCase(testCase)&&envelope?.execution==='live-native'&&envelope.deploymentCheck?.verified===true
    &&readback?.verified===true&&readback.independentGolden===true
    &&proof?.caseId===testCase.id&&proof?.twoOwnersVerified===true
    &&/^[a-f0-9]{64}$/u.test(before??'')&&before===after
    &&Array.isArray(activity)&&activity.filter(step=>step?.kind==='elearning-evidence-check'&&step.status==='complete').length===1;
}
const normalizeTime=value=>{
  const raw=value instanceof Date?value.toISOString():value;
  const match=typeof raw==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,6}))?(?:Z|[+-]\d{2}:\d{2})$/u.exec(raw);
  return match&&!/[1-9]/u.test((match[1]??'').slice(3))&&Number.isFinite(Date.parse(raw))?new Date(raw).toISOString():null;
};

export function elearningFixturePlan(fixtureKey,owners){
  if(!elearningFixtureManifest.keys.includes(fixtureKey)||!Array.isArray(owners)||owners.length!==2||owners.some(value=>!uuid.test(value))
    ||owners[0]===owners[1])bad('has invalid owner binding');
  const rows=[...(fixtureKey.startsWith('empty:')?[]:[{user_id:owners[0],course_id:courseA.id,joined_at:joinedAt}]),
    {user_id:owners[1],course_id:courseB.id,joined_at:joinedAt}];
  return {owners:[...owners],fixtureKey,rows};
}

export function assertElearningFixtureCatalog(rows){
  if(!Array.isArray(rows)||rows.length!==2||![courseA,courseB].every(expected=>rows.some(row=>isDeepStrictEqual(row,expected))))
    bad('catalog no longer matches the authored course binding');
}

export function assertElearningFixtureRows(plan,actual){
  if(!Array.isArray(actual)||actual.length!==plan.rows.length
    ||actual.some(row=>!row||Object.keys(row).length!==3)
    ||!plan.rows.every(row=>actual.some(item=>item.user_id===row.user_id&&item.course_id===row.course_id&&normalizeTime(item.joined_at)===row.joined_at)))
    bad('records do not match exact disposable-owner targets');
}

export function verifyElearningFixtureWorkspace(plan,owner,value){
  const owned=plan.rows.filter(row=>row.user_id===owner);
  if(!plan.owners.includes(owner)||value?.userId!==owner||!Array.isArray(value.enrollments)||value.enrollments.length!==owned.length
    ||!Array.isArray(value.courses))bad('workspace does not match the caller');
  for(const row of owned){
    const expected=row.course_id===courseA.id?courseA:courseB, matches=value.courses.filter(course=>course?.id===expected.id);
    if(matches.length!==1||Object.entries(expected).some(([key,field])=>matches[0][key]!==field)
      ||!value.enrollments.some(item=>item?.courseId===row.course_id&&normalizeTime(item.joinedAt)===row.joined_at))
      bad('native enrollment or linked catalog facts differ');
  }
  return {owner,enrollments:owned.map(row=>({courseId:row.course_id,joinedAt:row.joined_at,title:row.course_id===courseA.id?courseA.title:courseB.title}))};
}
