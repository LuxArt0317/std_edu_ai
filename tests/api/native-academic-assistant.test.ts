import assert from 'node:assert/strict';
import {test} from 'node:test';
import {accountEvidence,accountTools,supplementalAccountTools,answerAccountWithVerification,planAccountLookup} from '../../server/answerVerificationAccount.js';
import {accountRecordViews} from '../../server/accountRecordViews.js';
import {answerLinksSupported,reviewMatchesEvidence,validEvidence} from '../../server/answerVerificationModel.js';
import handler from '../../api/affairs-assistant.ts';
import {answerPrivateAffairsQuestion} from '../../server/affairsAnswer.js';

const at='2026-11-13T01:02:03.123456+08:00';
const common={id:'own-row',userId:'own',sourceMode:'local_demo',version:1,createdAt:at,updatedAt:at};
const status=(text:string|null)=>({text,indicator:null});
const report=(reportKind='academic_services')=>({...common,id:reportKind,reportKind,reportedAt:at,
  identity:{studentNumber:'SECRET-NUMBER',studentName:'SECRET-NAME',departmentName:'Local department'},
  educationProgram:status(null),foreignLanguageCompletion:status(null),englishRequirement:status(null),graduationReview:{...status(reportKind==='legacy'?'LEGACY LITERAL':'MODERN LITERAL'),note:null},
  languageRequirements:[],categories:[{id:'category',label:'Local category',status:status(null),requiredCredits:12,completedCredits:0,matchedCredits:null,excludedCredits:null,detailSubtotalCredits:99,requirements:[]}],otherCourses:[]});
const fixture=()=>({checkedAt:at,profile:{userId:'own',role:'student',displayName:'Synthetic',email:'synthetic@example.invalid'},
  courses:[],assignments:[],tasks:[],requests:[],charges:[],announcements:[],dtm:{courses:[]},
  academicGrades:{records:[{...common,recordKind:'transcript',academicYear:115,semester:1,rowOrder:0,courseTitle:'OWN COURSE',credits:0,gradeText:'P',categoryText:null as string|null,moduleName:null as string|null,requiredElectiveText:null}],
    termSummaries:[{...common,summaryKind:'transcript',academicYear:115,semester:1,earnedCredits:null,averageGradeText:'0'}],
    rankings:[{...common,academicYear:115,semester:1,departmentRankingText:'Literal rank',classRankingText:null}],metadata:[]},
  graduationReview:{reports:[report(),report('legacy')]},
  academicAttendance:{statistics:[{...common,academicYear:115,semester:1,rowOrder:0,studentNumber:'SECRET-NUMBER',studentName:'SECRET-NAME',courseCode:'LOCAL',courseTitle:'OWN ATTENDANCE',absenceHours:0,unexcusedAbsenceHours:null}],
    details:[{...common,academicYear:115,semester:1,rowOrder:0,courseCode:'LOCAL',courseTitle:'OWN DETAIL',teacherName:null,absenceTypeText:'Literal absence',courseDate:'2026-11-12',periodText:'Literal period',rollCalledAt:at}],
    metadata:[{...common,currentAcademicYear:115,currentSemester:1}]},
});
const nativeKeys=['academicGrades','graduationReview','academicAttendance'];
const source=(data:ReturnType<typeof fixture>,key:string,context={})=>accountEvidence(data,[key],context).find(row=>row.id==='account:'+key)!;

test('planner retains exact topical native tools, normalizes routes, and uses the full capability count',async()=>{
  const previousFetch=globalThis.fetch,previousKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='synthetic-test-key';
  let calls=0;
  globalThis.fetch=async(input,init)=>{
    assert.equal(String(input),'https://api.openai.com/v1/responses');calls++;
    const body=JSON.parse(String(init?.body));assert.equal(body.text.format.name,'account_lookup_plan');
    const availableTools=Object.keys({...accountTools,...supplementalAccountTools});
    assert.equal(body.text.format.schema.properties.tools.maxItems,availableTools.length);
    assert.deepEqual(body.text.format.schema.properties.tools.items.enum,availableTools);
    assert.ok(nativeKeys.every(key=>body.text.format.schema.properties.tools.items.enum.includes(key)));
    return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({tools:['courses'],publicTopics:[],catalogQuery:null,action:null})}]}]});
  };
  try{
    for(const [question,route,key] of [['My transcript','','academicGrades'],['Show my records','/school-affairs/services/13-1/ranking/','academicGrades'],
      ['My status','/school-affairs/services/15-1/','graduationReview'],['Which dates?','/school-affairs/services/14-1/detail/','academicAttendance']]){
      const plan=await planAccountLookup(question,[],route,Date.now()+10000);assert.equal(plan.degraded,undefined);assert.equal(plan.tools[0],key);
    }
    const legacy=await planAccountLookup('My status',[{role:'user',content:'My legacy graduation report'}],'',Date.now()+10000);
    assert.equal(legacy.tools[0],'graduationReview');
    const mixed=await planAccountLookup('My transcript and my attendance',[],'',Date.now()+10000);
    assert.ok(mixed.tools.includes('academicGrades'));assert.ok(mixed.tools.includes('academicAttendance'));
    const dtm=await planAccountLookup('My DTM grades',[],'/dtm/grades',Date.now()+10000);
    assert.equal(dtm.degraded,undefined);
    assert.deepEqual(dtm.tools,['dtmGradeReport']);
    assert.equal(calls,5,'Standalone academic grades and recognized native DTM reads do not need the planner.');
    const explicit=await planAccountLookup('My academic transcript and my DTM grades',[],'/dtm/grades',Date.now()+10000);
    assert.ok(explicit.tools.includes('academicGrades'));
    const dtmFollowup=await planAccountLookup('My grades and attendance',[{role:'user',content:'My DTM courses'}],'',Date.now()+10000);
    assert.equal(dtmFollowup.degraded,undefined);
    assert.ok(!dtmFollowup.tools.some(key=>nativeKeys.includes(key)));assert.equal(calls,7);
  }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey;}
});

test('native evidence uses strict own projections and preserves null, zero, literal timestamps and allowed local links',()=>{
  const data=fixture(),foreign=report('legacy');foreign.userId='other';foreign.graduationReview.text='FOREIGN PRIVATE';
  data.graduationReview.reports.push(foreign);
  data.academicGrades.records.push({...data.academicGrades.records[0],userId:'other',courseTitle:'FOREIGN PRIVATE'});
  data.academicGrades.records.push(Object.assign(Object.create({userId:'own'}),{courseTitle:'INHERITED PRIVATE'}));
  Object.assign(data,{admin:{academicGrades:{records:[{courseTitle:'ADMIN PRIVATE'}]}}});
  const before=JSON.stringify(data),evidence=accountEvidence(data,nativeKeys,{question:'My legacy graduation report'}),encoded=JSON.stringify(evidence);
  for(const secret of ['SECRET-NUMBER','SECRET-NAME','FOREIGN PRIVATE','INHERITED PRIVATE','ADMIN PRIVATE'])assert.ok(!encoded.includes(secret),secret);
  const grades=JSON.parse(evidence.find(row=>row.id==='account:academicGrades')!.content);
  assert.equal(grades.records.records.length,1);assert.equal(grades.records.records[0].credits,0);assert.equal(grades.records.termSummaries[0].earnedCredits,null);
  assert.equal(grades.records.coverage[0].historyCompleteness,'unknown');assert.match(grades.rules,/GPA is not stored/);
  const graduation=JSON.parse(evidence.find(row=>row.id==='account:graduationReview')!.content);
  assert.equal(graduation.requestedReportKind,'legacy');assert.equal(graduation.records.statuses[0].reportKind,'legacy');
  const attendance=JSON.parse(evidence.find(row=>row.id==='account:academicAttendance')!.content);
  assert.equal(attendance.records.statistics[0].absenceHours,0);assert.equal(attendance.records.statistics[0].unexcusedAbsenceHours,null);
  assert.equal(attendance.records.details[0].rollCalledAt,at);assert.equal(attendance.records.details[0].courseDate,'2026-11-12');
  assert.match(attendance.rules,/Daily, weekly and monthly hour totals are unavailable/);
  for(const url of ['/school-affairs/services/13-1/ranking','/school-affairs/services/15-1','/school-affairs/services/15-2','/school-affairs/services/14-1/detail'])assert.equal(answerLinksSupported(`[View](${url})`,evidence),true,url);
  assert.equal(answerLinksSupported('[External](https://infosys.stu.edu.tw/private)',evidence),false);
  assert.equal(validEvidence(evidence),true);assert.equal(JSON.stringify(data),before);
  const ownerless={...data,profile:{...data.profile,userId:''}};
  for(const key of nativeKeys){const empty=JSON.parse(source(ownerless,key).content);assert.equal(empty.records.coverage[0].callerPresent,false);assert.doesNotMatch(JSON.stringify(empty),/OWN COURSE|MODERN LITERAL|LEGACY LITERAL|OWN DETAIL/);}
});

test('native evidence bounds UTF-8 excerpts with full matching counts and retains requested-kind short provenance first',()=>{
  const data=fixture();data.academicGrades.records=Array.from({length:1000},(_,i)=>({...data.academicGrades.records[0],id:`row-${i}`,courseTitle:'課'.repeat(160),categoryText:'類'.repeat(160),moduleName:'組'.repeat(160)}));
  Object.assign(data.academicGrades.records[0],{gradeText:{invalid:'SUPPRESSED PRIVATE'}});
  const before=JSON.stringify(data),evidence=source(data,'academicGrades'),payload=JSON.parse(evidence.content);
  const count=payload.records.counts.find((row:any)=>row.collection==='records');
  assert.equal(count.availableRows,1000);assert.equal(count.includedRows,payload.records.records.length);assert.ok(count.includedRows<1000);assert.equal(count.partial,true);
  assert.equal(payload.excerpted,true);assert.equal(payload.records.coverage[0].projectionPartial,true);assert.equal(payload.records.coverage[0].suppressedValues,1);
  assert.ok(Buffer.byteLength(evidence.content,'utf8')<26000);assert.doesNotMatch(evidence.content,/SUPPRESSED PRIVATE/);
  const all=accountEvidence(data,Object.keys(accountTools),{question:'My status',history:[{role:'user',content:'My legacy graduation report'}]});
  const graduation=JSON.parse(all.find(row=>row.id==='account:graduationReview')!.content);
  assert.equal(graduation.requestedReportKind,'legacy');assert.equal(graduation.records.reportMetadata[0].reportKind,'legacy');
  assert.equal(graduation.records.statuses[0].text,'LEGACY LITERAL');assert.equal(graduation.records.coverage[0].legacyReports,1);
  assert.equal(validEvidence(all),true);assert.equal(JSON.stringify(data),before);
});

test('native cards stay compact, private and explicit about coverage and independent report kinds',()=>{
  const data=fixture();data.academicGrades.records=Array.from({length:20},(_,i)=>({...data.academicGrades.records[0],id:`row-${i}`,courseTitle:'課'.repeat(160)+'😀'.repeat(80)}));
  data.graduationReview.reports.push({...report('legacy'),id:'foreign',userId:'other',graduationReview:{...status('FOREIGN PRIVATE'),note:null}});
  const cards=accountRecordViews(data,['courses',...nativeKeys],{question:'My status',route:'/school-affairs/services/15-2/'});
  assert.equal(cards[0].id,'graduationReview');assert.ok(cards.length<=3);
  for(const card of cards){assert.ok(card.columns.length<=5);assert.ok(card.rows.length<=12);assert.ok(card.rows.every(row=>row.length<=5&&row.every(value=>value.length<=200)));assert.ok(card.note.length<=400);}
  const native=accountRecordViews(data,nativeKeys),text=JSON.stringify(native);
  for(const secret of ['FOREIGN PRIVATE','SECRET-NUMBER','SECRET-NAME'])assert.ok(!text.includes(secret));
  assert.match(text,/history completeness unknown/);assert.match(text,/12\/21 rows shown/);assert.match(text,/long cells abbreviated/);
  const legacy=cards[0];assert.equal(legacy.url,'/school-affairs/services/15-2');assert.match(JSON.stringify(legacy),/LEGACY LITERAL/);assert.doesNotMatch(JSON.stringify(legacy),/MODERN LITERAL/);
  const followup=accountRecordViews(data,['graduationReview'],{question:'My status',history:[{role:'user',content:'My legacy graduation report'}]})[0];
  assert.equal(followup.url,legacy.url);
  const modern=accountRecordViews(data,['graduationReview'],{question:'My status',route:'/school-affairs/services/15-1/',history:[{role:'user',content:'My legacy graduation report'}]})[0];
  assert.match(JSON.stringify(modern),/MODERN LITERAL/);assert.doesNotMatch(JSON.stringify(modern),/LEGACY LITERAL/);
  data.graduationReview.reports=[report()];
  const missing=accountRecordViews(data,['graduationReview'],{question:'My status',route:'/school-affairs/services/15-2'})[0];
  assert.equal(missing.total,0);assert.deepEqual(missing.rows,[]);assert.match(missing.note,/no other kind is substituted/);
  const details=accountRecordViews(data,['academicAttendance'],{question:'Which dates?',route:'/school-affairs/services/14-1/detail/'})[0];
  assert.equal(details.rows[0][1],'2026-11-12');assert.equal(details.rows[0][3],at);
});

test('native verification rereads once and independently validates the correction and exact references',async()=>{
  const previousFetch=globalThis.fetch,previousKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='synthetic-test-key';
  let reviews=0,repairs=0,reads=0;
  globalThis.fetch=async(input,init)=>{
    assert.equal(String(input),'https://api.openai.com/v1/responses');
    const body=JSON.parse(String(init?.body)),inputData=JSON.parse(body.input[0].content[0].text),operation=body.text.format.name;
    let result:unknown;
    if(operation==='account_lookup_plan')result={tools:[],publicTopics:[]};
    else if(operation==='answer_evidence_review'){
      reviews++;assert.match(body.instructions,/reportKind/);assert.match(body.instructions,/historyCompleteness/);
      result={supported:reviews===2,answersQuestion:reviews===2,claims:reviews===1?[]:[{claim:'The stored transcript grade is REFRESHED.',supported:true,evidenceId:'account:academicGrades',quotes:[],jsonPaths:['/records/records/0/gradeText']}]};
    }else{
      assert.equal(operation,'correct_grounded_answer');repairs++;assert.match(body.instructions,/no daily\/weekly\/monthly hours/);
      const evidence=inputData.evidence.find((row:any)=>row.id==='account:academicGrades');assert.equal(JSON.parse(evidence.content).records.records[0].gradeText,'REFRESHED');
      result={status:'answered',answer:'The local stored transcript grade is REFRESHED. [Transcript](/school-affairs/services/13-1/transcript)',sourceIds:['account:academicGrades']};
    }
    return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
  };
  try{
    const initial=fixture();
    const result=await answerAccountWithVerification({question:'My transcript',snapshot:initial,loadSnapshot:async()=>{reads++;const fresh=fixture();fresh.academicGrades.records[0].gradeText='REFRESHED';return fresh;}});
    assert.equal(result.verification?.status,'verified');assert.equal(result.verification?.attempts,2);assert.equal(reviews,2);assert.equal(repairs,1);assert.equal(reads,1);
    assert.match(result.answer,/REFRESHED/);assert.equal(result.proposedAction,undefined);assert.match(JSON.stringify(result.views),/REFRESHED/);
    const evidence=accountEvidence(initial,['academicGrades']);
    const claim={claim:'P',supported:true,evidenceId:'account:academicGrades',quotes:[],jsonPaths:['/records/records/0/gradeText']};
    assert.equal(reviewMatchesEvidence({supported:true,answersQuestion:true,claims:[claim]},evidence),true);
    assert.equal(reviewMatchesEvidence({supported:true,answersQuestion:true,claims:[{...claim,jsonPaths:['/records/records/1/gradeText']}]},evidence),false);
    assert.equal(reviewMatchesEvidence({supported:true,answersQuestion:true,claims:[{...claim,supported:false}]},evidence),false);
  }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey;}
});

test('native endpoint retries issue only authenticated reads after the single initial account setup',async()=>{
  const previousFetch=globalThis.fetch,saved={...process.env};
  process.env.OPENAI_API_KEY='synthetic-test-key';process.env.VITE_SUPABASE_URL='https://xiftudmvxphxcjtmfmib.supabase.co';process.env.VITE_SUPABASE_PUBLISHABLE_KEY='synthetic-public-key';
  const userId='10000000-0000-4000-8000-000000000089',token='n'.repeat(40),rpc:string[]=[];
  let snapshots=0,gradeReads=0,reviews=0,repairs=0;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.hostname==='api.openai.com'){
      const body=JSON.parse(String(init?.body)),data=JSON.parse(body.input[0].content[0].text),operation=body.text.format.name;
      let result:unknown;
      if(operation==='account_lookup_plan')result={tools:[],publicTopics:[]};
      else if(operation==='answer_evidence_review'){
        reviews++;result={supported:reviews===2,answersQuestion:reviews===2,claims:reviews===1?[]:[{claim:'The saved grade is zero.',supported:true,evidenceId:'account:academicGrades',quotes:[],jsonPaths:['/records/records/0/gradeText']}]};
      }else{
        assert.equal(operation,'correct_grounded_answer');repairs++;
        const evidence=data.evidence.find((row:any)=>row.id==='account:academicGrades');assert.equal(JSON.parse(evidence.content).records.records[0].gradeText,'0');
        result={status:'answered',answer:'Your local saved transcript grade is 0. [Transcript](/school-affairs/services/13-1/transcript)',sourceIds:['account:academicGrades']};
      }
      return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
    }
    assert.equal(url.hostname,'xiftudmvxphxcjtmfmib.supabase.co');assert.equal((init?.headers as Record<string,string>|undefined)?.Authorization,'Bearer '+token);
    if(url.pathname==='/auth/v1/user')return Response.json({id:userId,identities:[{provider:'google'}]});
    const table=url.pathname.split('/').at(-1)!;
    if(url.pathname.includes('/rpc/')){assert.equal(snapshots,0,'No RPC may run on the verification reread');rpc.push(table);return Response.json(null);}
    assert.ok(!init?.method||init.method==='GET');
    if(table==='affairs_profiles'){snapshots++;return Response.json([{user_id:userId,email:'synthetic@example.invalid',display_name:'Synthetic',role:'student'}]);}
    if(table==='affairs_academic_grade_records'){
      gradeReads++;assert.equal(url.searchParams.get('user_id'),'eq.'+userId);
      return Response.json([{id:'20000000-0000-4000-8000-000000000089',user_id:userId,source_mode:'local_demo',version:1,created_at:at,updated_at:at,
        record_kind:'transcript',academic_year:115,semester:1,course_title:'Synthetic native course',course_code:null,category_text:null,module_name:null,
        required_elective_text:null,credits:0,grade_text:gradeReads===1?'P':'0',remark_text:null,row_order:0}]);
    }
    return Response.json([]);
  };
  try{
    let body:any;const response={status(_code:number){return response;},json(value:unknown){body=value;},setHeader(){}};
    await handler({method:'POST',headers:{authorization:'Bearer '+token},body:{question:'My transcript',route:'/school-affairs/services/13-1/transcript/'}},response);
    assert.equal(body.verification?.status,'verified',JSON.stringify(body));assert.equal(body.verification.attempts,2);
    assert.equal(snapshots,0);assert.equal(gradeReads,2);assert.equal(reviews,2);assert.equal(repairs,1);
    assert.deepEqual(rpc,[]);assert.equal(body.proposedAction,undefined);
    assert.match(body.answer,/grade is 0/);assert.match(JSON.stringify(body.views),/Synthetic native course/);
  }finally{globalThis.fetch=previousFetch;for(const key of ['OPENAI_API_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'])if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
});

test('requested warning and transcript terms are selected before high-row-count evidence budgets',async()=>{
  const data:any=fixture();
  const older=Array.from({length:1000},(_,i)=>({...data.academicGrades.records[0],id:`old-${i}`,academicYear:114,rowOrder:i,courseTitle:`OLD TRANSCRIPT ${i}`}));
  const target={...data.academicGrades.records[0],id:'target-warning',recordKind:'warning',courseCode:'TARGET',courseTitle:'TARGET WARNING',gradeText:'TARGET LITERAL',remarkText:null};
  const second={...target,id:'second-warning',semester:2,courseTitle:'SECOND WARNING',gradeText:'SECOND LITERAL'};
  data.academicGrades.records=[...older,target,second,{...target,id:'foreign',userId:'other',courseTitle:'PRIVATE FOREIGN'}];
  data.academicGrades.termSummaries=[{...common,summaryKind:'warning',academicYear:115,semester:1,attemptedCredits:0,passedCredits:null,failedCredits:7.25}];
  const before=JSON.stringify(data),question='My warning grades academic year115 semester1';
  const draft=await answerPrivateAffairsQuestion(question,data,[],'',{draftOnly:true});assert.match(draft.answer,/TARGET LITERAL/);
  const payload=JSON.parse(source(data,'academicGrades',{question}).content),count=payload.records.counts.find((row:any)=>row.collection==='records');
  assert.equal(payload.selection.view,'warning');assert.equal(payload.selection.academicYear,115);assert.equal(payload.selection.semester,1);
  assert.deepEqual([count.loadedRows,count.availableRows,count.matchingRows,count.includedRows,count.partial],[1002,1002,1,1,false]);
  assert.equal(payload.records.records[0].gradeText,'TARGET LITERAL');assert.equal(payload.records.termSummaries[0].attemptedCredits,0);
  assert.equal(payload.records.termSummaries[0].passedCredits,null);assert.doesNotMatch(JSON.stringify(payload),/OLD TRANSCRIPT|SECOND LITERAL|PRIVATE FOREIGN/);
  const card=accountRecordViews(data,['academicGrades'],{question})[0];assert.equal(card.total,2);assert.match(JSON.stringify(card),/TARGET WARNING/);assert.doesNotMatch(JSON.stringify(card),/OLD TRANSCRIPT/);
  const followup={question:'semester2',route:'/school-affairs/services/13-1/warning/',history:[{role:'user',content:question}]};
  const secondPayload=JSON.parse(source(data,'academicGrades',followup).content);
  assert.equal(secondPayload.selection.academicYear,115);assert.equal(secondPayload.selection.semester,2);
  assert.equal(secondPayload.records.records[0].gradeText,'SECOND LITERAL');
  data.academicGrades.records.push({...data.academicGrades.records[0],id:'late-transcript',academicYear:115,courseTitle:'LATE TRANSCRIPT TARGET'});
  const transcriptPayload=JSON.parse(source(data,'academicGrades',{question:'My transcript academic year115 semester1'}).content);
  assert.equal(transcriptPayload.records.records.length,1);assert.equal(transcriptPayload.records.records[0].courseTitle,'LATE TRANSCRIPT TARGET');
  data.academicGrades.records.pop();assert.equal(JSON.stringify(data),before);
});

test('explicit current attendance and dated history retain target rows after many older rows',async()=>{
  const data:any=fixture(),currentStat={...data.academicAttendance.statistics[0],id:'current-target',courseTitle:'CURRENT TARGET'};
  data.academicAttendance.statistics=[...Array.from({length:1000},(_,i)=>({...currentStat,id:`old-stat-${i}`,academicYear:114,courseTitle:'OLD STAT'})),currentStat];
  const currentDetail={...data.academicAttendance.details[0],id:'current-detail',courseTitle:'CURRENT DETAIL'};
  data.academicAttendance.details=[...Array.from({length:1000},(_,i)=>({...currentDetail,id:`old-detail-${i}`,academicYear:114,courseTitle:'OLD DETAIL'})),currentDetail];
  const before=JSON.stringify(data),question='My current academic attendance statistics';
  const payload=JSON.parse(source(data,'academicAttendance',{question}).content),count=payload.records.counts.find((row:any)=>row.collection==='statistics');
  assert.equal(payload.selection.academicYear,115);assert.equal(payload.selection.semester,1);assert.equal(payload.selection.reason,null);
  assert.deepEqual([count.loadedRows,count.matchingRows,count.includedRows],[1001,1,1]);
  assert.equal(payload.records.statistics[0].absenceHours,0);assert.equal(payload.records.statistics[0].unexcusedAbsenceHours,null);
  assert.doesNotMatch(JSON.stringify(payload),/OLD STAT|OLD DETAIL/);assert.match((await answerPrivateAffairsQuestion(question,data,[],'',{draftOnly:true})).answer,/CURRENT TARGET/);
  const detailContext={question:'My attendance details academic year115 semester1 on 2026-11-12'};
  const detail=JSON.parse(source(data,'academicAttendance',detailContext).content);
  assert.equal(detail.selection.courseDate,'2026-11-12');assert.equal(detail.records.details.length,1);assert.equal(detail.records.details[0].rollCalledAt,at);
  const card=accountRecordViews(data,['academicAttendance'],detailContext)[0];assert.equal(card.total,1);assert.match(JSON.stringify(card),/CURRENT DETAIL/);assert.doesNotMatch(JSON.stringify(card),/OLD DETAIL/);
  assert.equal(JSON.stringify(data),before);
  const missing={...data,academicAttendance:{...data.academicAttendance,metadata:[]}};
  const none=JSON.parse(source(missing,'academicAttendance',{question}).content);
  assert.equal(none.selection.reason,'current_term_missing');assert.deepEqual(none.records.statistics,[]);assert.equal(none.records.counts.find((row:any)=>row.collection==='statistics').matchingRows,0);
});

test('multipart graduation kinds agree across evidence and cards without using the other clause kind',()=>{
  const data=fixture();
  for(const question of ['My legacy graduation review and my transcript','My transcript and my legacy graduation review','我的舊版畢業檢核以及我的歷年成績']){
    const context={question,route:'/school-affairs/records'},payload=JSON.parse(source(data,'graduationReview',context).content);
    assert.equal(payload.requestedReportKind,'legacy');assert.equal(payload.selection.reportKind,'legacy');
    assert.match(JSON.stringify(payload.records.statuses),/LEGACY LITERAL/);assert.doesNotMatch(JSON.stringify(payload.records.statuses),/MODERN LITERAL/);
    const reports=payload.records.counts.find((row:any)=>row.collection==='reports');assert.deepEqual([reports.loadedRows,reports.matchingRows,reports.includedRows],[2,1,1]);
    const card=accountRecordViews(data,['graduationReview'],context)[0];assert.equal(card.url,'/school-affairs/services/15-2');assert.match(JSON.stringify(card),/LEGACY LITERAL/);
  }
  const modern=JSON.parse(source(data,'graduationReview',{question:'My legacy transcript and my graduation review'}).content);
  assert.equal(modern.requestedReportKind,'academic_services');assert.match(JSON.stringify(modern.records.statuses),/MODERN LITERAL/);
  data.graduationReview.reports=[report()];
  const absent=JSON.parse(source(data,'graduationReview',{question:'My legacy graduation review and my transcript'}).content);
  assert.deepEqual(absent.records.statuses,[]);assert.equal(absent.records.counts.find((row:any)=>row.collection==='reports').matchingRows,0);
  assert.equal(absent.records.coverage[0].academicServicesReports,1,'Other-kind availability remains explicit without substituting its values.');
});

test('unavailable grade-model replies contain only capability claims supported by native evidence',async()=>{
  const data=fixture();
  for(const [question,view] of [['My current-term grades','current'],['My transfer grades','transfer'],['My cycle grades','cycle']]){
    const draft=await answerPrivateAffairsQuestion(question,data,[],'',{draftOnly:true});
    const payload=JSON.parse(source(data,'academicGrades',{question}).content);
    assert.equal(payload.selection.view,view);assert.match(draft.answer,/no (?:current-term )?grade (?:data )?model/);
    assert.doesNotMatch(draft.answer,/captur|opening period|populated format/);assert.match(payload.rules,/current-term, transfer and cycle grade models are unavailable/);
    assert.deepEqual(payload.records.records,[]);assert.equal(payload.records.counts.find((row:any)=>row.collection==='records').matchingRows,0);
  }
});

test('incompatible same-family clauses clarify consistently without falsely reporting empty records',async()=>{
  const data:any=fixture();
  data.academicGrades.records.push({...data.academicGrades.records[0],id:'warning',recordKind:'warning',academicYear:114,semester:2,courseCode:'WARN',courseTitle:'WARNING EXISTS'});
  const cases=[
    ['academicGrades','My transcript academic year115 semester1 and my warning grades academic year114 semester2'],
    ['academicGrades','My transcript academic year115 semester1 and my transcript academic year114 semester2'],
    ['academicGrades','我的115學年第1學期歷年成績以及我的114學年第2學期預警成績'],
    ['academicAttendance','My attendance statistics academic year115 semester1 and my absence details academic year115 semester1'],
    ['academicAttendance','My attendance academic year115 semester1 and my attendance academic year114 semester2'],
    ['graduationReview','My Academic Services graduation review and my legacy graduation review'],
  ];
  const before=JSON.stringify(data);
  for(const [key,question] of cases){
    const draft=await answerPrivateAffairsQuestion(question,data,[],'',{draftOnly:true});
    assert.match(draft.answer,/Please choose|請一次選擇/);assert.doesNotMatch(draft.answer,/No .*records|no saved|沒有.*紀錄/);
    const evidence=JSON.parse(source(data,key,{question}).content);
    assert.ok(evidence.selection.multipleScopes||evidence.selection.reason==='multiple_scopes');
    assert.match(evidence.rules,/zero selected rows does not mean no saved records/);
    const count=evidence.records.counts.find((row:any)=>row.collection===(key==='graduationReview'?'reports':key==='academicAttendance'?'statistics':'records'));
    assert.ok(count.loadedRows>0);assert.equal(count.matchingRows,0);assert.equal(count.includedRows,0);
    const card=accountRecordViews(data,[key],{question})[0];assert.equal(card.total,0);assert.deepEqual(card.rows,[]);assert.match(card.note,/Clarification required/);
  }
  const sameScope=await answerPrivateAffairsQuestion('My transcript academic year115 semester1 and my transcript academic year115 semester1',data,[],'',{draftOnly:true});
  assert.match(sameScope.answer,/OWN COURSE/);assert.doesNotMatch(sameScope.answer,/Please choose/);
  assert.equal(JSON.stringify(data),before);
});

test('separate native families keep their own term clauses rather than borrowing the first family term',()=>{
  const data:any=fixture();data.academicGrades.records[0].academicYear=114;data.academicGrades.termSummaries[0].academicYear=114;
  const question='My transcript academic year114 semester1 and my attendance statistics academic year115 semester1';
  const grades=JSON.parse(source(data,'academicGrades',{question}).content),attendance=JSON.parse(source(data,'academicAttendance',{question}).content);
  assert.equal(grades.selection.academicYear,114);assert.equal(grades.selection.multipleScopes,false);assert.equal(grades.records.records[0].courseTitle,'OWN COURSE');
  assert.equal(attendance.selection.academicYear,115);assert.equal(attendance.selection.reason,null);assert.equal(attendance.records.statistics[0].courseTitle,'OWN ATTENDANCE');
});

test('late named graduation courses retain exact parents before both single-tool and fallback evidence budgets',async()=>{
  const data:any=fixture(),modern=data.graduationReview.reports[0];
  const actual=(title:string)=>({id:'same-child-id',sequenceText:'1',title,credits:0,requiredElectiveText:null,yearText:null,transferText:null});
  modern.categories=Array.from({length:100},(_,i)=>({id:`category-${i}`,label:`Category ${i}`,requiredElectiveText:null,requiredCredits:12,completedCredits:0,matchedCredits:null,excludedCredits:null,detailSubtotalCredits:0,status:status(null),
    requirements:[{id:'same-requirement-id',sequenceText:'1',title:`Parent requirement ${i}`,moduleText:null,credits:null,requiredElectiveText:null,yearText:null,transferText:null,indicator:null,
      matchedCourses:[actual(i===99?'Requested capstone':'Unrelated course '+i)]}]}));
  modern.otherCourses=Array.from({length:100},(_,i)=>({...actual(i===99?'Requested independent study':'Other course '+i),id:`other-${i}`}));
  data.graduationReview.reports.push({...structuredClone(modern),id:'foreign',userId:'someone-else',graduationReview:{...status('FOREIGN PRIVATE'),note:null}});
  const before=JSON.stringify(data);
  for(const [title,collection,expectedParents] of [['Requested capstone','matchedCourses',1],['Parent requirement 99','requirements',1],['Requested independent study','otherCourses',0]] as const){
    const question=`Show my graduation review course details for ${title}`;
    const draft=await answerPrivateAffairsQuestion(question,data,[],'',{draftOnly:true});assert.ok(draft.answer.includes(title));assert.doesNotMatch(draft.answer,/Unrelated course|Category 0:|FOREIGN PRIVATE/);
    for(const tools of [['graduationReview'],Object.keys(accountTools)]){
      const evidence=accountEvidence(data,tools,{question}).find(row=>row.id==='account:graduationReview')!;
      const payload=JSON.parse(evidence.content),rows=payload.records;
      assert.equal(payload.selection.courseScope,'named_course_rows_and_parent_context');assert.equal(payload.selection.namedCourseRows[collection],1);
      assert.equal(rows[collection].length,1);assert.equal(rows[collection][0].title,title);
      assert.equal(rows.reportMetadata.find((row:any)=>row.recordKind==='report').reportId,modern.id);
      assert.equal(rows.categories.length,expectedParents);
      if(expectedParents){assert.equal(rows.categories[0].id,'category-99');assert.equal(rows.requirements[0].title,'Parent requirement 99');assert.equal(rows.requirements[0].categoryId,'category-99');}
      if(collection==='matchedCourses'){assert.equal(rows.matchedCourses[0].categoryId,'category-99');assert.equal(rows.matchedCourses[0].requirementId,'same-requirement-id');assert.equal(rows.matchedCourses[0].credits,0);}
      const count=rows.counts.find((row:any)=>row.collection===collection);assert.equal(count.loadedRows,100);assert.equal(count.matchingRows,1);assert.equal(count.includedRows,1);assert.equal(count.partial,false);
      assert.doesNotMatch(evidence.content,/Unrelated course|FOREIGN PRIVATE|LEGACY LITERAL/);assert.ok(Buffer.byteLength(evidence.content,'utf8')<26000);
    }
    const card=accountRecordViews(data,['graduationReview'],{question})[0];assert.ok(JSON.stringify(card.rows).includes(title));assert.match(card.note,/Named course rows and their parent context/);
  }
  assert.equal(JSON.stringify(data),before);
});


test('verified native citations open the requested report rather than the service index',()=>{
  const data=fixture();
  for(const [question,expected] of [
    ['Show my academic transcript','/school-affairs/services/13-1/transcript'],
    ['Show my warning grades','/school-affairs/services/13-1/warning'],
    ['Show my semester rankings','/school-affairs/services/13-1/ranking'],
    ['Show my academic absence details','/school-affairs/services/14-1/detail'],
    ['Show my academic attendance statistics','/school-affairs/services/14-1'],
    ['How many hours was I absent last week?','/school-affairs/services/14-1/detail'],
    ['How many absence hours do I have this month?','/school-affairs/services/14-1/detail'],
    ['上週缺課時數是多少？','/school-affairs/services/14-1/detail'],
  ]){
    const key=expected.includes('/14-1')?'academicAttendance':'academicGrades';
    assert.equal(source(data,key,{question}).url,expected,question);
  }
  assert.equal(source(data,'academicAttendance',{question:'Show the details',route:'/school-affairs/services/14-1/detail'}).url,'/school-affairs/services/14-1/detail');
});
