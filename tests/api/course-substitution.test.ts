import assert from 'node:assert/strict';
import test from 'node:test';
import {answerCourseSubstitution,lookupCourseSubstitution,parseSubstitutionResults,serveCourseSubstitution} from '../../server/courseSubstitution.js';
import {answerCampusNavigation} from '../../server/schoolAffairsDirectory.js';
import {courseSubstitutionQuestion,substitutionSource,type SubstitutionResult} from '../../src/features/public/affairs/courseSubstitution.js';

const selection={year:'110',trackKey:'1',departmentCode:'01'};
const context={year:'110',track:'四技日間部',department:{code:'01',name:'資管系'}};
const form='<select id="crsYear"><option value="110">110</option></select><select id="NDIDName"><option value="trackToken">四技日間部</option></select><input id="ajaxType" value="lookupToken"><input id="actionType" value="searchToken">';
const html=(rows:string,year='110')=>`<div id="vdata"><table class="master"><caption>屆別：${year}　學制：四技日間部　開課單位：資管系</caption><tbody>${rows}</tbody></table></div>`;
const original=(code:string,detail:string)=>`<tr><td>${code}</td><td>程式設計Ⅰ</td><td>1</td><td></td></tr><tr><td colspan="4"><table><tbody>${detail}</tbody></table></td></tr>`;
const grouped='<tr><td rowspan="2">1</td><td>IMU07201</td><td>程式設計</td><td>3</td><td>必</td><td>公告</td></tr><tr><td>IMU17201</td><td>實作</td><td>0</td><td>選</td><td></td></tr><tr><td>2</td><td>IMU07303</td><td>資料結構</td><td>2</td><td>必</td><td></td></tr>';
const page=(body:string)=>new Response(body,{headers:{'content-type':'text/html; charset=utf-8'}});

test('results preserve alternative groups and distinguish blank detail, explicit none and an empty cohort',()=>{
  const rows=parseSubstitutionResults(html(original('IMU07302',grouped)+original('IMU07402','')+
    original('IMU08002','<tr><td colspan="6">無替代科目資料！</td></tr>')),context);
  assert.deepEqual(rows.map(row=>row.detailStatus),['listed','unlisted','none']);
  assert.deepEqual(rows[0].groups.map(group=>group.courses.map(row=>row.credits)),[['3','0'],['2']]);
  assert.deepEqual(parseSubstitutionResults(html('<tr><th colspan="4">查無資料，請重新選擇！</th></tr>'),context),[]);
  for(const body of [html('', '115'),html(''),html(original('IMU07302',grouped.replace('rowspan="2"','rowspan="3"'))),
    html(original('IMU07302','')+original('IMU07302','')),html('<tr><td>unknown</td></tr>')]) {
    assert.throws(()=>parseSubstitutionResults(body,context));
  }
});

test('lookup resolves exact department code and submits only the fixed university source form',async()=>{
  const requests:string[]=[];
  const result=await lookupCourseSubstitution(selection,{
    fetchSource:async (url,init)=>{
      requests.push(String(url));
      assert.equal(init?.redirect,'error');
      if (requests.length===1) return page(form);
      if (requests.length===2) {
        assert.match(String(url),/ajaxGetSectionData\.asp$/);
        assert.deepEqual(Object.fromEntries(init?.body as URLSearchParams),{ajaxType:'lookupToken',term:'01'});
        return Response.json([{idcode:'101',value:'其他系'},{idcode:'01',value:'資管系'}]);
      }
      assert.equal(url,substitutionSource);
      assert.equal(init?.method,'POST');
      assert.deepEqual(Object.fromEntries(init?.body as URLSearchParams),{
        crsYear:'110',NDIDName:'trackToken',Sname:'資管系',Secno:'01',ajaxType:'lookupToken',actionType:'searchToken',btnSubmit:'查詢',
      });
      return page(html(original('IMU07302',grouped)));
    },
    readSaved:async()=>{throw new Error('Unexpected fallback');},
  });
  assert.equal(result.source,'live');
  assert.equal(result.courses[0].groups.length,2);
  assert.equal(requests.length,3);
});

test('upstream failures consult an exact snapshot and missing evidence propagates as unavailable',async()=>{
  const saved:SubstitutionResult={...context,source:'snapshot',checkedOn:'2026-11-14',courses:[]};
  assert.equal(await lookupCourseSubstitution(selection,{
    fetchSource:async()=>new Response(null,{status:451}),
    readSaved:async query=>{assert.deepEqual(query,selection);return saved;},
  }),saved);
  await assert.rejects(lookupCourseSubstitution(selection,{
    fetchSource:async()=>new Response(null,{status:451}),
    readSaved:async()=>{throw Error('No verified snapshot');},
  }),/No verified snapshot/);
});

test('public API rejects invalid methods, repeated filters and account selectors',async()=>{
  for(const [method,query,status] of [
    ['POST',{scope:'course-substitution'},405],
    ['GET',{scope:'course-substitution',year:['110','111'],track:'1',department:'01'},400],
    ['GET',{scope:'course-substitution',year:'110',track:'1',department:'01',user_id:'x'},400],
    ['GET',{scope:'course-substitution-departments',term:'https://example.invalid'},400],
  ] as const) {
    let code=0;
    await serveCourseSubstitution({method,query:query as Record<string,string|string[]>},{
      setHeader(){},status(next){code=next;return {json(){}};},
    });
    assert.equal(code,status);
  }
});

test('assistant exact lookup cites the matching local result and preserves group semantics',async()=>{
  const question='Course substitutions for IMU07302, cohort 110, track 1, department 01';
  const matched=courseSubstitutionQuestion(question)!;
  assert.deepEqual(matched,{...selection,code:'IMU07302'});
  assert.deepEqual(courseSubstitutionQuestion('What replaces IMU07302?','/school-affairs/services/12-8/results/110/1/01'),matched);
  assert.equal(courseSubstitutionQuestion('What replaces IMU07302?','/dtm'),null);
  assert.equal(courseSubstitutionQuestion('What replacement counts toward my degree?'),null);
  assert.equal(answerCampusNavigation('Where is the course substitution search?')?.citations[0].url,'/school-affairs/services/12-8');
  const answer=await answerCourseSubstitution(matched,question,async()=>({
    ...context,source:'snapshot',checkedOn:'2026-11-14',courses:parseSubstitutionResults(html(original('IMU07302',grouped)),context),
  })) as {answer:string;citations:{url:string}[]};
  assert.match(answer.answer,/Saved university result/);
  assert.match(answer.answer,/IMU07201/);
  assert.match(answer.answer,/All courses within the chosen group/);
  assert.equal(answer.citations[0].url,'/school-affairs/services/12-8/results/110/1/01#course-IMU07302');
});
