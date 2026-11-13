import assert from 'node:assert/strict';
import {test} from 'node:test';
import {answerGraduationReview,selectGraduationReviewCourses} from '../../server/graduationReview.js';
import {answerAcademicGrades} from '../../server/academicGrades.js';
import {answerAcademicAttendance} from '../../server/academicAttendance.js';
import {accountRecordViews,nativeAccountQuery} from '../../server/accountRecordViews.js';
import {accountEvidence} from '../../server/answerVerificationAccount.js';

const route='/school-affairs/services/13-1/graduation';
const status=(text:string|null)=>({text,indicator:null});
const actual=(id:string,title:string)=>({id,title,sequenceText:'1',credits:0,requiredElectiveText:null,yearText:null,transferText:null});
const fixture=():any=>{
  const report={id:'modern',userId:'owned',reportKind:'academic_services',sourceMode:'local_demo',version:1,reportedAt:null,
    identity:{},educationProgram:status('N'),foreignLanguageCompletion:status('N'),englishRequirement:status('Pending'),graduationReview:{...status('Review pending'),note:null},
    languageRequirements:[{id:'language',label:'Language rule',requiredCredits:8,matchedCredits:0,missingCredits:7.5,status:status('Pending')}],
    categories:[{id:'required',label:'Required category',requiredCredits:12,completedCredits:9,matchedCredits:6,excludedCredits:2,detailSubtotalCredits:2.5,status:status('Pending'),
      requirements:[{id:'requirement',title:'Required studio',moduleText:'Studio module',credits:3,indicator:null,matchedCourses:[actual('match','Completed studio')]}]},
      {id:'empty',label:'Empty category',requiredCredits:null,completedCredits:0,matchedCredits:null,excludedCredits:null,detailSubtotalCredits:null,status:status(null),requirements:[]}],
    otherCourses:[actual('other','Independent elective')]};
  return {checkedAt:'2026-11-13T01:00:00Z',profile:{userId:'owned',role:'student'},courses:[],assignments:[],tasks:[],requests:[],charges:[],announcements:[],dtm:{courses:[]},
    academicGrades:{records:[],termSummaries:[],rankings:[],metadata:[]},academicAttendance:{statistics:[],details:[],metadata:[]},
    graduationReview:{reports:[report,{...structuredClone(report),id:'legacy',reportKind:'legacy',graduationReview:{...status('LEGACY PRIVATE'),note:null}},
      {...structuredClone(report),id:'foreign',userId:'foreign',graduationReview:{...status('FOREIGN PRIVATE'),note:null}}]}};
};
const read=(data:any,question:string)=>{
  const context={question,route};
  return {draft:answerGraduationReview(question,data,route)!.answer,view:accountRecordViews(data,['graduationReview'],context)[0],
    evidence:JSON.parse(accountEvidence(data,['graduationReview'],context).find(row=>row.id==='account:graduationReview')!.content)};
};

test('generic required-course details agree across draft, evidence and view without other-course expansion',()=>{
  const data=fixture(),before=JSON.stringify(data);
  for(const question of ['Show my graduation credit review and required course details','顯示我的畢業學分檢核及應修課程明細']){
    const {draft,view,evidence}=read(data,question);
    assert.match(draft,/Required studio/);assert.match(draft,/Completed studio/);
    assert.doesNotMatch(draft,/Independent elective|LEGACY PRIVATE|FOREIGN PRIVATE|administrator|管理員/);
    assert.equal(evidence.selection.courseScope,'required_course_rows_and_matches');
    assert.deepEqual(evidence.records.requirements.map((row:any)=>row.title),['Required studio']);
    assert.deepEqual(evidence.records.matchedCourses.map((row:any)=>row.title),['Completed studio']);
    assert.deepEqual(evidence.records.otherCourses,[]);
    assert.equal(evidence.records.matchedCourses[0].requirementId,'requirement');
    assert.equal(evidence.records.matchedCourses[0].categoryId,'required');
    assert.equal(evidence.records.matchedCourses[0].reportId,'modern');
    assert.equal(view.total,9);assert.equal(view.rows.length,9);assert.match(view.note,/9\/9 rows shown/);
    assert.equal(view.rows.filter(row=>row[1]==='Required course').length,1);
    assert.equal(view.rows.filter(row=>row[1]==='Matched course').length,1);
    assert.doesNotMatch(JSON.stringify(view),/Independent elective|LEGACY PRIVATE|FOREIGN PRIVATE/);
    assert.equal(evidence.records.categories[0].detailSubtotalCredits,2.5);
    assert.equal(evidence.records.categories[1].requiredCredits,null);assert.equal(evidence.records.categories[1].completedCredits,0);
    assert.equal(evidence.records.languageRequirements[0].missingCredits,7.5);
    const count=evidence.records.counts.find((row:any)=>row.collection==='otherCourses');
    assert.equal(count.matchingRows,0);assert.equal(count.includedRows,0);
  }
  assert.equal(JSON.stringify(data),before);
});

test('broad, matched-only, other-only and status requests keep distinct selected course row scopes',()=>{
  for(const [question,scope,counts,total] of [
    ['Show all graduation course details','all_course_rows',[1,1,1],10],
    ['Show my graduation matched course details','matched_course_rows_and_parent_context',[1,1,0],9],
    ['Show my graduation other actual course details','other_course_rows',[0,0,1],8],
    ['Show my graduation review status','summary_only',[0,0,0],7],
  ] as const){
    const {draft,view,evidence}=read(fixture(),question);
    assert.equal(evidence.selection.courseScope,scope);
    assert.deepEqual(['requirements','matchedCourses','otherCourses'].map(key=>evidence.records[key].length),[...counts]);
    assert.equal(view.total,total);assert.equal(view.rows.length,total);
    if(scope==='summary_only')assert.doesNotMatch(draft,/Required studio|Completed studio|Independent elective/);
    if(scope==='other_course_rows')assert.doesNotMatch(draft,/Required studio|Completed studio/);
    if(scope==='matched_course_rows_and_parent_context')assert.equal(view.rows.find(row=>row[2]==='Required studio')?.[1],'Parent requirement');
  }
});

test('named children keep only exact composite parents and consistent named-versus-context counts',()=>{
  const data=fixture();
  data.graduationReview.reports[0].categories.push({...structuredClone(data.graduationReview.reports[0].categories[0]),id:'other-category',label:'Unrelated category',
    requirements:[{id:'requirement',title:'Wrong parent',credits:99,indicator:null,matchedCourses:[actual('match','Unrelated child')]}]});
  const {draft,view,evidence}=read(data,'Show my graduation course details for Completed studio');
  assert.match(draft,/Named course rows shown: 1 of 1 matches; 1 parent requirement rows shown/);
  assert.doesNotMatch(draft,/Wrong parent|Unrelated child|Independent elective/);
  assert.deepEqual(evidence.records.requirements.map((row:any)=>[row.title,row.categoryId]),[['Required studio','required']]);
  assert.equal(view.total,7);assert.match(view.note,/Named course rows and their parent context/);
  const selection=selectGraduationReviewCourses('Matched courses',{requirements:[{id:'r',categoryId:'c',reportId:'right',title:'Right'},
    {id:'r',categoryId:'c',reportId:'wrong',title:'Wrong'}],matchedCourses:[{id:'m',requirementId:'r',categoryId:'c',reportId:'right',title:'Child'}]});
  assert.deepEqual(selection.requirements.map(row=>row.title),['Right']);
});

test('generic view caps rendered rows at twelve and reports the selected count without mutating saved rows',()=>{
  const data=fixture(),requirements=data.graduationReview.reports[0].categories[0].requirements;
  data.graduationReview.reports[0].categories[0].requirements=Array.from({length:15},(_,i)=>({...requirements[0],id:`required-${i}`,title:`Studio ${i}`,
    matchedCourses:[actual(`match-${i}`,`Completed studio ${i}`)]}));
  const before=JSON.stringify(data),{draft,view,evidence}=read(data,'Show my graduation required course details');
  assert.equal(view.total,37);assert.equal(view.rows.length,12);assert.match(view.note,/12\/37 rows shown/);
  assert.match(draft,/Course-detail rows shown: 20 of 30/);assert.match(draft,/shows only part of the report/);
  for(const key of ['requirements','matchedCourses']){
    const count=evidence.records.counts.find((row:any)=>row.collection===key);
    assert.equal(count.matchingRows,15);assert.equal(count.includedRows,evidence.records[key].length);
    assert.ok(count.includedRows<=15);assert.equal(count.partial,count.includedRows<15);
  }
  assert.equal(evidence.selection.fullReportCourseRows,31);
  assert.deepEqual(evidence.records.otherCourses,[]);assert.equal(JSON.stringify(data),before);
});

test('directly named requirements include exact saved matches without borrowing another report or category',()=>{
  const data=fixture(),modern=data.graduationReview.reports[0],requirement=modern.categories[0].requirements[0];
  requirement.title='Database requirement';requirement.matchedCourses[0].title='Database Design';
  modern.categories.push({...structuredClone(modern.categories[0]),id:'different-category',label:'Different category',
    requirements:[{...structuredClone(requirement),title:'Different requirement',matchedCourses:[actual('match','WRONG CATEGORY COURSE')]}]});
  data.graduationReview.reports[1].categories[0].requirements[0].title='Database requirement';
  data.graduationReview.reports[1].categories[0].requirements[0].matchedCourses[0].title='WRONG REPORT COURSE';
  data.graduationReview.reports[2].categories[0].requirements[0].title='Database requirement';
  data.graduationReview.reports[2].categories[0].requirements[0].matchedCourses[0].title='FOREIGN COURSE';
  const before=JSON.stringify(data),{draft,view,evidence}=read(data,'Which course matches my Database requirement in the graduation report?');
  assert.match(draft,/Matched course Database Design: credits 0; matched to Database requirement/);
  assert.match(draft,/Named course rows shown: 1 of 1 matches; 0 parent requirement rows shown; 1 linked matched-course rows shown/);
  assert.deepEqual(evidence.selection.namedCourseRows,{requirements:1,matchedCourses:0,otherCourses:0});
  assert.deepEqual(evidence.selection.linkedCourseRows,{requirements:0,matchedCourses:1,otherCourses:0});
  assert.deepEqual(evidence.records.matchedCourses.map((row:any)=>[row.title,row.reportId,row.categoryId,row.requirementId]),[['Database Design','modern','required','requirement']]);
  assert.equal(view.rows.find(row=>row[2]==='Database requirement')?.[1],'Required course');
  assert.equal(view.rows.find(row=>row[2]==='Database Design')?.[1],'Matched course');
  assert.equal(view.total,7);assert.match(view.note,/named requirements also include linked matches/);
  for(const result of [draft,JSON.stringify(view),JSON.stringify(evidence)])assert.doesNotMatch(result,/WRONG CATEGORY COURSE|WRONG REPORT COURSE|FOREIGN COURSE|Independent elective/);
  assert.equal(JSON.stringify(data),before);
});

test('a parent added for a named matched course does not expand to its unrequested siblings',()=>{
  const data=fixture();data.graduationReview.reports[0].categories[0].requirements[0].matchedCourses.push(actual('sibling','Unrequested sibling'));
  const {draft,view,evidence}=read(data,'Show my graduation course details for Completed studio');
  assert.deepEqual(evidence.records.matchedCourses.map((row:any)=>row.title),['Completed studio']);
  assert.deepEqual(evidence.selection.namedCourseRows,{requirements:0,matchedCourses:1,otherCourses:0});
  assert.deepEqual(evidence.selection.linkedCourseRows,{requirements:1,matchedCourses:0,otherCourses:0});
  assert.match(draft,/1 parent requirement rows shown; 0 linked matched-course rows shown/);
  for(const result of [draft,JSON.stringify(view),JSON.stringify(evidence)])assert.doesNotMatch(result,/Unrequested sibling/);
});

test('a nested parent title inside an English or Chinese child title is context rather than a requirement-wide request',()=>{
  for(const [parent,child,sibling,childQuestion,parentQuestion,bothQuestion] of [
    ['Database','Database Design','Algorithms','Show my graduation course details for Database Design',
      'Show my graduation course details for requirement Database','Show my graduation course details for Database Design and requirement Database'],
    ['資料庫','資料庫設計','演算法課程','顯示我的畢業檢核資料庫設計課程明細',
      '顯示我的畢業檢核應修課程資料庫','顯示我的畢業檢核資料庫設計及應修課程資料庫'],
  ]){
    const data=fixture(),requirement=data.graduationReview.reports[0].categories[0].requirements[0];
    requirement.title=parent;requirement.matchedCourses=[actual('child',child),actual('sibling',sibling)];
    const {draft,view,evidence}=read(data,childQuestion);
    assert.deepEqual(evidence.selection.namedCourseRows,{requirements:0,matchedCourses:1,otherCourses:0});
    assert.deepEqual(evidence.selection.linkedCourseRows,{requirements:1,matchedCourses:0,otherCourses:0});
    assert.deepEqual(evidence.records.matchedCourses.map((row:any)=>row.title),[child]);
    assert.equal(view.rows.find(row=>row[2]===parent)?.[1],'Parent requirement');
    for(const value of [draft,JSON.stringify(view),JSON.stringify(evidence)])assert.ok(!value.includes(sibling),value);
    for(const question of [parentQuestion,bothQuestion]){
      const expanded=read(data,question);
      assert.deepEqual(expanded.evidence.records.matchedCourses.map((row:any)=>row.title),[child,sibling]);
      assert.equal(expanded.evidence.selection.namedCourseRows.requirements,1);
      assert.equal(expanded.view.rows.find(row=>row[2]===parent)?.[1],'Required course');
      assert.ok(expanded.draft.includes(sibling));
    }
  }
});

test('a distinct named requirement expands only its own children beside a specifically named course',()=>{
  const data=fixture(),modern=data.graduationReview.reports[0],first=modern.categories[0].requirements[0];
  first.title='Database';first.matchedCourses=[actual('design','Database Design'),actual('algorithms','Algorithms')];
  modern.categories.push({...structuredClone(modern.categories[0]),id:'statistics-category',label:'Statistics category',requirements:[{
    ...structuredClone(first),id:'statistics-requirement',title:'Statistics',matchedCourses:[actual('linear','Linear Models')]}]});
  const {draft,view,evidence}=read(data,'Show my graduation course details for Database Design and requirement Statistics');
  assert.deepEqual(evidence.selection.namedCourseRows,{requirements:1,matchedCourses:1,otherCourses:0});
  assert.deepEqual(evidence.selection.linkedCourseRows,{requirements:1,matchedCourses:1,otherCourses:0});
  assert.deepEqual(evidence.records.matchedCourses.map((row:any)=>row.title),['Database Design','Linear Models']);
  assert.equal(view.rows.find(row=>row[2]==='Database')?.[1],'Parent requirement');
  assert.equal(view.rows.find(row=>row[2]==='Statistics')?.[1],'Required course');
  for(const value of [draft,JSON.stringify(view),JSON.stringify(evidence)])assert.ok(!value.includes('Algorithms'));
});

test('duplicate report kinds and absent caller still fail closed for generic detail requests',()=>{
  const data=fixture(),question='Show my graduation required course details';
  data.graduationReview.reports.push({...structuredClone(data.graduationReview.reports[0]),id:'duplicate'});
  const duplicate=read(data,question);assert.match(duplicate.draft,/Multiple saved records/);assert.equal(duplicate.view.total,0);
  const noOwner=fixture();delete noOwner.profile.userId;
  const result=read(noOwner,question);assert.match(result.draft,/no saved/);assert.equal(result.view.total,0);
  assert.deepEqual(nativeAccountQuery(noOwner,'graduationReview',{question,route})!.matching.requirements,[]);
});

test('native empty and clarification answers make no unproven maintainer assertion',()=>{
  const data=fixture();
  for(const answer of [answerAcademicGrades('Show my academic transcript',data)!.answer,
    answerAcademicAttendance('Show my current attendance statistics',data)!.answer,
    answerAcademicAttendance('顯示我的當學期缺曠課統計',data)!.answer,
    answerGraduationReview('Show my graduation status',data)!.answer]){
    assert.doesNotMatch(answer,/administrator|管理員/);
    assert.match(answer,/Local demonstration|站內示範/);
  }
  assert.match(answerAcademicAttendance('Show my current attendance statistics',data)!.answer,/not been explicitly designated/);
});
