import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {assistantPageRoute} from '../../src/services/assistantPageRoute.js';
import {dtmAssignmentRoute} from '../../server/dtmAssignmentEvidenceIntent.js';
import {learningEntryRoute} from '../../server/learningEntryContract.js';

const location=(pathname='/campus-assistant',search='?embed=1',origin='https://stu.best')=>({origin,pathname,search});
const host=parent=>({location:location(),parent});

test('standalone assistants retain their own pathname and query, without a hash',()=>{
  const current={location:{...location('/school-affairs/services/12-4','?course=course-one'),hash:'#private-token'}};
  assert.equal(assistantPageRoute(false,current),'/school-affairs/services/12-4?course=course-one');
  assert.equal(assistantPageRoute(false,null),'');
});

test('embedded assistants use their same-origin host path and exact query identity',()=>{
  const current=host({location:location('/latestnews-single/','?id=212034')});
  assert.equal(assistantPageRoute(true,current),'/latestnews-single/?id=212034');
  current.parent.location.search='?id=234368';
  assert.equal(assistantPageRoute(true,current),'/latestnews-single/?id=234368','Context is refreshed at submission, not cached across navigation.');
  current.parent.location=location('/%E5%9C%A8%E6%A0%A1%E5%AD%B8%E7%94%9F/','');
  assert.equal(assistantPageRoute(true,current),'/%E5%9C%A8%E6%A0%A1%E5%AD%B8%E7%94%9F/');
});

test('copied DTM course routes reach exact native readers without changing legacy sign-in context',()=>{
  const course='45000000-0000-4000-8000-000000000003',assignment='45000000-0000-4000-8000-000000000005';
  const root='/school-sites/dtm.stu.edu.tw',leaf='/course/'+course+'/assignment/'+assignment;
  const route=assistantPageRoute(false,{location:location(root+leaf+'/edit','')});
  assert.deepEqual(dtmAssignmentRoute(route),{courseId:course,assignmentId:assignment,url:'/dtm'+leaf});
  const report='/course/'+course+'/grades/overview';
  assert.equal(assistantPageRoute(true,host({location:location(root+report,'?mode=review')})),'/dtm'+report+'?mode=review');
  for(const path of [root+'/',root+'/login/index.php']){
    const context=assistantPageRoute(false,{location:location(path,'')});
    assert.equal(context,path);
    assert.equal(learningEntryRoute(context)?.platform,'dtm');
  }
  for(const path of [root+'/grade/report/overview/index.php',root+'.invalid'+leaf])
    assert.equal(assistantPageRoute(false,{location:location(path,'?id=42')}),path+'?id=42');
});

test('same-origin parent is ignored when the assistant is not embedded',()=>{
  const current=host({location:location('/unrelated-parent/','?id=1')});
  assert.equal(assistantPageRoute(false,current),'/campus-assistant?embed=1');
});

test('cross-origin parent origin and blocked location access both use the own-page fallback',()=>{
  assert.equal(assistantPageRoute(true,host({location:location('/private/','?record=secret','https://other.invalid')})),'/campus-assistant?embed=1');
  const blocked=host({get location(){throw new DOMException('Blocked a frame from accessing a cross-origin frame','SecurityError');}});
  assert.equal(assistantPageRoute(true,blocked),'/campus-assistant?embed=1');
  const blockedParent={location:location(),get parent(){throw new Error('Unavailable parent');}};
  assert.equal(assistantPageRoute(true,blockedParent),'/campus-assistant?embed=1');
});

test('opaque origins, missing parents and top-level embeds cannot supply another page context',()=>{
  for(const origin of ['null',''])assert.equal(assistantPageRoute(true,{location:location('/campus-assistant','?embed=1',origin),parent:{location:location('/private/','',origin)}}),'/campus-assistant?embed=1');
  const self={location:location()};self.parent=self;
  assert.equal(assistantPageRoute(true,self),'/campus-assistant?embed=1');
  assert.equal(assistantPageRoute(true,{location:location()}),'/campus-assistant?embed=1');
});

test('context handling never reads referrer, parent document or fragment data',()=>{
  const parent={location:{...location('/real-page/','?id=9'),get hash(){throw new Error('No fragment access');}},get document(){throw new Error('No document access');}};
  const current={...host(parent),get document(){throw new Error('No referrer access');}};
  assert.equal(assistantPageRoute(true,current),'/real-page/?id=9');
});

test('PublicAssistant supplies the route helper to the existing authenticated/anonymous request flow',()=>{
  const source=readFileSync(new URL('../../src/features/public/PublicAssistant.tsx',import.meta.url),'utf8');
  assert.match(source,/import\s*\{assistantPageRoute\}\s*from ['"]\.\.\/\.\.\/services\/assistantPageRoute\.js/);
  assert.match(source,/const route\s*=\s*assistantPageRoute\(embedded\)/);
  assert.match(source,/askWebsiteAssistant\(\{userId:user\?\.id,question,history:messages,signal:controller\.signal,images:attached,route,onProgress,preferences:commands\.preferences\}\)/);
  const transport=readFileSync(new URL('../../src/services/websiteAssistant.ts',import.meta.url),'utf8');
  assert.match(transport,/askSchoolAffairsAssistant\(/);
  assert.match(transport,/askCampusAssistant\(/);
});
