import assert from 'node:assert/strict';
import test from 'node:test';
import {serveCurriculumMap} from '../../server/curriculumMapLookup.js';
import {answerCampusNavigation} from '../../server/schoolAffairsDirectory.js';
import {curriculumMapColleges,curriculumMapEntry,curriculumMapSource} from '../../src/features/public/affairs/curriculumMaps.js';

const query={scope:'curriculum-map',program:'1',year:'115',track:'L創新應用'};
const source=curriculumMapSource(curriculumMapEntry('1')!,'seccontent');
const html=(year='115')=>`<div id="content">
<select id="cmyear"></select><table><tr><td>核心能力指標</td></tr><tr><td>項次</td><td>能力</td></tr><tr><td>1</td><td>分析</td></tr></table>
<table><tr><td>${year}學年度 資管系 【創新應用】學程課程地圖</td></tr><tr><td>一上</td><td>一下</td></tr>
<tr><td><div class="course wf-pro" onclick="evil()">程式設計</div></td><td><div class="course wf-sec">網頁設計</div></td></tr></table>
</div>`;
function capture() {
  const result={status:0,body:undefined as unknown,headers:{} as Record<string,string>};
  return {result,response:{
    status(status:number){result.status=status;return this;},
    json(body:unknown){result.body=body;},
    setHeader(key:string,value:string){result.headers[key]=value;},
  }};
}

test('the public college catalog has 42 distinct maps and an exact local assistant destination',()=>{
  const entries=curriculumMapColleges.flatMap(college=>college.entries);
  assert.equal(curriculumMapColleges.length,4);
  assert.equal(new Set(entries.map(entry=>entry.id)).size,42);
  for(const entry of entries) {
    assert.equal(curriculumMapEntry(entry.id),entry);
    assert.match(curriculumMapSource(entry,'seccontent'),/^https:\/\/info\.stu\.edu\.tw\/ACA\/student\/CM\/seccontent\.asp\?[A-Za-z0-9+/=]+$/);
  }
  for(const question of ['Where can I find the curriculum maps?','課程地圖在哪裡？'])
    assert.equal(answerCampusNavigation(question)?.citations[0].url,'/school-affairs/services/12-7');
});

test('valid filters submit only the source selectors and return inert structured course data',async()=>{
  const {result,response}=capture();
  await serveCurriculumMap({method:'GET',query},response,async (input,init)=>{
    assert.equal(input,source);
    assert.equal(init?.method,'POST');
    assert.equal(init?.redirect,'error');
    assert.equal(init?.headers,undefined);
    assert.deepEqual(Object.fromEntries(init?.body as URLSearchParams),{cmyear:'115',cpname:'L創新應用'});
    return new Response(html(),{headers:{'content-type':'text/html; charset=utf-8'}});
  });
  assert.equal(result.status,200);
  assert.deepEqual(result.body,{
    title:'115學年度 資管系 【創新應用】學程課程地圖',
    tables:[[['核心能力指標'],['項次','能力'],['1','分析']]],
    semesters:[
      {label:'一上',courses:[{title:'程式設計',category:'required'}]},
      {label:'一下',courses:[{title:'網頁設計',category:'elective'}]},
    ],
  });
});

test('invalid methods, repeated selectors and arbitrary destinations stop before fetch',async()=>{
  for (const [method,input,status] of [
    ['POST',query,405],['GET',{...query,year:['115','114']},400],['GET',{...query,track:''},400],
    ['GET',{...query,track:'bad'},400],['GET',{...query,program:'https://example.invalid'},400],
    ['GET',{...query,owner:'someone'},400],
  ] as const) {
    const {result,response}=capture();
    let fetches=0;
    await serveCurriculumMap({method,query:{...input} as Record<string,string|string[]>},response,async()=>{
      fetches++;
      throw Error('Unexpected fetch');
    });
    assert.equal(fetches,0);
    assert.equal(result.status,status);
    assert.equal(result.headers['Cache-Control'],'no-store');
  }
});

test('wrong year, unavailable content and oversized responses fail with a retryable status',async()=>{
  for(const upstream of [
    new Response(html('114'),{headers:{'content-type':'text/html'}}),
    new Response('<form>Login</form>',{headers:{'content-type':'text/html'}}),
    new Response(html(),{headers:{'content-type':'application/json'}}),
    new Response(' '.repeat(512_001),{headers:{'content-type':'text/html'}}),
  ]) {
    const {result,response}=capture();
    await serveCurriculumMap({method:'GET',query},response,async()=>upstream);
    assert.equal(result.status,502);
    assert.equal(result.headers['Cache-Control'],'no-store');
  }
});
