import {isDeepStrictEqual} from 'node:util';

// Literal source data from the two deployed outline migrations. Do not derive
// this oracle from the assistant reader, its selected rows, or its output.
const activities = [
  [9408, 1, 293399, '出席統計', 'attendance'],
  [9408, 1, 293395, '第一段影片', 'video'],
  [9408, 1, 293396, '第二段影片', 'video'],
  [9408, 1, 293397, '第三段影片', 'video'],
  [9408, 1, 293398, '第四段影片', 'video'],
  [9098, 1, 281284, '退撫儲金說明會(含退休)-陳協勝主任簡報', 'slides'],
  [9098, 1, 281285, '儲金會_新法宣導說明會-柳信泰講師簡報', 'slides'],
  [9098, 1, 281286, '第一段影片', 'video'],
  [9098, 1, 281287, '第二段影片', 'video'],
  [9098, 1, 281288, '第三段影片', 'video'],
  [9098, 1, 281289, '第四段影片', 'video'],
  [9098, 1, 281290, '第五段影片', 'video'],
  [9098, 1, 281291, '第六段影片', 'video'],
  [9098, 1, 281292, '第七段影片', 'video'],
  [9098, 1, 281293, '第八段影片', 'video'],
  [9098, 1, 281295, '出席統計', 'attendance'],
  [9098, 2, 281294, '課程回饋單', 'feedback'],
];
const sections = [[9408, 1, '課程主題'], [9098, 1, '課程主題'], [9098, 2, '課程回饋']];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const createdAt = '2026-11-14T00:00:00.000Z';
const variants = Object.freeze({videos:9408,slides:9098,crossed:9408,'mixed-enrollments':9098});
const fixturePrefix = 'elearningOutline:';
export function isOutlineFixtureKey(key) {
  return typeof key === 'string' && key.startsWith(fixturePrefix) && Object.hasOwn(variants,key.slice(fixturePrefix.length));
}
const migrations = Object.freeze(['20261115030000_elearning_course_outlines.sql', '20261115040000_elearning_activity_pages.sql']);
const activitiesFor = (courseId, section) => activities
  .filter(([course, position]) => course === courseId && position === section)
  .map(([, , id, title, purpose]) => ({id, title, purpose, kind: purpose === 'attendance' ? 'attendanceregister' : 'url'}));

/** This plan writes only per-owner access rows after an owner lease is proved. */
export function planPublishedOutlineAccess(owners, fixtureKey = 'elearningOutline:videos') {
  if (!Array.isArray(owners) || owners.length !== 2 || new Set(owners).size !== 2 || owners.some(owner => typeof owner !== 'string' || !uuid.test(owner))) {
    throw new Error('The outline fixture requires two distinct disposable owner IDs.');
  }
  if (!isOutlineFixtureKey(fixtureKey)) throw new Error('Unexpected outline fixture variant.');
  const first = variants[fixtureKey.slice(fixturePrefix.length)];
  return Object.freeze(owners.map((user_id, index) => Object.freeze({user_id, course_id:index ? (first === 9408 ? 9098 : 9408) : first, created_at:createdAt})));
}

export function assertOutlineFixtureRows(plan, rows) {
  if (!Array.isArray(plan) || plan.length !== 2 || ![9408,9098].includes(plan[0]?.course_id)
    || !isDeepStrictEqual(plan,planPublishedOutlineAccess(plan.map(row => row?.user_id),plan[0].course_id === 9408 ? 'elearningOutline:videos' : 'elearningOutline:slides')))
    throw new Error('Unexpected outline readback target.');
  if (!Array.isArray(rows) || rows.length !== plan.length || !plan.every(expected => rows.some(row => {
    if (!row || Object.keys(row).length !== 3) return false;
    const value = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
    return row.user_id === expected.user_id && row.course_id === expected.course_id && value === expected.created_at;
  }))) throw new Error('The saved outline access rows differ from the exact disposable-owner plan.');
}

/** Independently assert whether the caller received the outline they own access to. */
export function assertPublishedOutlineRead(plan, userId, courseId, payload) {
  assertOutlineFixtureRows(plan,plan);
  if (!plan.some(row => row.user_id === userId) || ![9408, 9098].includes(courseId)) {
    throw new Error('Unexpected outline readback target.');
  }
  const ownsAccess = plan.some(row => row.user_id === userId && row.course_id === courseId);
  const expected = {
    userId,
    courseId,
    sections: ownsAccess ? sections.filter(([course]) => course === courseId).map(([, position, title]) => ({
      position, title, activities: activitiesFor(courseId, position),
    })) : [],
  };
  if (!isDeepStrictEqual(payload, expected)) throw new Error('The native outline readback differs from the authored owner, course, section or activity facts.');
  return expected;
}

export function publishedOutlineCases() {
  const courseA = '/elearning/course/9408', courseB = '/elearning/course/9098';
  return [
    {id:'outline-videos',owner:0,courseId:9408,route:courseA,question:'Which videos are linked in this remote-learning course? List all four with their local links.',
      activities:[293395,293396,293397,293398],tools:['elearningOutline'],forbiddenActivities:[293399,281284,281294]},
    {id:'outline-feedback-and-slides',owner:1,courseId:9098,route:courseB,question:'Where are the slides and feedback form in this remote-learning course? Which section contains each?',
      activities:[281284,281285,281294],tools:['elearningOutline'],forbiddenActivities:[281286,281295,293395]},
    {id:'outline-follow-up-slides',owner:1,courseId:9098,route:'/',history:[{role:'user',content:'Show the remote-learning outline for course 9098.'}],question:'What about slides?',
      activities:[281284,281285],tools:['elearningOutline'],forbiddenActivities:[281286,281294,281295]},
    {id:'outline-mixed-enrollments',owner:1,courseId:9098,route:courseB,question:'What slides are linked in this remote-learning course, and what are my saved remote-learning enrollments?',
      activities:[281284,281285],tools:['elearningOutline','elearningEnrollments'],forbiddenActivities:[293399,281286,281294]},
    {id:'outline-crossed-access',owner:0,courseId:9098,route:courseB,question:'What slides are available to my account for remote-learning course 9098?',
      activities:[],tools:['elearningOutline'],forbiddenActivities:[281284,281285,281294],limit:'outline_access_or_content_unknown'},
  ].map(row => {
    const facts = row.activities.map(id => {
      const [courseId, position, , title, purpose] = activities.find(activity => activity[2] === id);
      return {id, title, purpose, section:sections.find(section => section[0] === courseId && section[1] === position)[2],
        path:`/elearning/course/${courseId}/activity/${id}`};
    });
    return {...row, facts, migrations};
  });
}

/** Grader expectations derived from the authored record and its independent local route. */
export function buildLiveOutlineCases() {
  const variantsById = {
    'outline-videos':'videos','outline-feedback-and-slides':'slides','outline-follow-up-slides':'slides',
    'outline-mixed-enrollments':'mixed-enrollments','outline-crossed-access':'crossed',
  };
  return publishedOutlineCases().map(row => {
    const links = row.facts.map(activity => activity.path);
    const facts = row.facts.map(activity => ({label:activity.title,kind:'text',values:[activity.title]}));
    if (row.id === 'outline-feedback-and-slides') {
      for (const [index,activity] of row.facts.entries()) {
        facts[index].fields = [{label:'section',labels:['in section','章節'],kind:'text',values:[activity.section]}];
      }
    }
    if (row.tools.includes('elearningEnrollments')) {
      facts.push({label:'course',kind:'text',values:['111-1遠距教學研習_20220902']});
      links.push('/elearning/my-courses');
    }
    const expected = {behavior:row.limit?'unavailable':'answer',...(row.limit?{limitation:true}:{}),facts,
      requiredTools:row.limit?[]:row.tools,requiredAttemptedTools:row.tools,allowedTools:row.tools,
      toolTerminalStates:Object.fromEntries(row.tools.map(tool => [tool,[row.limit?'unavailable':'complete']])),
      maxDistinctAttemptedTools:row.tools.length,requireToolExecution:true,forbidPublicResearch:true,localLinksOnly:true,noAction:true,
      requiredLinks:[`/elearning/course/${row.courseId}`,...links],
      requiredRecordLinks:row.facts.map(activity => ({label:activity.title,url:activity.path})),
      forbiddenLinks:row.forbiddenActivities.flatMap(id => [9408,9098].map(course => `/elearning/course/${course}/activity/${id}`)),
      forbiddenText:['Your attendance was confirmed','You completed the video','I downloaded your slides','You are officially enrolled',
        ...(row.limit?['No course activities exist','There are no slides','The course has no materials']:[])],
      requireUnchangedOwnedRecords:true,provenance:row.limit?null:'local',
      requiredText:row.limit?[{anyOf:['could not verify the outline','could not load the outline','outline is unavailable','access or stored outline content','access or saved content']}]:[],
    };
    return {id:'account:elearning-'+row.id,domain:'elearningOutline',route:row.route,question:row.question,
      ...(row.history?{history:row.history}:{}),language:'en',mode:'record',fixtureKey:fixturePrefix+variantsById[row.id],
      fixtureRequirement:'native_elearning_outline',expected,capability:{level:'native',gap:false,limitation:null}};
  });
}
