import assert from 'node:assert/strict';
import test from 'node:test';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {elearningPath,elearningGuide,elearningQuestion} from '../../server/elearningContract.js';
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

test('guest archive questions get a local link before public retrieval',async()=>{
  const fail=()=>{throw new Error('Unexpected retrieval');};
  const handler=createResearchAssistantHandler({readSources:fail,loadPublicPage:fail});
  for(const [question,route,expected] of [
    ['Where is the remote-learning Moodle?',undefined,elearningPath],
    ['數位學園入口在哪？',undefined,elearningPath],
    ['What are my courses?',elearningPath,elearningPath+'/login'],
  ]){
    let code=0,reply:ReturnType<typeof elearningGuide>|undefined;
    const response={status(value:number){code=value;return response;},json(value:unknown){reply=value as typeof reply;},setHeader(){}};
    await handler({method:'POST',headers:{'x-real-ip':'203.0.113.25'},body:{question,route}},response);
    assert.equal(code,200);
    assert.equal(reply?.citations[0].url,expected);
    assert.equal(reply?.grounding?.webSearched,false);
  }
});
