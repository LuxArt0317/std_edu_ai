import assert from 'node:assert/strict';
import test from 'node:test';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {elearningPath,elearningGuide,elearningQuestion,elearningOutlineCourse,elearningOutlineFilter,elearningCourseLocation,elearningActivityPath,elearningActivityUrl,isElearningOutline} from '../../server/elearningContract.js';
import {schoolServiceEntries} from '../../src/features/public/affairs/studentServices.js';
import {localSchoolHref} from '../../src/features/public/mirror/paths.ts';

test('archive and DTM have separate local entry routes and chat intents',()=>{
  assert.equal(schoolServiceEntries.find(x=>x.id==='4-2')?.localUrl,elearningPath);
  assert.equal(localSchoolHref('https://elearning.stu.edu.tw/login/index.php'),elearningPath+'/login');
  assert.equal(localSchoolHref('https://elearning.stu.edu.tw/course/index.php?categoryid=25'),elearningPath+'/category/25');
  assert.equal(localSchoolHref('https://dtm.stu.edu.tw/login/index.php'),'/dtm/login');
  assert.equal(elearningQuestion('What are my DTM assignments?'),null);
  assert.equal(elearningQuestion('What are my assignments in e-learning?'),'records');
  assert.equal(elearningQuestion('What assignments are due?','/elearning/course/9718'),'records');
  assert.equal(elearningQuestion('What are my DTM grades?','/elearning'),null);
  assert.equal(elearningQuestion('What are my courses?','/elearning/course/9718'),'mine');
  assert.equal(elearningQuestion('Write code for my e-learning courses'),null);
  assert.equal(elearningQuestion('What are my courses?','/dtm'),null);
});

test('outline questions bind to a specific remote-learning course and exact activity destinations',()=>{
  assert.equal(elearningOutlineCourse('What videos are listed?','/elearning/course/9408'),9408);
  assert.equal(elearningOutlineCourse('這門課有哪些教材？','/elearning/course/9098#anything'),9098);
  assert.equal(elearningOutlineCourse('What videos are listed?','/dtm/course/9408'),null);
  assert.equal(elearningOutlineCourse('What videos are listed?','/elearning/course/9408/grades'),null);
  assert.equal(elearningOutlineCourse('What is my attendance?','/elearning/course/9408'),null);
  const resource=elearningActivityPath(9098,281294);
  assert.deepEqual(elearningCourseLocation(resource),{courseId:9098,activityId:281294});
  assert.equal(elearningCourseLocation(resource+'/extra'),null);
  assert.equal(elearningCourseLocation('/elearning/course/9408/activity/2147483648'),null);
  assert.equal(elearningOutlineCourse('Where can I find the feedback form?',resource),9098);
  assert.equal(elearningOutlineFilter('Where can I find the feedback form?'),'feedback');
  assert.equal(elearningOutlineFilter('What videos are listed?'),'video');
  const activity={id:293399,kind:'attendanceregister',title:'出席統計'};
  assert.equal(elearningActivityUrl(activity),'https://elearning.stu.edu.tw/mod/attendanceregister/view.php?id=293399');
  assert.equal(elearningActivityUrl({...activity,kind:'../url'}),null);
  const outline={courseId:9408,userId:'caller',sections:[{title:'課程主題',position:1,activities:[activity]}]};
  assert.ok(isElearningOutline(outline,'caller',9408));
  assert.equal(isElearningOutline(outline,'different',9408),false);
  assert.equal(isElearningOutline(outline,'caller',9098),false);
  assert.equal(isElearningOutline({...outline,sections:[{title:'課程主題',position:1,activities:[{...activity,purpose:'video'}]}]},'caller',9408),false);
});

test('guest archive questions get a local link before public retrieval',async()=>{
  const fail=()=>{throw new Error('Unexpected retrieval');};
  const handler=createResearchAssistantHandler({readSources:fail,loadPublicPage:fail});
  for(const [question,route,expected] of [
    ['Where is the remote-learning Moodle?',undefined,elearningPath],
    ['數位學園入口在哪？',undefined,elearningPath],
    ['What are my courses?',elearningPath,elearningPath+'/login'],
    ['Show the course outline',elearningPath+'/course/9408',elearningPath+'/login?next=%2Felearning%2Fcourse%2F9408'],
    ['What videos are listed?',elearningActivityPath(9408,293395),elearningPath+'/login?next=%2Felearning%2Fcourse%2F9408'],
    ['Where can I find the feedback form?',elearningActivityPath(9098,281294),elearningPath+'/login?next=%2Felearning%2Fcourse%2F9098'],
  ]){
    let code=0,reply:ReturnType<typeof elearningGuide>|undefined;
    const response={status(value:number){code=value;return response;},json(value:unknown){reply=value as typeof reply;},setHeader(){}};
    await handler({method:'POST',headers:{'x-real-ip':'203.0.113.25'},body:{question,route}},response);
    assert.equal(code,200);
    assert.equal(reply?.citations[0].url,expected,question);
    assert.equal(reply?.grounding?.webSearched,false);
  }
});
