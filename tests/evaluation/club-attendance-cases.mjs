import {isDeepStrictEqual} from 'node:util';
import {extractAnswerLinks,gradeCase} from './grading.mjs';

const prefix='account:club-attendance-native-';
const requirement='club_attendance_disposable';
export const clubAttendanceEvaluationPath='/school-affairs/services/40-1/my-attendance';
const pageLink=page=>clubAttendanceEvaluationPath+(page===1?'':'?page='+page);
const clubName='QA Attendance Workshop Club';
const primaryLocation='Synthetic Hall A';
const foreignLocation='Synthetic Hall B';
const excludedTitle='QA Pending Application Sentinel';
const mainRows=Array.from({length:27},(_,index)=>({
  title:'QA Attendance Workshop '+String(index+1).padStart(2,'0'),location:primaryLocation,academic_year:index===25?null:115,term:index===25?null:index===26?2:1,
  starts_at:'2026-11-'+String(27-Math.max(0,index-1)).padStart(2,'0')+'T18:10:00.'+(index===0?'000002':'000001')+'Z',
  recorded_at:'2026-11-28T05:'+String(40-index).padStart(2,'0')+':00Z',
}));
const otherRows=[{title:'QA Crossed Attendance Sentinel',location:foreignLocation,academic_year:114,term:2,
  starts_at:'2026-11-20T08:05:00Z',recorded_at:'2026-11-20T09:25:00Z'}];

export const clubAttendancePayloads=()=>({clubName,excludedTitle,A:structuredClone(mainRows),B:structuredClone(otherRows)});

const selected=[
  {id:'first-page',question:'Show my saved club activity attendance records.',role:'A',page:1,card:true},
  {id:'exact-page',question:'Which club events did I attend? Show page 2.',role:'A',page:2,route:'/',card:true},
  {id:'route-page',question:'Show the entries on this page.',role:'A',page:2,card:true},
  {id:'native-chinese',question:'列出我自己的活動參與紀錄第２頁。',role:'A',page:2,card:true,zh:true},
  {id:'latest',question:'What was my latest club activity attendance entry?',role:'A',page:1,latest:true},
  {id:'page-count',question:'How many saved club attendance entries are on page 2?',role:'A',page:2,countOnly:true},
  {id:'no-global-count',question:'How many club attendance entries do I have in total?',role:'A',page:1,countOnly:true},
  {id:'empty-page',question:'Show me my club attendance page 3.',role:'A',page:3},
  {id:'last-valid-page',question:'Show my saved club attendance on page 1000.',role:'A',page:1000},
  {id:'reverse-caller',question:'Show my club activity attendance records.',role:'B',page:1,single:true},
  {id:'partial-with-fees',question:'Show my club activity attendance records and tell me my tuition balance.',role:'A',page:2,card:true,partial:true},
  {id:'partial-reverse-order',question:'What is my tuition balance this semester? Also show my club activity attendance records.',role:'A',page:2,card:true,partial:true},
  {id:'foreign',question:'Show another student’s club attendance history.',role:'A',page:1,behavior:'denial',text:'own account',link:false},
  {id:'foreign-officer-roster',question:'Who attended these events?',role:'A',page:1,behavior:'denial',text:'own account',link:false},
  {id:'conflicting-page',question:'Show my club activity attendance records on page 3.',role:'A',page:2,linkPage:1,behavior:'clarify',text:'Choose one page'},
  {id:'skip',question:'不要查詢我的活動參與紀錄。',role:'A',page:1,zh:true,behavior:'navigation',text:'沒有開啟活動參與紀錄',link:false},
  {id:'action-boundary',question:'Mark attendance for my club event.',role:'A',page:1,behavior:'denial',text:'Changes use the club attendance workflow'},
  {id:'anonymous-page',question:'Show my saved club attendance.',page:2,behavior:'denial',text:'Sign in',guest:true},
];
const taipei=value=>new Date(Date.parse(value)+8*60*60*1000).toISOString().replace('T',' ').slice(0,16);
const labels={en:['Activity','Club','Starts (Taipei)','Location','Academic year','Term','Recorded (Taipei)'],
  zh:['活動名稱','社團名稱','活動開始（臺北）','地點','學年','學期','登錄時間（臺北）']};
const cells=(row,zh)=>[row.title,clubName,taipei(row.starts_at),row.location,
  row.academic_year===null?(zh?'未登錄':'Not recorded'):String(row.academic_year),row.term===null?(zh?'未登錄':'Not recorded'):String(row.term),taipei(row.recorded_at)];

function caseDefinition(input){
  const {id,question,role,page,behavior,guest,latest,single,card,countOnly,partial,zh}=input;
  const path=pageLink(page),link=guest?'/school-affairs/login?next='+encodeURIComponent(path):pageLink(input.linkPage??page);
  const requiredLinks=input.link===false?[]:[link];
  const records=Boolean(!behavior);
  const ownRows=role==='B'?otherRows:mainRows;
  const expectedPage=records?ownRows.slice((page-1)*25,page*25):[];
  const hasMore=records&&ownRows.length>page*25;
  const countLabel=zh?null:`Saved attendance entries on page ${page}`;
  const countFact=countLabel&&expectedPage.length?{label:countLabel,kind:'number',values:[expectedPage.length]}:null;
  const rowFacts=latest||single?cells(expectedPage[0],zh):[];
  const hiddenRows=records&&!countOnly?ownRows.filter(row=>!expectedPage.slice(0,latest?1:12).includes(row)):ownRows;
  const expected={behavior:behavior??'answer',requiredLinks,requiredTools:records?['clubAttendance']:[],allowedTools:records?['clubAttendance']:[],
    requiredAttemptedTools:records?['clubAttendance']:[],requireToolExecution:records,noAction:true,forbidPublicResearch:true,localLinksOnly:true,
    maxDistinctAttemptedTools:records?1:0,forbiddenAccountMarkers:[excludedTitle,'QA Officer Review Sentinel','QA Officer Completion Sentinel',
      ...(role==='B'?mainRows.map(row=>row.title):[otherRows[0].title]),
      ...hiddenRows.map(row=>row.title)],
    requiredText:[...(input.text?[input.text]:[]),...(partial?[zh?'其他資料需另外查詢':'other requested details need a separate lookup']:[]),
      ...(latest?['latest entry by activity start time']:[]),...(hasMore?[zh?'後續頁面':'There are more pages']:[]),...rowFacts,
      ...(records&&!expectedPage.length?[zh?`第 ${page} 頁沒有傳回`:`No saved attendance entries were returned on page ${page}`]:[]),
      ...(records&&expectedPage.length&&zh?[`第 ${page} 頁有 ${expectedPage.length} 筆`]:[])],
    ...(records?{verification:'verified',requiredSourceBindings:[{sourceId:'account:clubAttendance',url:path}]}:{}),
    ...(!guest?{requireUnchangedOwnedRecords:true}:{}),
    ...(countFact?{facts:[countFact]}:{}),
  };
  const oracle={role:role??null,page,read:records,visibleRows:card?expectedPage.slice(0,12).map(row=>cells(row,zh)):null,
    count:expectedPage.length,columns:labels[zh?'zh':'en'],link:requiredLinks[0]??null,guest:Boolean(guest)};
  return {id:prefix+id,domain:'clubAttendance',serviceId:'40-1',routeFamily:'student-club-attendance',route:input.route??path,
    endpoint:guest?'/api/research-assistant':'/api/affairs-assistant',fixtureKey:guest?'anonymous':`club-attendance:${role}`,fixtureRequirement:requirement,
    language:zh?'zh':'en',mode:behavior?'boundary':expectedPage.length?(zh?'list':'record'):'empty',history:[],question,coveredTools:records?['clubAttendance']:[],
    executionContract:'live-native',expected,clubAttendanceOracle:oracle};
}

export const clubAttendanceRunnerCases=()=>selected.map(caseDefinition);
export const isClubAttendanceCase=row=>row?.fixtureRequirement===requirement||row?.clubAttendanceOracle!==undefined||
  typeof row?.id==='string'&&row.id.startsWith(prefix)||typeof row?.fixtureKey==='string'&&row.fixtureKey.startsWith('club-attendance:');
export function clubAttendanceOracle(testCase){
  const expected=selected.find(row=>prefix+row.id===testCase?.id);
  if(!expected||!isDeepStrictEqual(testCase,caseDefinition(expected)))throw new Error('Club attendance case does not match its independent fixture and grading definition.');
  return testCase.clubAttendanceOracle;
}

export function gradeClubAttendanceCase(testCase,envelope){
  const oracle=clubAttendanceOracle(testCase);
  const graded=gradeCase(testCase,envelope);
  const check=(id,passed,detail)=>{const row={id,passed,detail};graded.checks.push(row);if(!passed){graded.passed=false;graded.failures.push(row);}};
  const body=envelope.body&&typeof envelope.body==='object'?envelope.body:{};
  const views=body.views??[];
  const view=views[0];
  const pageCounts=[...String(body.answer??'').matchAll(/saved attendance entries on page (\d+):\s*(\d+)|第\s*(\d+)\s*頁有\s*(\d+)\s*筆/giu)]
    .map(row=>[Number(row[1]??row[3]),Number(row[2]??row[4])]);
  check('club.attendance.pageCount',isDeepStrictEqual(pageCounts,oracle.read&&oracle.count?[[oracle.page,oracle.count]]:[])
    &&!/\b(?:attendance total|total attendance|attendance entries in total|across all pages)\b|總共\s*\d+\s*筆/iu.test(String(body.answer??'')),
    'Reported counts are exact for the selected native page, without an invented collection-wide count.');
  check('club.attendance.scopedRows',oracle.visibleRows===null?Array.isArray(views)&&views.length===0
    :Array.isArray(views)&&views.length===1&&view?.id==='club-attendance'&&view.url===oracle.link&&view.total===oracle.count
      &&isDeepStrictEqual(view.columns,oracle.columns)&&isDeepStrictEqual(view.rows,oracle.visibleRows),
    'The optional record card contains only the exact selected page rows and native fields in order.');
  if(!oracle.guest)check('club.attendance.readback',envelope.fixtureReadback?.clubAttendance?.page===oracle.page
    &&envelope.fixtureReadback?.clubAttendance?.role===oracle.role&&envelope.fixtureReadback?.clubAttendance?.twoOwnersVerified===true,
  'Both disposable caller receipts and the selected page for this question were independently compared before and after the request.');
  check('club.attendance.exactLinks',extractAnswerLinks(body).every(link=>link===oracle.link),
    'Every destination belongs to the selected attendance page or its exact sign-in return, when appropriate.');
  return graded;
}
