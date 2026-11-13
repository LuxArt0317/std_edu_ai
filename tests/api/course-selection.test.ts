import assert from 'node:assert/strict';
import {test} from 'node:test';
import {answerCourseSelection,isCourseSelectionQuestion,mapCourseSelection,courseSelectionNavigation,courseSelectionPeriods} from '../../server/courseSelection.js';
import {executeAffairsAction,loadAffairsSnapshot,manageAffairsRecord} from '../../server/affairsWorkspace.js';
import {answerPrivateAffairsQuestion} from '../../server/affairsAnswer.js';
import {answerCampusNavigation} from '../../server/schoolAffairsDirectory.js';
import dataHandler from '../../api/affairs-data.ts';
import managerHandler from '../../api/affairs-manage.ts';

const row={id:'record-one',user_id:'10000000-0000-4000-8000-000000000001',academic_year:115,semester:1,selection_phase:'add_drop',
  term_course_code:'LOCAL-DEMO-115',course_title:'Synthetic course',required_elective_text:'選修',credits:'3.50',
  instructor_one:'Synthetic teacher',remark_text:'Y(W)',row_order:1,timetable_included:true,
  meetings:[{weekday:1,period:'1',room:'Demo 101'},{weekday:3,period:'午',room:''},{weekday:5,period:'D',room:'Demo night'}],
  source_mode:'local_demo',version:1,created_at:'2026-11-12T00:00:00Z',updated_at:'2026-11-12T00:00:00Z'};
const snapshot={profile:{userId:'10000000-0000-4000-8000-000000000001'},courseSelection:mapCourseSelection([row])};
const historyPath='/school-affairs/services/11-1',timetablePath='/school-affairs/services/11-2';
test('course selection preserves independent source fields, all meetings, nulls, zero credits and explicit inclusion',()=>{
  const records=mapCourseSelection([row,{...row,id:'zero',credits:'0',required_elective_text:null,instructor_one:null,remark_text:null,timetable_included:false,meetings:[]}]).records;
  assert.equal(records[0].credits,3.5);assert.equal(records[0].selectionPhase,'add_drop');assert.equal(records[0].remarkText,'Y(W)');
  assert.deepEqual(records[0].meetings,row.meetings);assert.equal(records[0].timetableIncluded,true);
  assert.equal(records[1].credits,0);assert.equal(records[1].timetableIncluded,false);assert.equal(records[1].requiredElectiveText,null);
  assert.equal(records[1].instructorOne,null);assert.equal(records[1].remarkText,null);assert.equal(records[1].sourceMode,'local_demo');
});
test('source timetable has all14 observed periods, including lunch, evening break and night slots',()=>{
  assert.deepEqual(courseSelectionPeriods,[
    {period:'1',time:'08:10~09:00'},{period:'2',time:'09:10~10:00'},{period:'3',time:'10:10~11:00'},{period:'4',time:'11:10~12:00'},
    {period:'午',time:'12:10~13:00'},{period:'5',time:'13:10~14:00'},{period:'6',time:'14:10~15:00'},{period:'7',time:'15:10~16:00'},
    {period:'8',time:'16:10~17:00'},{period:'傍',time:'17:10~18:00'},{period:'A',time:'18:20~19:10'},{period:'B',time:'19:15~20:05'},
    {period:'C',time:'20:10~21:00'},{period:'D',time:'21:05~21:55'},
  ]);
  assert.equal(courseSelectionNavigation[0].officialUrl,'https://infosys.stu.edu.tw/WebSelectCourse/Login/AspLogin/SelectCourse');
  assert.equal(courseSelectionNavigation[1].officialUrl,'https://infosys.stu.edu.tw/WebSelectCourse/Login/AspLogin/QryMyCourse');
});
test('navigation opens the cloned selection history and timetable without an official-school response link',()=>{
  for(const [question,path] of [
    ['Where can I find course-selection history?',historyPath],['Where can I find course selection?',historyPath],
    ['Where is my weekly timetable?',timetablePath],['Open my timetable',timetablePath],
    ['我的課表在哪裡？',timetablePath],['How can I view my course-selection history?',historyPath],
  ]){
    const answer=answerCampusNavigation(question)!;
    assert.ok(answer);assert.match(answer.answer,new RegExp(path));assert.doesNotMatch(answer.answer,/https?:\/\/[^\s)]*stu\.edu/i);
    assert.equal(answer.citations[0].url,path);
  }
});
test('directory leaves timetable room, next-class and count questions to private record lookup',()=>{
  for(const question of ['Where are my classes in my timetable?','Where is my next class on my timetable?',
    'How many classes are on my timetable?','Where does my course-selection history show my classes meet?',
    '我的課表週一在哪上課？'])assert.equal(answerCampusNavigation(question),null,question);
  const answer=answerCourseSelection('Where are my classes in my timetable?',snapshot)!;
  assert.match(answer.answer,/Demo 101/);assert.equal(answer.url,timetablePath);
});
test('history answers filter year, semester and phase without mapping source remarks to enrollment status',()=>{
  const mixed={...snapshot,courseSelection:mapCourseSelection([row,
    {...row,id:'old',academic_year:114,course_title:'OLD YEAR'},
    {...row,id:'initial',selection_phase:'initial',course_title:'OTHER PHASE',remark_text:'Y'},
    {...row,id:'second',semester:2,course_title:'OTHER SEMESTER'},
    {...row,id:'earlier',course_title:'Earlier ordered course',row_order:0,credits:'0',remark_text:'A'}])};
  const result=answerCourseSelection('我的115學年第1學期加退選選課紀錄',mixed)!;
  assert.equal(result.url,historyPath);assert.match(result.answer,/必選修：選修.*3.5 學分.*教師一：Synthetic teacher.*備註：Y\(W\)/);
  assert.ok(result.answer.indexOf('Earlier ordered course')<result.answer.indexOf('Synthetic course'));
  assert.match(result.answer,/0 學分/);assert.doesNotMatch(result.answer,/OTHER PHASE|OTHER SEMESTER|OLD YEAR|已退選|approved|修課中/);
  const english=answerCourseSelection('My course-selection history for academic year115 semester1 add/drop',mixed)!;
  assert.match(english.answer,/year 115.*semester 1.*add\/drop/);assert.doesNotMatch(english.answer,/OTHER PHASE|OTHER SEMESTER|OLD YEAR/);
});
test('timetable uses explicit membership despite remarks and includes multiple meetings plus unscheduled courses',()=>{
  const mixed={...snapshot,courseSelection:mapCourseSelection([row,
    {...row,id:'excluded',course_title:'EXCLUDED BY EXPLICIT FLAG',remark_text:'A',timetable_included:false},
    {...row,id:'unscheduled',course_title:'Synthetic unscheduled course',remark_text:'Y',meetings:[]}])};
  const answer=answerCourseSelection('My timetable for academic year115 semester1 add/drop',mixed)!;
  assert.equal(answer.url,timetablePath);assert.match(answer.answer,/Monday period 1 08:10~09:00 · room Demo 101/);
  assert.match(answer.answer,/Wednesday period 午 12:10~13:00 · room not recorded/);
  assert.match(answer.answer,/Friday period D 21:05~21:55 · room Demo night/);
  assert.match(answer.answer,/Synthetic unscheduled course — Unscheduled course/);assert.doesNotMatch(answer.answer,/EXCLUDED BY EXPLICIT FLAG/);
  assert.match(answer.answer,/Local demonstration records/);
});
test('multiple phases require precision and contextual filter replies retain the prior requested year and semester',()=>{
  const mixed={...snapshot,courseSelection:mapCourseSelection([row,{...row,id:'initial',selection_phase:'initial',course_title:'Initial course'}])};
  assert.match(answerCourseSelection('My course-selection history',mixed)!.answer,/Please specify.*one selection phase/);
  assert.match(answerCourseSelection('My timetable',mixed)!.answer,/Please specify.*one selection phase/);
  assert.match(answerCourseSelection('全部課表',mixed)!.answer,/請指定學年、學期/);
  const previous=[{role:'user',content:'My course-selection history for academic year115 semester1'}];
  const answer=answerCourseSelection('加退選',mixed,historyPath,previous)!;
  assert.match(answer.answer,/Synthetic course/);assert.doesNotMatch(answer.answer,/Initial course/);
  assert.match(answerCourseSelection('initial or add/drop?',mixed,historyPath)!.answer,/Please specify/);
  assert.match(answerCourseSelection('All course-selection history',mixed)!.answer,/Initial course/);
  assert.match(answerCourseSelection('All course-selection history',mixed)!.answer,/Synthetic course/);
  assert.match(answerCourseSelection('My timetable semester12',mixed)!.answer,/Please specify semester 1, semester 2 or the summer semester/);
  assert.doesNotMatch(answerCourseSelection('我的第12學期課表',mixed)!.answer,/Synthetic course|Initial course/);
});
test('missing caller identity, empty data and other owners cannot expose course-selection records',()=>{
  const mixed={...snapshot,courseSelection:mapCourseSelection([row,{...row,id:'foreign',user_id:'10000000-0000-4000-8000-000000000002',course_title:'PRIVATE OTHER STUDENT'}])};
  assert.doesNotMatch(answerCourseSelection('My course-selection history',mixed)!.answer,/PRIVATE OTHER STUDENT/);
  for(const value of [{courseSelection:snapshot.courseSelection},{profile:{userId:'empty'},courseSelection:snapshot.courseSelection},{profile:{userId:'10000000-0000-4000-8000-000000000001'}}]){
    const result=answerCourseSelection('My timetable',value)!;
    assert.match(result.answer,/No timetable records/);assert.doesNotMatch(result.answer,/Synthetic course|Demo 101/);
  }
});
test('phase records do not hijack grades, fees, DTM, offerings or general current/next class answers',()=>{
  const history=[{role:'user',content:'My timetable'}];
  for(const question of ['My DTM courses','What are my grades?','What fees do I owe?','我的超減修紀錄','我的抵免學分','My scholarship status',
    'What courses are offered?','My course catalog','我的開課資料','My course syllabus','What classes do I have today?',
    '我的明天課表','What is my next class?','What are my currently enrolled courses?',
    'My timetable next semester','My current timetable','My timetable this semester','我的本學期課表','我的下學期課表','下一門課',
    'What are my past courses?','My current subjects',
    'How do I select/register for a course?','Where can I find course selection?','Where can I find course-selection?']){
    assert.equal(isCourseSelectionQuestion(question,timetablePath,history),false,question);
  }
  assert.equal(isCourseSelectionQuestion('What are my enrolled courses?','/school-affairs'),false);
  assert.equal(isCourseSelectionQuestion('Which rooms?',timetablePath),true);
  assert.equal(isCourseSelectionQuestion('semester2',historyPath),true);
  assert.equal(isCourseSelectionQuestion('What is the result?','/school-affairs/services/39-1'),false);
});

const account={user:{id:'10000000-0000-4000-8000-000000000001'},token:'caller-token',url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'publishable-test-key'};
test('manager transport preserves request/version/slots on retries, caller authorization and sanitized409 conflicts',async()=>{
  const original=globalThis.fetch;let conflict=false,calls=0;
  const payload={id:'record-one',user_id:'10000000-0000-4000-8000-000000000001',request_id:'request-one',expected_version:0,academic_year:115,semester:1,selection_phase:'add_drop',
    term_course_code:'LOCAL-QA',course_title:'Synthetic',required_elective_text:null,credits:0,instructor_one:null,remark_text:'Y',row_order:0,timetable_included:true,meetings:[]};
  globalThis.fetch=async(input,init)=>{
    calls++;assert.equal(String(input),account.url+'/rest/v1/rpc/affairs_manage_course_selection');
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer caller-token');
    assert.deepEqual(JSON.parse(String(init?.body)),{p_kind:'save_course_selection',p_payload:payload});
    return new Response(JSON.stringify(conflict?{message:'Private conflict detail'}:{id:payload.id,version:1}),{status:conflict?409:200});
  };
  try{
    assert.deepEqual(await manageAffairsRecord(account,'save_course_selection',payload),await manageAffairsRecord(account,'save_course_selection',payload));
    await assert.rejects(executeAffairsAction(account,'save_course_selection',payload),/Unsupported School Affairs action/);assert.equal(calls,2);
    conflict=true;await assert.rejects(manageAffairsRecord(account,'save_course_selection',payload),error=>{
      assert.equal((error as {status:number}).status,409);assert.match((error as Error).message,/Refresh and try again/);
      assert.doesNotMatch((error as Error).message,/Private conflict detail/);return true;
    });
  }finally{globalThis.fetch=original;}
});
test('anonymous course-selection data and manager requests fail before database access',async()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('No database access permitted');};
  try{
    for(const kind of ['read','save']){
      const result={status:0,headers:{} as Record<string,string>};
      const response={status(code:number){result.status=code;return response;},json(){},setHeader(name:string,value:string){result.headers[name]=value;}};
      if(kind==='read')await dataHandler({method:'GET',headers:{}},response);
      else await managerHandler({method:'POST',headers:{},body:{kind:'save_course_selection',payload:{}}},response);
      assert.equal(result.status,401);assert.match(result.headers['Cache-Control'],/no-store/);
    }
    assert.equal(calls,0);
  }finally{globalThis.fetch=original;}
});
test('snapshots page all caller phase rows and keep admin records separate with matching owner labels',async()=>{
  const original=globalThis.fetch;let admin=false;
  const own=Array.from({length:501},(_,index)=>({...row,id:'own-'+index})),other={...row,id:'other',user_id:'10000000-0000-4000-8000-000000000002'};
  const seen:URL[]=[];
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input)),table=url.pathname.split('/').at(-1);seen.push(url);
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer caller-token');let result:unknown=[];
    if(table==='affairs_profiles')result=url.searchParams.get('user_id')==='in.(10000000-0000-4000-8000-000000000002)'
      ?[{user_id:'10000000-0000-4000-8000-000000000002',display_name:'Same Name',email:'second@example.invalid',role:'student'}]
      :[{user_id:'10000000-0000-4000-8000-000000000001',display_name:'Same Name',email:'first@example.invalid',role:admin?'admin':'student'}];
    if(table==='affairs_course_selection_records'){
      const filter=url.searchParams.get('user_id');if(filter)assert.equal(filter,'eq.10000000-0000-4000-8000-000000000001');else assert.equal(admin,true);
      assert.equal(url.searchParams.get('order'),'academic_year.desc,semester.desc,selection_phase.asc,row_order.asc,id.asc');
      const data=filter?own:[...own,other],offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit'));
      result=data.slice(offset,offset+limit);
    }
    return new Response(JSON.stringify(result));
  };
  try{
    const personal=await loadAffairsSnapshot(account) as {courseSelection:ReturnType<typeof mapCourseSelection>;admin?:unknown};
    assert.equal(personal.courseSelection.records.length,501);assert.equal(personal.admin,undefined);
    assert.ok(personal.courseSelection.records.every((record:{userId:string})=>record.userId==='10000000-0000-4000-8000-000000000001'));
    assert.ok(seen.some(url=>url.pathname.endsWith('/affairs_course_selection_records')&&url.searchParams.get('offset')==='500'));
    admin=true;
    const all=await loadAffairsSnapshot(account,true) as {courseSelection:ReturnType<typeof mapCourseSelection>;admin:{courseSelection:ReturnType<typeof mapCourseSelection>;profiles:Array<{user_id:string;email:string}>}};
    assert.equal(all.courseSelection.records.length,501);assert.equal(all.admin.courseSelection.records.length,502);
    assert.equal(all.admin.profiles.find(profile=>profile.user_id==='10000000-0000-4000-8000-000000000002')?.email,'second@example.invalid');
  }finally{globalThis.fetch=original;}
});
test('shared assistant answers private phase records locally and cites the distinct native destinations',async()=>{
  const original=globalThis.fetch,key=process.env.OPENAI_API_KEY;let requests=0;
  process.env.OPENAI_API_KEY='synthetic-key';globalThis.fetch=async()=>{requests++;throw new Error('Private course selections must stay local');};
  try{
    for(const [question,path] of [['My course-selection history',historyPath],['My timetable',timetablePath]]){
      const result=await answerPrivateAffairsQuestion(question,{...snapshot,checkedAt:'2026-11-12T00:00:00Z'});
      assert.equal(result.grounding.source,'account');const citation=result.citations[0];
      assert.ok(citation && typeof citation==='object' && 'url' in citation);assert.equal(citation.url,path);
      assert.match(result.answer,/Synthetic course/);
    }
    assert.equal(requests,0);
  }finally{globalThis.fetch=original;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
test('unrelated model fallback strips selection and admin records instead of transmitting private phase data',async()=>{
  const original=globalThis.fetch,key=process.env.OPENAI_API_KEY;let requests=0;
  process.env.OPENAI_API_KEY='synthetic-key';
  globalThis.fetch=async(_input,init)=>{
    requests++;const body=JSON.parse(String(init?.body)),input=JSON.parse(body.input[0].content);
    assert.equal(body.store,false);assert.equal(input.accountSnapshot.courseSelection,undefined);assert.equal(input.accountSnapshot.admin,undefined);
    assert.doesNotMatch(String(init?.body),/PRIVATE PHASE RECORD|PRIVATE ADMIN RECORD/);
    return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({answer:'Sample workspace assistance.',action_kind:'none'})}]}]}));
  };
  try{
    await answerPrivateAffairsQuestion('Please help me remember to review my plan',{
      ...snapshot,profile:{userId:'10000000-0000-4000-8000-000000000001',displayName:'Synthetic student',email:'qa@example.invalid',role:'student'},
      checkedAt:'2026-11-12T00:00:00Z',student:null,courses:[],charges:[],announcements:[],tasks:[],requests:[],
      courseSelection:mapCourseSelection([{...row,course_title:'PRIVATE PHASE RECORD'}]),
      admin:{courseSelection:mapCourseSelection([{...row,user_id:'another-owner',course_title:'PRIVATE ADMIN RECORD'}])},
    });
    assert.equal(requests,1);
  }finally{globalThis.fetch=original;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
