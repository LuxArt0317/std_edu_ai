import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {micromark} from 'micromark';
import {formatSupplementalAccountAnswers as format,supplementalAnswerLimits,type SupplementalEvidenceResult} from '../../server/supplementalAccountAnswers.js';
import {readCatalogEvidence} from '../../server/accountCatalogEvidence.js';
import {readCertificateEvidence} from '../../server/accountCertificateEvidence.js';
import {readSubmissionEvidence,type SubmissionEvidencePayload} from '../../server/accountSubmissionEvidence.js';
import {readTuitionEvidence} from '../../server/accountTuitionEvidence.js';
import {readAidPaymentsEvidence} from '../../server/accountAidPaymentsEvidence.js';
import {readDtmGradeReportEvidence,unavailableDtmGradeReportEvidence} from '../../server/accountDtmGradeReportEvidence.js';
import {answerLinksSupported} from '../../server/answerVerificationModel.js';
import type {DtmGradeCells,DtmGradeReportData,DtmGradeReportOverviewData} from '../../server/dtmGradeReport.js';
import {aidPaymentsFields,aidPaymentsPaths} from '../../server/aidPaymentsContract.js';
import type {AidPaymentView} from '../../server/aidPaymentsContract.js';
import {newCourseOffering} from '../../src/features/public/affairs/courseCatalogModel.js';
import {newCourseSyllabus} from '../../src/features/public/affairs/courseSyllabusModel.js';

const id=(n:number)=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const owner=id(1),courseId=id(10),assignmentId=id(20),submissionId=id(30),currentId=id(40);
const account={user:{id:owner},url:'https://xiftudmvxphxcjtmfmib.supabase.co',token:'SECRET-CALLER',key:'SECRET-PUBLIC'};
const stamp='2026-11-10T03:00:00Z',later='2026-11-11T03:00:00Z';
const localAssignment=`/dtm/course/${courseId}/assignment/${assignmentId}`;
const summary=(n=1)=>({id:id(200+n),sequence:n,course_code:'CAT'+n,course_name:'Catalog course '+n,admission_name:'Day',instructor:'Teacher '+n,academicYearText:null,semesterText:'1'});
const offering=()=>({...newCourseOffering(),id:courseId,version:1,source_mode:'sample' as const,published:true,course_code:'CAT301',course_name:'Catalog Database',instructor:'Catalog Teacher',credits:0,room1:'C301',capacity:20,term_label:'Local first term',department_code:'IM',department_name:'Information Studies',classification_code:'IMU',admission_code:'1',admission_name:'Day',
  meetings:[{weekday:2,periods:['3','4']}],syllabus:{...newCourseSyllabus(),objectives:'Explain normalization.',grading:[{weight:0,methods:['1']},{weight:null,methods:[]},{weight:50,methods:['2']},{weight:50,methods:['3']}],weeks:newCourseSyllabus().weeks.map((week,index)=>({...week,...(index===17?{content:'Independent capstone presentation'}:{})}))}});
const detail=()=>readCatalogEvidence(account,{route:'/school-affairs/services/12-3?search_scope=current&keyword=CAT301&term=1151&department=IM&themes=1&searched=1&syllabus='+courseId,question:'Show the syllabus.',deadline:Date.now()+3000},{detail:async()=>({row:offering()})});
const catalog=(count=2,total=count)=>readCatalogEvidence(account,{query:{page_size:String(Math.max(1,count))},deadline:Date.now()+3000},{search:async()=>({scope:'historical',total,rows:Array.from({length:count},(_,i)=>summary(i+1)),page:0,pageSize:Math.max(1,count),hasMore:total>count,sort:{key:'course_code',direction:'asc'},revision:'a'.repeat(32)})});
const assessment=()=>({id:id(300),userId:owner,sourceMode:'local_demo',version:1,createdAt:stamp,updatedAt:stamp,academicYear:115,semester:1,hasPendingFees:'N',status:'blocked',resultText:'Await local review.',assessedAt:null,
  identity:{studentNumber:'QA-1',studentName:'Private Name',departmentName:'Private Department',yearText:'3',classLabel:'Private Class'}});
const certificate=(value:unknown=assessment(),question='Show my enrollment certificate status.')=>readCertificateEvidence(account,{question},{load:async()=>({assessments:value===null?[]:[value],documents:[]})});
const snapshot=()=>({profile:{userId:owner,role:'student'},officialUniversityData:false,assignments:[{id:assignmentId,title:'Reading response',dtmCourseId:courseId,userId:owner,sourceMode:'personal',status:'submitted',submittedAt:stamp}],dtm:{courses:[{id:courseId,title:'Database',code:'DB1',userId:owner,sourceMode:'personal'}]}});
const file=(upload=currentId,state='current',committedAt:string|null=stamp)=>({id:upload,filename:upload===currentId?'current.txt':'older.txt',sizeBytes:0,contentType:'text/plain',path:`${owner}/${submissionId}/${upload}`,state,expiresAt:later,committedAt});
const review=(upload=currentId)=>({id:id(50),user_id:owner,submission_id:submissionId,upload_id:upload,status:'graded',grade_text:'0',feedback:'Current feedback',reviewed_by:id(99),reviewed_at:later,version:1});
const workspace=()=>({assignmentId,userId:owner,courseId,dueAt:later,maxBytes:10485760,submission:{id:submissionId,user_id:owner,assignment_id:assignmentId,course_id:courseId,current_upload_id:currentId,version:2,submitted_at:stamp,content_modified_at:stamp,due_at_at_submission:null,created_at:stamp,source_mode:'local_submission'},files:[file()],reviews:[review()]});
const submission=(value:unknown=workspace())=>readSubmissionEvidence(account,{snapshot:snapshot(),question:'Was Reading response uploaded?'},{fetchImpl:async()=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}})});
const tuitionRow=(n=1,label='Saved period A',text:string|null='Recorded settlement difference TWD 730; pending review.')=>({id:id(500+n),userId:owner,sourceMode:'local_demo',version:1,createdAt:stamp,updatedAt:stamp,periodId:id(500+n),periodLabel:label,text,rowOrder:n});
const tuitionData=(rows=[tuitionRow()])=>({periods:rows.map(row=>({id:row.id,userId:owner,label:row.periodLabel})),settlements:rows,documents:[]});
const tuition=(value:unknown=tuitionData(),question='Show my tuition settlement statement.')=>readTuitionEvidence(account,{question,route:'/school-affairs/services/49-1'},{load:async()=>value});
const replacePayload=<T extends SupplementalEvidenceResult>(result:T,change:(payload:any)=>void):T=>{const copy=structuredClone(result),payload=JSON.parse(copy.evidence.content);change(payload);copy.evidence.content=JSON.stringify(payload);return copy;};
const aidRow=(view:AidPaymentView,n=1)=>view==='claims'?{id:id(700+n),reason:'Local library assistant claim',amount:0,approval_result:'',approval_status:'Pending'}
  :{id:id(700+n),...Object.fromEntries(aidPaymentsFields.salary.map(([key])=>[key,null])),appointment_type:'Campus assistant',payment_period:'November (literal)',gross:0,tax:-2,net:null,bank_last4:'0921'};
const aid=(question='Show my student aid claims and my student salary.',changed?:(view:AidPaymentView)=>unknown)=>readAidPaymentsEvidence(account,{question},{read:async(_,query)=>
  changed?changed(query.view):{userId:owner,view:query.view,total:1,rows:query.summary?[]:[aidRow(query.view)]}});
const gradeCells=():DtmGradeCells=>({score:null,maximum:null,gradeText:null,rangeText:null,percentageText:null,weightText:null,weightNote:null,rankText:null,feedbackText:null,contributionText:null});
const gradeCourse=(n=0,gradeText:string|null=null)=>({id:n?id(800+n):courseId,userId:owner,title:n?'Other local course '+n:'Local Database',code:n?'GD'+n:'GD101',term:'Literal saved term',gradeText});
const gradeOverview=(courses=[gradeCourse()]):DtmGradeReportOverviewData=>({courses,limit:100,nextCursor:null});
const gradeReport=():DtmGradeReportData=>({report:{id:id(900),userId:owner,courseId,sourceMode:'local_demo',version:2,createdAt:stamp,updatedAt:later,
  items:[{...gradeCells(),id:id(901),label:'Assessment 1',activityKind:'assignment',score:0,maximum:100,gradeText:'',weightText:'0.00 %',feedbackText:'Literal item feedback'}],
  total:{...gradeCells(),score:20,maximum:100,gradeText:'A — literal',percentageText:'not derived',rankText:'',feedbackText:'Explicit total feedback'}}});
const nativeGrade=(value: DtmGradeReportData=gradeReport(),overview=gradeOverview(),question='Show my Moodle grade report for GD101.')=>
  readDtmGradeReportEvidence(account,{question,route:'/dtm/course/'+courseId+'/grades'},{loadOverview:async()=>overview,loadReport:async()=>value});

test('native grade report formats literal item and independent saved total cells with exact own links',async()=>{
  const source=await nativeGrade(),before=structuredClone(source),out=format([source],{question:'Show my Moodle grade report feedback and weights.'});
  assert.deepEqual(source,before);assert.equal(out.complete,true);assert.equal(out.status,'answered');assert.deepEqual(out.sourceIds,['account:dtmGradeReport']);
  assert.deepEqual(out.views[0].rows,[['Assessment 1','(blank)','0.00 %','Literal item feedback'],
    ['Explicitly saved course total','A — literal','not recorded','Explicit total feedback']]);
  assert.ok(out.answer.includes('](/dtm/course/'+courseId+'/grades)'));assert.ok(!out.answer.includes('](/dtm/grades)'));
  assert.equal(answerLinksSupported(out.answer,[source.evidence]),true);
  assert.match(out.answer,/Numeric score metadata: ` 20 `/);assert.match(out.answer,/Displayed percentage text: ` not derived `/);
  assert.match(out.answer,/Displayed grade text: ` \(blank\) `/);assert.match(out.answer,/Displayed rank text: ` \(blank\) `/);
  assert.match(out.answer,/no declared source mode/);assert.match(out.answer,/not an official transcript/);
  assert.doesNotMatch(out.answer,/20%|you passed|GPA|\/assignment\//);assert.doesNotMatch(JSON.stringify(out),new RegExp(owner+'|'+id(900)+'|'+id(901)+'|SECRET-CALLER'));
});

test('native absent report, empty report items, absent total and null total mark remain distinct',async()=>{
  const missing=format([await nativeGrade({report:null})]);assert.match(missing.answer,/no saved native grade report for this selected course/);assert.equal(missing.views.length,0);
  const empty=gradeReport();empty.report!.items=[];empty.report!.total=null;
  const savedEmpty=format([await nativeGrade(empty)]);assert.match(savedEmpty.answer,/saved report has no selected item rows/);assert.match(savedEmpty.answer,/No course-total object is saved/);
  assert.doesNotMatch(savedEmpty.answer,/no saved native grade report/);assert.equal(savedEmpty.views[0].total,0);
  const nullMark=gradeReport();nullMark.report!.total!.gradeText=null;
  const savedNull=format([await nativeGrade(nullMark)]);assert.equal(savedNull.views[0].rows.at(-1)![1],'not recorded');
  assert.doesNotMatch(savedNull.answer,/No course-total object is saved|no saved native grade report/);
});

test('native overview null, blank and string zero do not establish missing reports or calculated totals',async()=>{
  const source=await nativeGrade(gradeReport(),gradeOverview([gradeCourse(0,null),gradeCourse(1,''),gradeCourse(2,'0')]),'Show all my Moodle course grades.');
  const out=format([source]);assert.deepEqual(out.views[0].rows.map(row=>row[3]),['not recorded','(blank)','0']);
  assert.match(out.answer,/A null mark does not establish/);assert.doesNotMatch(out.answer,/no saved native grade report|Numeric score metadata/);
  for(const c of [courseId,id(801),id(802)])assert.ok(out.answer.includes('](/dtm/course/'+c+'/grades)'));
});

test('native course ambiguity provides actual local choices without choosing a report or asserting its grades',async()=>{
  const source=await readDtmGradeReportEvidence(account,{question:'Show all my Moodle course feedback.'},{loadOverview:async()=>gradeOverview([gradeCourse(),gradeCourse(1,'0')]),loadReport:async()=>{throw Error('must not read');}});
  const out=format([source]);assert.equal(out.complete,false);assert.match(out.answer,/Choose one saved course/);
  assert.deepEqual(out.views[0].rows,[['Local Database','GD101','Literal saved term'],['Other local course 1','GD1','Literal saved term']]);
  assert.ok(out.answer.includes('](/dtm/course/'+id(801)+'/grades)'));assert.doesNotMatch(out.answer,/Displayed grade text|Numeric score metadata/);
  const absent=format([await nativeGrade(gradeReport(),gradeOverview(),'Show my Moodle grade report for GD999.')]);
  assert.equal(absent.complete,false);assert.match(absent.answer,/No exact saved course was selected/);assert.ok(absent.answer.includes('](/dtm/grades)'));
});

test('native unavailable fallback and failed detail reads never become absence or fall back to tracker marks',async()=>{
  const fallback=format([unavailableDtmGradeReportEvidence('deadline_exceeded')]);assert.equal(fallback.status,'abstained');assert.equal(fallback.complete,false);
  assert.match(fallback.answer,/contents and absence remain unknown/);assert.doesNotMatch(fallback.answer,/no saved native grade report|returned no saved courses/);
  const failed=await readDtmGradeReportEvidence(account,{question:'Show my Moodle report grades for GD101.'},{loadOverview:async()=>gradeOverview(),loadReport:async()=>{throw Error('PRIVATE FAILURE');}});
  const out=format([failed]);assert.equal(out.status,'abstained');assert.ok(out.answer.includes('](/dtm/course/'+courseId+'/grades)'));
  assert.doesNotMatch(out.answer,/PRIVATE FAILURE|no saved native grade report/);
});

test('native report, course choices and unavailable answers only emit links supplied by their exact reader evidence',async()=>{
  const inputs=[await nativeGrade(),await nativeGrade({report:null}),
    await nativeGrade(gradeReport(),gradeOverview([gradeCourse(),gradeCourse(1)]),'Show all my Moodle course grades.'),
    await readDtmGradeReportEvidence(account,{question:'Show all my Moodle course feedback.'},{loadOverview:async()=>gradeOverview([gradeCourse(),gradeCourse(1)])}),
    await readDtmGradeReportEvidence(account,{question:'Show my Moodle report for GD101.'},{loadOverview:async()=>gradeOverview(),loadReport:async()=>{throw Error('unavailable');}}),
    unavailableDtmGradeReportEvidence('deadline_exceeded')];
  for(const source of inputs){
    const output=format([source]);assert.equal(answerLinksSupported(output.answer,[source.evidence]),true);
    if(source.evidence.url!=='/dtm/grades')assert.ok(!output.answer.includes('](/dtm/grades)'));
    for(const view of output.views)assert.ok(source.evidence.urls!.includes(view.url));
  }
});

test('native named item selection retains its scope and explicit omission does not become an absent total',async()=>{
  const record=gradeReport();record.report!.items.push({...record.report!.items[0],id:id(902),label:'Assessment 2',feedbackText:'Second feedback'});
  const source=await nativeGrade(record,gradeOverview(),'Show my Moodle report feedback for Assessment 2 in GD101.');
  const out=format([source]);assert.match(out.answer,/named matching items; 1 included \/ 1 selected/);assert.match(out.answer,/2 saved report items available/);
  assert.doesNotMatch(out.answer,/Literal item feedback/);assert.match(out.answer,/Second feedback/);
  const omitted=replacePayload(source,p=>{p.report.total=null;p.report.totalIncluded=false;p.complete=false;p.excerpted=true;p.unavailableReason='evidence_limit';});
  omitted.reason='evidence_limit';const limited=format([omitted]);assert.equal(limited.complete,false);assert.match(limited.answer,/saved total was not included/);
  assert.doesNotMatch(limited.answer,/No course-total object is saved|A — literal/);
});

test('requested native course total survives item-heavy display limits as a whole labelled record and table row',async()=>{
  const record=gradeReport();record.report!.items=Array.from({length:20},(_,i)=>({...record.report!.items[0],id:id(950+i),label:'Assessment '+(i+1)}));
  record.report!.total!.gradeText='Distinction (literal total)';
  const question='What course total is recorded in my native DTM grade report for Local Database?';
  const source=await nativeGrade(record,gradeOverview(),question);assert.equal(JSON.parse(source.evidence.content).report.items.length,20);
  const out=format([source],{question});assert.match(out.answer,/Explicitly saved course total[\s\S]*Displayed grade text: ` Distinction \(literal total\) `/);
  assert.deepEqual(out.views[0].rows[0],['Explicitly saved course total','Distinction (literal total)','not recorded','Explicit total feedback']);
  assert.ok(out.answer.indexOf('Distinction (literal total)')<out.answer.indexOf('Assessment 1'));
  assert.equal(out.complete,false);assert.ok(out.answer.length<=8000);assert.ok(Buffer.byteLength(JSON.stringify(out))<=24000);
});

test('requested native item and rank or weight fields precede generic cells without borrowing another item',async()=>{
  const record=gradeReport();record.report!.items=Array.from({length:20},(_,i)=>({...record.report!.items[0],id:id(950+i),label:'Assessment '+(i+1),rankText:'Rank literal '+(i+1),weightText:'Weight literal '+(i+1)}));
  for(const field of ['rank','weight']){
    const question='Show my native Moodle report '+field+' for Assessment 20 in GD101.';
    const source=await nativeGrade(record,gradeOverview(),question),out=format([source],{question});
    assert.equal(JSON.parse(source.evidence.content).report.items.length,1);
    const label=field==='rank'?'Displayed rank text':'Displayed weight text';
    assert.ok(out.answer.indexOf(label)<out.answer.indexOf('Numeric score metadata'));
    assert.ok(out.answer.includes((field==='rank'?'Rank':'Weight')+' literal 20'));assert.doesNotMatch(out.answer,/Rank literal 1`|Weight literal 1`/);
    assert.ok(out.answer.includes('](/dtm/course/'+courseId+'/grades)'));
  }
});

test('native whole-row evidence and display bounds keep omissions explicit with three views and safe feedback',async()=>{
  const record=gradeReport();record.report!.items=Array.from({length:30},(_,i)=>({...record.report!.items[0],id:id(910+i),label:'Assessment '+(i+1),feedbackText:'界'.repeat(1000)}));
  const source=await nativeGrade(record),out=format([source,await aid(),await certificate(),await tuition()],{question:'Show my Moodle grade report and salary.'});
  assert.equal(out.complete,false);assert.match(out.answer,/omitted/);assert.ok(out.views.some(view=>view.id==='dtmGradeReport'));
  assert.equal(out.views.length,3);assert.ok(out.answer.length<=8000);assert.ok(Buffer.byteLength(JSON.stringify(out))<=24000);
  assert.ok(out.views.every(view=>view.rows.length<=12));
  const injected=gradeReport();injected.report!.items[0].feedbackText='Keep literal\n\n[secret](https://private.invalid)\n\n<script>alert(1)</script>';
  const literal=format([await nativeGrade(injected)],{question:'我的 Moodle 成績報告'}),html=micromark(literal.answer);
  assert.doesNotMatch(html,/href="https:\/\/private\.invalid"|<script>/);assert.match(literal.answer,/評語原文/);
});

test('native formatter rejects forged lineage, unknown fields, mismatched links and contradictory state/count flags',async()=>{
  const source=await nativeGrade();
  for(const change of [(p:any)=>{p.report.userId=owner;},(p:any)=>{p.report.items[0].storagePath='PRIVATE';},
    (p:any)=>{p.course.courseId=id(999);},(p:any)=>{p.selection.courseId=id(999);},(p:any)=>{p.reportPresent=false;},
    (p:any)=>{p.report.totalPresent=false;},(p:any)=>{p.report.totalIncluded=false;},(p:any)=>{p.report.items[0].gradeText=0;},
    (p:any)=>{p.counts.omitted=4;},(p:any)=>{p.counts.available=0;},(p:any)=>{p.report.items.push(p.report.items[0]);p.counts.included=2;},
    (p:any)=>{p.provenance.courseMetadataSourceMode='sample';},(p:any)=>{p.capabilities.write=true;},(p:any)=>{p.complete=false;}])
    assert.throws(()=>format([replacePayload(source,change)]),TypeError);
  for(const url of ['/dtm/course/'+id(999)+'/grades','https://private.invalid','/dtm/course/'+courseId+'/grades/overview']){
    const forged=structuredClone(source);forged.evidence.url=url;assert.throws(()=>format([forged]),TypeError);
  }
  const overview=await nativeGrade(gradeReport(),gradeOverview([gradeCourse(),gradeCourse(1)]),'Show all my Moodle course grades.');
  overview.evidence.urls=['/dtm/grades','/dtm/grades','/dtm/grades'];assert.throws(()=>format([overview]),TypeError);
});

test('aid formatter retains both views with literal independent fields, own links and no bank or invented provenance',async()=>{
  const source=await aid(),before=structuredClone(source),output=format([source],{question:'Show my student aid claims and salary net pay and tax.'});
  assert.deepEqual(source,before);assert.equal(output.status,'answered');assert.equal(output.complete,true);assert.deepEqual(output.sourceIds,['account:aidPayments']);
  assert.deepEqual(output.views[0].rows,[['Student aid claims','Local library assistant claim','Claim amount: 0; Approval result: (blank); Approval status: Pending'],
    ['Student salary','November (literal)','Gross: 0; Tax: -2; Net: not recorded']]);
  for(const path of Object.values(aidPaymentsPaths))assert.ok(output.answer.includes(']('+path+')'));
  assert.match(output.answer,/Claim amount: ` 0 `/);assert.match(output.answer,/Approval result: ` \(blank\) `/);assert.match(output.answer,/Net pay: ` not recorded `/);assert.match(output.answer,/Tax: ` -2 `/);
  assert.match(output.answer,/not verified university or bank records/);assert.match(output.answer,/No currency is declared/);
  assert.doesNotMatch(JSON.stringify(output),/0921|bank_last4|local_demo|SECRET|TWD|paid successfully|payment confirmed/);
  for(const key of ['verification','proposedAction','activity'])assert.equal(Object.hasOwn(output,key),false);
});

test('aid count-only, successful zero and failed-view explanations never substitute for each other',async()=>{
  const counts=format([await aid('How many student aid claims and salary records are saved?',view=>({userId:owner,view,total:view==='salary'?7:2,rows:[]}))]);
  assert.equal(counts.complete,true);assert.deepEqual(counts.views[0].rows,[['Student aid claims','2'],['Student salary','7']]);
  assert.match(counts.answer,/Only total counts were requested and read/);assert.match(counts.answer,/Empty detail arrays do not mean no records/);assert.doesNotMatch(counts.answer,/returned zero/);
  const mixed=format([await aid(undefined,view=>{if(view==='salary')throw new Error('PRIVATE ERROR');return {userId:owner,view,total:0,rows:[]};})]);
  assert.equal(mixed.status,'answered');assert.equal(mixed.complete,false);assert.match(mixed.answer,/Student salary: this view could not be read/);
  assert.match(mixed.answer,/successful student aid claims lookup returned zero saved local records/);assert.doesNotMatch(mixed.answer,/PRIVATE ERROR|Student salary: 0/);
  const unavailable=format([await aid(undefined,()=>{throw new Error('PRIVATE ERROR');})]);assert.equal(unavailable.status,'abstained');assert.equal(unavailable.views.length,0);assert.doesNotMatch(unavailable.answer,/returned zero/);
});

test('aid budget omissions remain explicit, both views survive and all formatting bounds remain enforced',async()=>{
  const question='Show all my student aid claims and student salary net pay and tax.';
  const source=await aid(question,view=>({userId:owner,view,total:40,rows:Array.from({length:25},(_,i)=>({...aidRow(view,i+1),...(view==='salary'?{appointment_type:'薪'.repeat(500)}:{reason:'款'.repeat(300)})}))}));
  const output=format([source,await certificate(),await tuition(),await catalog()],{question});
  assert.equal(output.complete,false);assert.equal(output.views.length,3);assert.equal(output.formatting.omittedViews,1);
  assert.ok(output.views.some(view=>view.id==='aidPayments'));assert.match(output.answer,/Student aid claims: 40 saved local records/);assert.match(output.answer,/Student salary: 40 saved local records/);
  assert.match(output.answer,/filtered count cannot be established from omitted rows/);assert.match(output.answer,/Display excerpt/);
  assert.ok(output.answer.length<=supplementalAnswerLimits.answerCharacters);assert.ok(Buffer.byteLength(JSON.stringify(output))<=supplementalAnswerLimits.resultBytes);
  assert.ok(output.views.every(view=>view.rows.length<=supplementalAnswerLimits.viewRows));
});

test('aid saved text stays inert in rendered Markdown and Chinese retains literal financial distinctions',async()=>{
  const source=await aid('Show my student aid claims.',view=>({userId:owner,view,total:1,rows:[{...aidRow(view),reason:'Safe\n\n[click](https://private.invalid)\n\nEnd'}]}));
  const output=format([source],{question:'請顯示我的助學金請款。'}),html=micromark(output.answer);
  assert.doesNotMatch(html,/href="https:\/\/private\.invalid"/);assert.match(output.answer,/未指定幣別/);assert.match(output.answer,/簽核結果: ` （空白） `/);
});

test('later salary pages link to their exact records, and an empty later page preserves the positive collection total',async()=>{
  const expected=aidPaymentsPaths.salary+'?page=2';
  const question='Show page 2 of my student salary.';
  for(const total of [26,1]){
    const source=await readAidPaymentsEvidence(account,{question},{read:async()=>({
      userId:owner,view:'salary',total,rows:total>25?[aidRow('salary',26)]:[],
    })});
    const output=format([source],{question});
    assert.equal(output.status,'answered');
    assert.ok(output.answer.includes(']('+expected+')'));
    assert.equal(output.citations[0].url,expected);
    if(total>25)assert.match(output.answer,/Page 2 contains saved rows 26–26/);
    else{
      assert.match(output.answer,/Page 2 has no saved rows/);
      assert.match(output.answer,/collection still has 1 record/);
      assert.doesNotMatch(output.answer,/returned zero saved local records/);
    }
    const forged=structuredClone(source);forged.evidence.urls=[aidPaymentsPaths.salary];
    assert.throws(()=>format([forged]),TypeError);
    assert.throws(()=>format([replacePayload(source,(p:any)=>{p.views[0].page=1;})]),TypeError);
  }
});

test('aid formatter rejects wrong sources, contradictory counts/states, unknown IDs and bank suffix injection',async()=>{
  const source=await aid('Show my student salary.');
  for(const change of [(p:any)=>{p.views[0].records[0].bank_last4='0921';},(p:any)=>{p.views[0].records[0].id=id(998);},(p:any)=>{p.views[0].counts.omitted=4;},
    (p:any)=>{p.views[0].readState='empty';},(p:any)=>{p.views[0].url=aidPaymentsPaths.claims;},(p:any)=>{p.selection.summaryOnly=true;},(p:any)=>{p.provenance.source='official';},
    (p:any)=>{p.complete=false;},(p:any)=>{p.views[0].records[0].net='0';}])assert.throws(()=>format([replacePayload(source,change)]),TypeError);
  const bad=structuredClone(source);bad.evidence.provenance='local_demo' as typeof source.evidence.provenance;assert.throws(()=>format([bad]),TypeError);
});

test('pure formatter is compatible with all three actual reader envelopes and does not mutate them',async()=>{
  const inputs=await Promise.all([catalog(),certificate(),submission()]),before=structuredClone(inputs);
  const result=format(inputs,{question:'Show my catalog, assessment and saved files.'});
  assert.deepEqual(inputs,before);assert.equal(result.status,'answered');assert.equal(result.complete,true);
  assert.deepEqual(result.sourceIds,['account:courseCatalog','account:enrollmentCertificate','account:dtmSubmissions']);
  assert.equal(result.views.length,3);assert.deepEqual(result.citations.map(row=>row.chunkId),result.sourceIds);
  assert.equal(result.views[2].url,localAssignment);assert.equal(result.views[2].rows[0][3],'0');
  for(const key of ['verification','proposedAction','activity','grounding'])assert.equal(Object.hasOwn(result,key),false);
  for(const secret of [owner,submissionId,currentId,id(99),account.token,account.key,'Private Name','Private Department'])assert.equal(JSON.stringify(result).includes(secret),false,secret);
  const module=await readFile(new URL('../../server/supplementalAccountAnswers.js',import.meta.url),'utf8');
  assert.doesNotMatch(module,/\b(?:fetch|loadSyllabusSearch|loadEnrollmentCertificate|createClient)\s*\(/m);
  assert.deepEqual([...module.matchAll(/^import .+ from '([^']+)';$/gm)].map(match=>match[1]),[
    './dtmAssignmentEvidenceContract.js','./studentLeaveEvidenceIntent.js','./aidPaymentsContract.js','./feeRemissionContract.js','./healthExaminationContract.js','./tutorEvaluationContract.js',
    './teachingFeedbackContract.js','./teachingFeedbackEvidenceIntent.js','./teachingFeedbackAnswerEvidence.js',
  ]);
});

test('certificate pending-fee flag never overrides independent status or claims issuance',async()=>{
  const output=format([await certificate()],{question:'Do I have pending fees, can I download this certificate?'});
  assert.match(output.answer,/Pending-fee flag[^\n]+` N `/);assert.match(output.answer,/assessment status[^\n]+` blocked `/);
  assert.match(output.answer,/Assessment time[^\n]+not recorded/);assert.match(output.answer,/Issuance and download capabilities are unavailable/);
  assert.doesNotMatch(output.answer,/you are eligible|no fees owed|certificate is issued|download your certificate/i);
  assert.deepEqual(output.views[0].rows,[['115/1','N','blocked','Await local review.']]);
  assert.match(output.views[0].note,/does not establish document issuance/);assert.doesNotMatch(output.views[0].note,/no document has been issued/);
});

test('certificate identity is only the individually requested projected field',async()=>{
  const output=format([await certificate(assessment(),'Which name is recorded on my enrollment certificate?')],{question:'Which name is recorded?'});
  assert.match(output.answer,/Private Name/);for(const value of ['QA-1','Private Department','Private Class'])assert.equal(JSON.stringify(output).includes(value),false,value);
});

test('the exact coordinated certificate question formats both saved identity fields without profile substitution',async()=>{
  const question='Which student name and number are recorded in my enrollment-certificate assessment, rather than my account profile?';
  const value={...assessment(),identity:{...assessment().identity,studentName:'Certificate Evaluation Name',studentNumber:'CERT-EVAL-115'}};
  const source=await certificate(value,question),output=format([source],{question});
  assert.equal(output.status,'answered');assert.equal(output.complete,true);
  assert.match(output.answer,/Student number: ` CERT-EVAL-115 `/);
  assert.match(output.answer,/Name: ` Certificate Evaluation Name `/);
  assert.doesNotMatch(JSON.stringify(output),/Private Department|Private Class|EVAL-115-001/);
  assert.deepEqual(output.sourceIds,['account:enrollmentCertificate']);
  assert.equal(output.citations[0].url,'/school-affairs/services/17-1');
  assert.deepEqual(JSON.parse(source.evidence.content).identityProjection.requestedFields,['studentNumber','studentName']);
});

test('certificate formatting preserves requested null and blank while omitting unrequested identity fields',async()=>{
  const value={...assessment(),identity:{...assessment().identity,studentName:null,studentNumber:''}};
  const question='What student name and number are recorded in my enrollment certificate?';
  const output=format([await certificate(value,question)],{question});
  assert.match(output.answer,/Name: ` not recorded `/);
  assert.match(output.answer,/Student number: ` \(blank\) `/);
  assert.doesNotMatch(output.answer,/Department:|Class:|Year level:|Private Department|Private Class/);
  const status=format([await certificate(value)],{question:'Show my enrollment certificate status.'});
  assert.doesNotMatch(status.answer,/Student number:|Name:|Department:|Class:|Year level:/);
});

test('student certificate and document identifiers never become personal identity in reader-to-formatter answers',async()=>{
  for(const question of [
    'What is the name and number of the student certificate in my enrollment-certificate assessment?',
    'What is the name and number of the student document in my enrollment-certificate assessment?',
    "What is the number and name of the student's document in my enrollment-certificate assessment?",
  ]){
    const source=await certificate(assessment(),question),output=format([source],{question});
    assert.deepEqual(JSON.parse(source.evidence.content).identityProjection.requestedFields,[],question);
    assert.doesNotMatch(JSON.stringify(output),/Student number:|Name:|Private Name|QA-1/,question);
  }
});

test('a requested class name and number does not disclose a student number in formatted evidence',async()=>{
  const question='What is the student class name and number on my enrollment certificate?';
  const source=await certificate(assessment(),question),output=format([source],{question});
  assert.deepEqual(JSON.parse(source.evidence.content).assessment.identity,{classLabel:'Private Class'});
  assert.match(output.answer,/Class: ` Private Class `/);
  assert.doesNotMatch(JSON.stringify(output),/Student number:|Name:|Private Name|QA-1/);
});

test('successful empty certificate and failed certificate reads remain distinguishable',async()=>{
  const empty=format([await certificate(null)]);
  assert.equal(empty.status,'answered');assert.equal(empty.complete,true);assert.match(empty.answer,/successful lookup/);assert.match(empty.answer,/does not establish your university enrollment/);
  const failed=await readCertificateEvidence(account,{}, {load:async()=>{throw new Error('PRIVATE TRANSPORT DETAIL');}});
  const output=format([failed]);assert.equal(output.status,'abstained');assert.equal(output.complete,false);assert.equal(output.views.length,0);
  assert.match(output.answer,/does not prove that the record is absent/);assert.doesNotMatch(output.answer,/No local assessment|PRIVATE TRANSPORT/);
});

test('catalog summaries preserve null versus recorded values and expose pagination limits',async()=>{
  const output=format([await catalog(2,8)],{question:'Show available courses.'});
  assert.equal(output.complete,false);assert.match(output.answer,/2 included \/ 2 returned; matching total 8/);
  assert.match(output.answer,/do not establish enrollment/);assert.equal(output.views[0].total,2);assert.match(output.views[0].note,/matching total may be larger/);assert.equal(output.views[0].rows[0][3],'not recorded/1');
  assert.doesNotMatch(output.answer,/your enrolled courses|you are enrolled/i);
});

test('catalog detail uses exact helper link and distinguishes planned teaching, literal grades and zero',async()=>{
  const source=await detail();assert.equal(source.readState,'ok');
  const output=format([source],{question:'Show the syllabus, planned weeks and grading weights.'});
  assert.equal(output.citations[0].url,'/school-affairs/services/12-4?syllabus='+courseId);
  assert.match(output.answer,/Credits: ` 0 `/);assert.match(output.answer,/weight \/ method codes: ` 0 \/ 1 `/);
  assert.match(output.answer,/weight \/ method codes: ` not recorded \/ /);assert.match(output.answer,/Planned week 18.*Independent capstone presentation/);
  assert.match(output.answer,/Room: ` C301 `/);assert.match(output.answer,/Planned weekday \/ period codes: ` 2 \/ 3, 4 `/);
  assert.match(output.answer,/completed teaching or personal grades/);assert.doesNotMatch(output.answer,/You scored|Your grade is|completed week 18/);
});

test('partial catalog core may omit instructor without turning omission into null or throwing',async()=>{
  const source=await detail();source.readState='partial';source.reason='evidence_limit';
  const limited=replacePayload(source,p=>{p.readState='partial';p.reason='evidence_limit';p.counts.complete=false;p.rows=[{id:courseId,version:1,source_mode:'sample',published:true,course_code:'CAT301',course_name:'Catalog Database',term_code:'1151',term_label:'Local first term',syllabus:{}}];p.omittedFields=['instructor','credits'];});
  const output=format([limited]);assert.equal(output.complete,false);assert.match(output.answer,/source fields were omitted/);assert.equal(output.views[0].rows[0][2],'not included in this lookup');
  assert.doesNotMatch(output.answer,/Teacher:|Credits:/);
});

test('current saved file, pending reservation, retained old review and gradebook are never substituted',async()=>{
  const value=workspace();value.files.push(file(id(41),'retired'),file(id(42),'pending',null));
  value.reviews=[{...review(id(41)),id:id(51),grade_text:'OLD A+'}];
  const source=await submission(value),output=format([source],{question:'Compare the current file and older file reviews.'});
  assert.match(output.answer,/No review is recorded for the current file/);assert.match(output.answer,/Older file.*older.txt.*OLD A\+/);
  assert.match(output.answer,/not a committed upload/);assert.equal(output.views[0].rows[0][1],'current.txt');assert.equal(output.views[0].rows[0][2],'No current-file review recorded');assert.equal(output.views[0].rows[0][3],'not recorded');
  assert.match(output.answer,/gradebook marks are separate/);assert.match(output.answer,/Retained reviews are not a complete upload history/);
});

test('current due date is distinct from null submission-time due date and does not infer lateness',async()=>{
  const result=format([await submission()]);
  assert.match(result.answer,/Current recorded due time: ` 2026-11-11T03:00:00Z `/);assert.match(result.answer,/Due time recorded at submission: ` not recorded `/);
  assert.match(result.answer,/Current-file grade: ` 0 `/);assert.match(result.answer,/does not establish lateness/);assert.doesNotMatch(result.answer,/was late|was on time/);
  assert.match(result.answer,/Current-file media type: ` text\/plain `/);assert.match(result.answer,/Saved submission version: ` 2 `/);
  assert.match(result.answer,/Committed filename \/ bytes: ` current.txt \/ 0 `/);
});

test('blank feedback, cleared grade and blank result remain distinct from null or zero',async()=>{
  const value=workspace();value.reviews=[{...review(),status:'not_graded',grade_text:null,feedback:''} as unknown as ReturnType<typeof review>];
  const output=format([await submission(value),await certificate({...assessment(),resultText:''})]);
  assert.match(output.answer,/Current-file grade: ` not recorded `/);assert.match(output.answer,/Current-file feedback: ` \(blank\) `/);assert.match(output.answer,/Recorded result: ` \(blank\) `/);
  assert.equal(output.views[0].rows[0][3],'not recorded');assert.equal(output.views[1].rows[0][3],'(blank)');
});

test('all-history request includes retained old-file facts while keeping the current grade separate',async()=>{
  const value=workspace();value.files.push(file(id(41),'retired'));value.reviews.push({...review(id(41)),id:id(51),grade_text:'A-'});
  const output=format([await submission(value)],{question:'Show all my submission details.'});
  assert.match(output.answer,/Current-file grade: ` 0 `/);assert.match(output.answer,/Older file.*older.txt.*A-/);assert.equal(output.views[0].rows[0][3],'0');
});

test('tracker submitted state does not fabricate a committed file; known absence is assignment scoped',async()=>{
  const source=await submission({...workspace(),submission:null,files:[],reviews:[]}),output=format([source]);
  assert.equal(source.readState,'ok');assert.match(output.answer,/No committed file is recorded for this selected assignment/);assert.equal(output.views[0].rows[0][1],'No committed file recorded');
  assert.doesNotMatch(output.answer,/no submissions exist|not submitted any assignments/);
});

test('mixed lookup failure retains successful source facts and never invents absence for failed records',async()=>{
  const failure=await readSubmissionEvidence(account,{snapshot:snapshot(),question:'Reading response'},{fetchImpl:async()=>new Response('{}',{status:500})});
  const result=format([await certificate(),failure]);assert.equal(result.status,'answered');assert.equal(result.complete,false);assert.equal(result.views.length,1);
  assert.match(result.answer,/blocked/);assert.match(result.answer,/could not establish the requested record/);assert.doesNotMatch(result.answer,/No committed file is recorded/);
});

test('ambiguous submission choices remain choices without assigning a file or grade to either',async()=>{
  const snap=snapshot();snap.dtm.courses.push({...snap.dtm.courses[0],id:id(11),title:'Other course'});snap.assignments.push({...snap.assignments[0],id:id(21),dtmCourseId:id(11)});
  const source=await readSubmissionEvidence(account,{snapshot:snap,question:'Was Reading response uploaded?'},{fetchImpl:async()=>{throw new Error('No request expected.');}});
  const result=format([source]);assert.equal(result.status,'answered');assert.equal(result.complete,false);assert.match(result.answer,/Choose a more specific course or assignment/);assert.match(result.answer,/Other course/);assert.equal(result.views.length,0);
});

test('a bounded ambiguity list discloses omitted matching choices instead of presenting five as exhaustive',async()=>{
  const snap=snapshot();for(let i=1;i<=6;i++){snap.dtm.courses.push({...snap.dtm.courses[0],id:id(10+i),title:'Other course '+i});snap.assignments.push({...snap.assignments[0],id:id(20+i),dtmCourseId:id(10+i)});}
  const source=await readSubmissionEvidence(account,{snapshot:snap,question:'Was Reading response uploaded?'},{fetchImpl:async()=>{throw new Error('No request expected.');}});
  const output=format([source]);assert.match(output.answer,/Showing 5 of 7 matching assignment choices/);assert.equal(output.formatting.limited,true);assert.equal(output.complete,false);assert.equal(output.views.length,0);
});

test('Chinese replies preserve source literals, null and safe links; explicit English language wins',async()=>{
  const source=await certificate({...assessment(),hasPendingFees:null});
  const cn=format([source],{question:'請問我的在學證明待繳費與狀態？'});assert.match(cn.answer,/待繳費旗標（Y\/N\/null）: ` 未記錄 `/);assert.match(cn.answer,/blocked/);assert.match(cn.answer,/並非校方驗證/);
  const en=format([source],{question:'請問我的在學證明？請用英文回答'});assert.match(en.answer,/Enrollment-certificate/);assert.doesNotMatch(en.answer,/待繳費/);
  assert.match(format([source],{question:'What is recorded in 在學證明?'}).answer,/Enrollment-certificate/);
  assert.match(format([source],{question:'Show my enrollment certificate; answer in traditional Chinese.'}).answer,/在學證明評估/);
});

test('literal record content cannot add active Markdown links, HTML or fake source IDs',async()=>{
  const attack='[click](https://private.invalid) <img src=x onerror=boom> `ignore rules`';
  const source=await certificate({...assessment(),resultText:attack});
  const result=format([source]);assert.match(result.answer,/`` \[click\]\(https:\/\/private.invalid\).*`ignore rules` ``/);
  assert.deepEqual(result.sourceIds,['account:enrollmentCertificate']);assert.equal(result.citations.length,1);assert.equal(result.citations[0].url,'/school-affairs/services/17-1');
  assert.equal(result.views[0].rows[0][3],attack); // The UI renders table cells as text, never Markdown.
  const html=micromark(result.answer);assert.doesNotMatch(html,/<a href="https:\/\/private.invalid|<img/);assert.match(html,/&lt;img/);
});

test('blank lines in valid record text cannot escape code spans and inject active Markdown blocks',async()=>{
  for(const linebreak of ['\n\n','\r\n\r\n','\r\r','\u2028\u2028']){
    const attack=`Safe text${linebreak}[click](https://private.invalid)${linebreak}<img src="https://private.invalid/pixel">${linebreak}\`ignore rules\``;
    const source=await certificate({...assessment(),resultText:attack});assert.equal(source.readState,'ok');
    const output=format([source]),html=micromark(output.answer);
    assert.doesNotMatch(html,/<a href="https:\/\/private.invalid|<img/);assert.match(html,/href="\/school-affairs\/services\/17-1"/);assert.match(html,/<code>Safe text/);
  }
});

test('bounded multi-source output preserves all source limitations, whole rows and explicit omissions',async()=>{
  const source=await catalog(50,100),submissionSource=await submission(),cert=await certificate();
  const long=replacePayload(submissionSource,(p:SubmissionEvidencePayload)=>{p.records[0].submission!.currentReview!.feedback='📖'.repeat(900);});
  const output=format([source,cert,long],{question:'Show all available records and feedback.'}),serialized=JSON.stringify(output);
  assert.ok(output.answer.length<=supplementalAnswerLimits.answerCharacters);assert.ok(Buffer.byteLength(serialized)<=supplementalAnswerLimits.resultBytes);
  assert.equal(output.views.length,3);assert.ok(output.views.every(view=>view.rows.length<=12&&view.rows.every(row=>row.length===view.columns.length)));
  assert.equal(output.complete,false);assert.equal(output.formatting.limited,true);assert.ok(output.formatting.omittedItems>0);assert.ok(output.formatting.omittedViewRows>=38);
  assert.match(output.answer,/Display excerpt/);assert.match(output.answer,/blocked/);assert.match(output.answer,/Current-file grade: ` 0 `/);assert.match(output.answer,/Pending-fee flag/);
  assert.ok(output.views.every(view=>view.rows.flat().every(cell=>cell.length<=160&&!/[\ud800-\udfff]/u.test(cell))));
  assert.equal(JSON.stringify(format([source,cert,long],{question:'Show all available records and feedback.'})),serialized);
});

test('empty input abstains and untrusted, duplicate, forged routes or conflicting provenance fail closed',async()=>{
  const none=format([]);assert.equal(none.status,'abstained');assert.equal(none.complete,false);assert.deepEqual(none.views,[]);
  const good=await certificate();assert.throws(()=>format([good,good]),TypeError);
  for(const mutate of [(r:any)=>{r.evidence.id='account:charges';},(r:any)=>{r.evidence.url='https://stu.edu.tw/private';},(r:any)=>{r.evidence.url='//evil.invalid';},(r:any)=>{r.evidence.content='not json';},(r:any)=>{r.readState='empty';}]){const bad=structuredClone(good);mutate(bad);assert.throws(()=>format([bad]),TypeError);}
  assert.throws(()=>format([replacePayload(good,p=>{p.sourceMode='official';})]),TypeError);
  assert.throws(()=>format([replacePayload(good,p=>{p.assessment.resultText='\ud800';})]),TypeError);
  assert.throws(()=>format([replacePayload(good,p=>{p.assessment.resultText='x'.repeat(24000);})]),TypeError);
});

test('tuition retains literal null, blank, zero and recorded numbers without computing a balance or current term',async()=>{
  for(const [text,display]of [[null,'not recorded'],['','(blank)'],['0','0'],['Recorded 8; subtotal 2.5.','Recorded 8; subtotal 2.5.']] as const){
    const source=await tuition(tuitionData([tuitionRow(1,'115 current-looking label',text)])),output=format([source]);
    assert.equal(source.readState,'ok');assert.equal(output.status,'answered');assert.equal(output.views[0].rows[0][1],display);
    assert.match(output.answer,/does not independently establish an amount owed/);assert.match(output.answer,/not official university records or a payment ledger/);
    assert.doesNotMatch(output.answer,/You owe|Your balance is|You paid|Your current term is/);
    assert.equal(output.views[0].url,'/school-affairs/services/49-1');assert.equal(output.citations[0].chunkId,'account:tuition');
  }
});

test('a saved zero string answers the payment-confirmation question without inferring payment',async()=>{
  const question='What literal text is saved for 113 Fall reconciliation in my tuition settlements? Is it a confirmed payment?';
  const source=await tuition(tuitionData([tuitionRow(1,'113 Fall reconciliation','0')]),question);
  const output=format([source],{question});
  assert.equal(output.status,'answered');
  assert.match(output.answer,/cannot confirm a payment/);
  assert.match(output.answer,/Literal statement text: ` 0 `/);
  assert.doesNotMatch(output.answer,/payment was made|tuition is paid|amount owed|waiver|refund/);
  assert.equal(output.views[0].rows[0][1],'0');
  assert.equal(output.citations[0].url,'/school-affairs/services/49-1');
});

test('tuition failed reads, successful empty selection and omitted known statement remain distinct',async()=>{
  const failed=await readTuitionEvidence(account,{question:'Show my tuition settlement.'},{load:async()=>{throw new Error('PRIVATE ERROR');}});
  const failure=format([failed]);assert.equal(failure.status,'abstained');assert.match(failure.answer,/could not be read/);assert.match(failure.answer,/contents and absence remain unknown/);assert.doesNotMatch(failure.answer,/returned no matching|PRIVATE ERROR/);
  const empty=format([await tuition(tuitionData([]))]);assert.equal(empty.status,'answered');assert.match(empty.answer,/successful owned lookup returned no matching saved period/);
  const capped=await tuition(tuitionData([tuitionRow(1,'Oversized period','📚'.repeat(4000))]));assert.equal(capped.readState,'ok');
  const omitted=format([capped]);assert.equal(omitted.complete,false);assert.match(omitted.answer,/0 included \/ 1 selected; 1 omitted/);assert.match(omitted.answer,/text is unknown here, not absent/);assert.doesNotMatch(omitted.answer,/returned no matching/);
});

test('tuition duplicate period choices never silently choose a period or leak its statement body',async()=>{
  const source=await tuition(tuitionData([tuitionRow(1,'Duplicate label','PRIVATE BODY A'),tuitionRow(2,'Duplicate label','PRIVATE BODY B')]));
  const result=format([source]);assert.equal(result.status,'answered');assert.equal(result.complete,false);assert.match(result.answer,/Choose an exact saved period/);assert.match(result.answer,/Showing 2 of 2 choices/);assert.equal(result.views.length,0);
  assert.doesNotMatch(result.answer,/PRIVATE BODY/);assert.match(result.answer,new RegExp(id(501)));assert.match(result.answer,new RegExp(id(502)));
});

test('tuition period list contains period labels without implying absent statement bodies',async()=>{
  const result=format([await tuition(tuitionData([tuitionRow(1,'Period one','PRIVATE BODY'),tuitionRow(2,'Period two','PRIVATE BODY')]),'Which tuition settlement periods are available?')]);
  assert.deepEqual(result.views[0].columns,['Saved period']);assert.deepEqual(result.views[0].rows,[['Period one'],['Period two']]);assert.doesNotMatch(result.answer,/PRIVATE BODY|no statement|not recorded/);
});

test('48-x capability-only answers give exact safe service links and do not pretend an account read or issued file',async()=>{
  const question='Print my summer tuition receipt and evening tuition statement and extended-study fees.';
  const source=await readTuitionEvidence(account,{question},{load:async()=>{throw new Error('No account read expected.');}}),output=format([source]);
  assert.equal(source.readState,'unavailable');assert.equal(output.status,'answered');assert.equal(output.complete,false);assert.equal(output.views.length,0);
  for(const path of ['/school-affairs/services/48-1','/school-affairs/services/48-2','/school-affairs/services/48-3'])assert.ok(output.answer.includes(']('+path+')'));
  assert.match(output.answer,/No settlement records were read/);assert.match(output.answer,/not proof that an official document does not exist/);assert.doesNotMatch(output.answer,/no payments|no document has been issued/);
});

test('combined tuition settlement and evening capability retain both facts even when settlement read fails',async()=>{
  const question='Show my tuition settlement and evening tuition statement availability.';
  const output=format([await tuition(tuitionData(),question)],{question});assert.match(output.answer,/Recorded settlement difference TWD 730/);assert.match(output.answer,/Evening payment documents: no verified local file capability/);
  const failed=await readTuitionEvidence(account,{question},{load:async()=>{throw new Error('PRIVATE');}}),failure=format([failed],{question});
  assert.equal(failure.status,'abstained');assert.match(failure.answer,/Evening payment documents/);assert.match(failure.answer,/settlement records could not be read/);assert.equal(failure.views.length,0);
});

test('four sources retain four answers and citations while prioritizing requested tables and explicitly omitting the fourth',async()=>{
  const sources=await Promise.all([catalog(),certificate(),submission(),tuition()]);
  const output=format(sources,{question:'Show my tuition statement, assignment files and enrollment certificate; include catalog too.'});
  assert.equal(output.sourceIds.length,4);assert.equal(output.citations.length,4);assert.equal(output.views.length,3);assert.equal(output.formatting.omittedViews,1);assert.equal(output.complete,false);
  assert.deepEqual(output.views.map(view=>view.id),['enrollmentCertificate','dtmSubmissions','tuition']);
  assert.match(output.answer,/source table is omitted by the three-table display limit/);assert.match(output.answer,/Catalog course 1/);assert.match(output.answer,/Recorded settlement difference TWD 730/);
  assert.ok(output.answer.length<=8000);assert.ok(Buffer.byteLength(JSON.stringify(output))<=24000);
});

test('budget-excluded record headings also exclude their child facts, preventing cross-record attribution',async()=>{
  const source=await catalog(50,50);
  const large=replacePayload(source,p=>{for(const [index,row]of p.rows.entries()){row.course_name='L'.repeat(125)+'_'+index;row.instructor='UNIQUE_TEACHER_'+index;}});
  assert.ok(Buffer.byteLength(large.evidence.content)<=24000);
  const output=format([large]),html=micromark(output.answer);let currentCode='';
  for(const line of output.answer.split('\n')){
    const heading=line.match(/^- Offering: ` (CAT\d+) /);if(heading)currentCode=heading[1];
    const teacher=line.match(/UNIQUE_TEACHER_(\d+)/);if(teacher)assert.equal(currentCode,'CAT'+(Number(teacher[1])+1),line);
  }
  assert.equal(output.formatting.limited,true);assert.ok(output.formatting.omittedItems>0);assert.doesNotMatch(html,/\[object Object\]/);
});

test('directly requested syllabus objective fields precede generic offering details within their own record',async()=>{
  const output=format([await detail()],{question:'What are the syllabus objectives?'});
  assert.ok(output.answer.indexOf('Offering:')<output.answer.indexOf('Objectives:'));
  assert.ok(output.answer.indexOf('Objectives:')<output.answer.indexOf('Teacher:'));
});
