import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {answerGraduationReview,graduationReviewMaxPayloadBytes,graduationReviewNavigation,graduationReviewPath,graduationReviewPayloadBytes,
  graduationReviewKinds,graduationReviewPaths,graduationReviewReadSource,isGraduationReviewKind,isGraduationReviewQuestion,mapGraduationReview,validateGraduationReviewContent} from '../../server/graduationReview.js';

const status=()=>({text:null as string|null,indicator:null as 'passed'|'attention'|null});
const course=(id='course-one')=>({id,sequenceText:'1',title:'Synthetic actual course',credits:0 as number|null,requiredElectiveText:null as string|null,yearText:null as string|null,transferText:null as string|null});
const fixture=()=>({reportedAt:'2026-11-13T00:00:00Z' as string|null,
  identity:{studentNumber:null,studentName:null,departmentName:null,yearText:null,enrollmentStatusText:null,curriculumCohortText:null,doubleMajorText:null,minorText:null},
  educationProgram:status(),foreignLanguageCompletion:status(),englishRequirement:{text:'Synthetic pending status',indicator:'attention' as const},
  graduationReview:{text:'Synthetic review text, not an eligibility rule',indicator:null as 'passed'|'attention'|null,note:null as string|null},
  languageRequirements:[{id:'language-one',label:'Synthetic language',status:status(),requiredCredits:12,matchedCredits:0,missingCredits:null as number|null}],
  categories:[{id:'category-one',label:'Synthetic category',requiredElectiveText:null as string|null,requiredCredits:20,completedCredits:7.25,matchedCredits:0,
    excludedCredits:null as number|null,status:status(),detailSubtotalCredits:99,requirements:[{id:'requirement-one',sequenceText:'1',title:'Synthetic required course',
      moduleText:null as string|null,credits:3 as number|null,requiredElectiveText:null as string|null,yearText:null as string|null,transferText:null as string|null,indicator:null as 'passed'|'attention'|null,
      matchedCourses:[course()]}]}],otherCourses:[course('other-one')]});
const row=(report=fixture())=>({id:'report-one',user_id:'student-one',report_kind:'academic_services',report,source_mode:'local_demo',version:1,created_at:'2026-11-13T00:00:00Z',updated_at:'2026-11-13T00:00:00Z'});
const snapshot=()=>({profile:{userId:'student-one'},graduationReview:mapGraduationReview([row()])});

test('valid local reference reports preserve null, zero and explicit non-reconciled credits',()=>{
  const report=fixture();assert.equal(validateGraduationReviewContent(report),null);
  const data=mapGraduationReview([row(report)]);assert.deepEqual(data.reports[0].categories,report.categories);
  assert.equal(data.reports[0].categories[0].matchedCredits,0);assert.equal(data.reports[0].categories[0].excludedCredits,null);
  assert.equal(data.reports[0].categories[0].detailSubtotalCredits,99);assert.equal(data.reports[0].otherCourses[0].credits,0);
  assert.equal(data.reports[0].userId,'student-one');assert.equal(data.reports[0].sourceMode,'local_demo');
});
test('required report and nested nullable keys cannot be omitted or expanded with ignored private data',()=>{
  const targets=(value:ReturnType<typeof fixture>)=>[value,value.identity,value.educationProgram,value.graduationReview,
    value.languageRequirements[0],value.languageRequirements[0].status,value.categories[0],value.categories[0].status,
    value.categories[0].requirements[0],value.categories[0].requirements[0].matchedCourses[0],value.otherCourses[0]];
  for(let i=0;i<targets(fixture()).length;i++){
    const extra=fixture();Object.assign(targets(extra)[i],{privateIdentity:'DO-NOT-STORE'});assert.ok(validateGraduationReviewContent(extra),`unknown nested key ${i}`);
    const missing=fixture(),target=targets(missing)[i] as Record<string,unknown>;delete target[Object.keys(target)[0]];
    assert.ok(validateGraduationReviewContent(missing),`missing nested key ${i}`);
  }
  for(const value of [null,[],{},'report',true,7])assert.ok(validateGraduationReviewContent(value));
});
test('credits reject coercion, nonfinite values, extra precision and ranges without rejecting exact hundredths',()=>{
  for(const value of [null,0,0.01,1.01,7.25,999.99,1000]){
    const report=fixture();report.otherCourses[0].credits=value;assert.equal(validateGraduationReviewContent(report),null,String(value));
  }
  for(const value of [-0.01,1000.01,0.001,1.111,NaN,Infinity,'0','3.5','',false,{}]){
    const report=fixture();Object.assign(report.otherCourses[0],{credits:value});assert.ok(validateGraduationReviewContent(report),String(value));
  }
});
test('reported timestamps require real calendar dates and explicit supported timezone offsets',()=>{
  for(const value of [null,'2024-02-29T23:59:59.123456+08:00','2000-02-29T00:00:00Z','2026-11-13T12:00:00-05:30']){
    const report=fixture();report.reportedAt=value;assert.equal(validateGraduationReviewContent(report),null,String(value));
  }
  for(const value of ['2026-02-29T00:00:00Z','2026-04-31T00:00:00Z','1900-02-29T00:00:00Z','0000-01-01T00:00:00Z',
    '2026-13-01T00:00:00Z','2026-01-00T00:00:00Z','2026-01-01T24:00:00Z','2026-01-01T00:00:60Z',
    '2026-01-01T00:00:00','2026-01-01','2026-01-01T00:00:00+16:00','2026-01-01T00:00:00.1234567Z','']){
    const report=fixture();report.reportedAt=value;assert.ok(validateGraduationReviewContent(report),value);
  }
});
test('text limits count Unicode characters, reject PostgreSQL-invalid strings and keep optional empty text',()=>{
  const report=fixture();report.otherCourses[0].title='😀'.repeat(160);report.graduationReview.note='';assert.equal(validateGraduationReviewContent(report),null);
  report.otherCourses[0].title+='😀';assert.ok(validateGraduationReviewContent(report));
  for(const value of ['', ' \t\n\u00a0', '\u0000', '\ud800']){report.otherCourses[0].title=value;assert.ok(validateGraduationReviewContent(report));}
  for(const [key,max] of [['sequenceText',30],['requiredElectiveText',30],['yearText',30],['transferText',80]] as const){
    const value=fixture();value.otherCourses[0][key]='x'.repeat(max);assert.equal(validateGraduationReviewContent(value),null);
    value.otherCourses[0][key]+='x';assert.ok(validateGraduationReviewContent(value));
  }
  const note=fixture();note.graduationReview.note='x'.repeat(1000);assert.equal(validateGraduationReviewContent(note),null);
  note.graduationReview.note+='x';assert.ok(validateGraduationReviewContent(note));
});
test('status indicators remain explicit enums and cannot be inferred from status text or credits',()=>{
  for(const indicator of [null,'passed','attention']){const report=fixture();Object.assign(report.graduationReview,{text:'Literal text',indicator});assert.equal(validateGraduationReviewContent(report),null);}
  for(const indicator of ['failed','eligible',true,1,'']){const report=fixture();Object.assign(report.graduationReview,{indicator});assert.ok(validateGraduationReviewContent(report));}
});
test('stable IDs are unique per array, not globally, and array limits include every nested course row',()=>{
  const report=fixture();report.otherCourses[0].id=report.categories[0].requirements[0].matchedCourses[0].id;assert.equal(validateGraduationReviewContent(report),null);
  report.otherCourses.push({...report.otherCourses[0]});assert.ok(validateGraduationReviewContent(report));
  for(const id of ['', 'with space','_bad','x'.repeat(81)]){const value=fixture();value.categories[0].id=id;assert.ok(validateGraduationReviewContent(value));}
  const languages=fixture();languages.languageRequirements=Array.from({length:101},(_,i)=>({...languages.languageRequirements[0],id:`l${i}`}));assert.ok(validateGraduationReviewContent(languages));
  const categories=fixture();categories.categories=Array.from({length:101},(_,i)=>({...categories.categories[0],id:`c${i}`,requirements:[]}));assert.ok(validateGraduationReviewContent(categories));
  const rows=fixture();rows.otherCourses=Array.from({length:999},(_,i)=>({...course(`r${i}`),title:'x'}));
  assert.match(validateGraduationReviewContent(rows)!,/1000 combined/);
  const sparse=fixture();sparse.otherCourses=new Array(1);assert.ok(validateGraduationReviewContent(sparse));
  assert.equal(graduationReviewPayloadBytes(new Array(1)),Infinity);
});
test('JSONB payload byte accounting includes separators, UTF-8, escaping and complete envelope',()=>{
  const value={value:'測試😀',zero:0,missing:null,lines:'a\nb'};
  assert.equal(graduationReviewPayloadBytes(value),new TextEncoder().encode('{"value": "測試😀", "zero": 0, "missing": null, "lines": "a\\nb"}').byteLength);
  assert.equal(graduationReviewMaxPayloadBytes,131072);
  assert.ok(graduationReviewPayloadBytes({id:'synthetic',report:fixture()})>graduationReviewPayloadBytes(fixture()));
  for(const value of [undefined,NaN,Infinity,new Date(),{x:undefined},{x:'\u0000'}])assert.equal(graduationReviewPayloadBytes(value),Infinity);
  const cycle:Record<string,unknown>={};cycle.self=cycle;assert.equal(graduationReviewPayloadBytes(cycle),Infinity);
  const big=fixture();big.otherCourses=Array.from({length:500},(_,i)=>({...course(`r${i}`),title:'測'.repeat(160)}));
  assert.match(validateGraduationReviewContent(big)!,/131072-byte/);
});
test('mapper envelope cannot be overridden by unexpected nested report owner fields',()=>{
  const record={...row(),report:{...fixture(),userId:'student-two',id:'forged',reportKind:'legacy',sourceMode:'official',version:99}};
  const mapped=mapGraduationReview([record]).reports[0];assert.equal(mapped.userId,'student-one');assert.equal(mapped.id,'report-one');
  assert.equal(mapped.sourceMode,'local_demo');assert.equal(mapped.version,1);assert.equal(mapped.reportKind,'academic_services');
});
test('report kinds are required exact envelope discriminants, never inferred from report content',()=>{
  assert.deepEqual(graduationReviewKinds,['academic_services','legacy']);
  const report=fixture(),original=structuredClone(report);
  for(const kind of graduationReviewKinds){
    assert.equal(isGraduationReviewKind(kind),true);
    const mapped=mapGraduationReview([{...row(report),report_kind:kind}]).reports[0];
    assert.equal(mapped.reportKind,kind);assert.deepEqual(mapped.categories,report.categories);
  }
  for(const kind of [undefined,null,'','modern','academic-services','Academic_services','LEGACY',' legacy','legacy ',0,true,[],{}]){
    assert.equal(isGraduationReviewKind(kind),false);assert.deepEqual(mapGraduationReview([{...row(report),report_kind:kind}]),{reports:[]});
  }
  const missing:Record<string,unknown>=row(report);delete missing.report_kind;assert.deepEqual(mapGraduationReview([missing]),{reports:[]});
  assert.deepEqual(report,original);
  assert.ok(validateGraduationReviewContent({...report,reportKind:'legacy'}),'Kind belongs to the envelope, not nested report JSON.');
});
test('same-owner modern and legacy reports remain independent across mapping, selectors and answers',async()=>{
  const {ownGraduationReview,graduationReviewPaths:frontendPaths}=await import(new URL('../../src/services/graduationReview.ts',import.meta.url).href);
  assert.deepEqual(frontendPaths,graduationReviewPaths);
  const modern=row(),legacyReport=fixture();legacyReport.graduationReview.text='LEGACY ONLY STATUS';legacyReport.categories[0].detailSubtotalCredits=0;
  const legacy={...row(legacyReport),id:'legacy-one',report_kind:'legacy',version:4};
  const bundle=mapGraduationReview([legacy,modern]),before=structuredClone(bundle),data={profile:{userId:'student-one'},graduationReview:bundle};
  assert.equal(ownGraduationReview(bundle,'student-one')?.id,modern.id);
  assert.equal(ownGraduationReview(bundle,'student-one','legacy')?.id,legacy.id);
  for(const path of [graduationReviewPath,'']){
    const answer=answerGraduationReview('My graduation review details',data,path)!;
    assert.equal(answer.url,graduationReviewPath);assert.match(answer.answer,/Academic Services graduation report \(13-1\)/);
    assert.match(answer.answer,/detail subtotal 99/);assert.doesNotMatch(answer.answer,/LEGACY ONLY STATUS/);
  }
  for(const path of [graduationReviewPaths.legacy,graduationReviewPaths.legacy+'/?section=details#top']){
    assert.equal(isGraduationReviewQuestion('My status',path),true);
    const answer=answerGraduationReview('My graduation review details',data,path)!;
    assert.equal(answer.url,graduationReviewPaths.legacy);assert.match(answer.answer,/Legacy graduation report \(15-2\)/);
    assert.match(answer.answer,/LEGACY ONLY STATUS/);assert.match(answer.answer,/detail subtotal 0/);assert.doesNotMatch(answer.answer,/detail subtotal 99/);
  }
  assert.equal(answerGraduationReview('My legacy graduation review',data)!.url,graduationReviewPaths.legacy);
  assert.equal(answerGraduationReview('我的15-2畢業檢核',data)!.url,graduationReviewPaths.legacy);
  assert.deepEqual(bundle,before,'Selection and answers must not mutate either independently stored report.');
});
test('absent requested report kind explains separate availability without substituting content',async()=>{
  const {ownGraduationReview}=await import(new URL('../../src/services/graduationReview.ts',import.meta.url).href);
  const legacy=mapGraduationReview([{...row(),report_kind:'legacy'}]),data={profile:{userId:'student-one'},graduationReview:legacy};
  assert.equal(ownGraduationReview(legacy,'student-one'),null);
  const answer=answerGraduationReview('My graduation credits',data)!;
  assert.equal(answer.url,graduationReviewPath);assert.match(answer.answer,/no saved Academic Services/);
  assert.match(answer.answer,/separate legacy \(15-2\) report/);assert.match(answer.answer,/not substitutes/);
  assert.ok(answer.answer.includes(graduationReviewPaths.legacy));assert.doesNotMatch(answer.answer,/Synthetic|detail subtotal|matched 0/);
  const opposite=answerGraduationReview('My graduation review',snapshot(),graduationReviewPaths.legacy)!;
  assert.equal(opposite.url,graduationReviewPaths.legacy);assert.match(opposite.answer,/no saved Legacy/);
  assert.match(opposite.answer,/separate Academic Services \(13-1\) report/);assert.doesNotMatch(opposite.answer,/Synthetic/);
});
test('modern 15-1 alias supports noun-light follow-ups and overrides previous legacy context',()=>{
  const legacyReport=fixture();legacyReport.graduationReview.text='LEGACY FOLLOW-UP STATUS';
  const data={profile:{userId:'student-one'},graduationReview:mapGraduationReview([row(),{...row(legacyReport),id:'legacy-one',report_kind:'legacy'}])};
  const history=[{role:'user',content:'Show my legacy graduation report'}];
  for(const path of ['/school-affairs/services/15-1','/school-affairs/services/15-1/?section=credits#top']){
    for(const question of ['What is my status?','Which credits are missing?','我的狀態']){
      assert.equal(isGraduationReviewQuestion(question,path),true,`${path}: ${question}`);
      const answer=answerGraduationReview(question,data,path,history)!;
      assert.equal(answer.url,graduationReviewPath);assert.match(answer.answer,/Synthetic review text/);
      assert.doesNotMatch(answer.answer,/LEGACY FOLLOW-UP STATUS/);
    }
  }
});
test('route-less noun-light follow-ups inherit only the preceding user report kind',()=>{
  const legacyReport=fixture();legacyReport.graduationReview.text='LEGACY FOLLOW-UP STATUS';
  const data={profile:{userId:'student-one'},graduationReview:mapGraduationReview([row(),{...row(legacyReport),id:'legacy-one',report_kind:'legacy'}])};
  const before=structuredClone(data);
  for(const previous of ['Show my legacy graduation report','我的15-2畢業檢核','我的舊版畢業檢核']){
    const history=[{role:'user',content:previous},{role:'assistant',content:'Academic Services graduation report (13-1)'}];
    const answer=answerGraduationReview('What is my status?',data,'',history)!;
    assert.equal(answer.url,graduationReviewPaths.legacy);assert.match(answer.answer,/LEGACY FOLLOW-UP STATUS/);
    assert.doesNotMatch(answer.answer,/Synthetic review text/);
    assert.equal(answerGraduationReview('Which credits are missing?',data,'',history)!.url,graduationReviewPaths.legacy);
    assert.equal(answerGraduationReview('My Academic Services graduation review',data,'',history)!.url,graduationReviewPath);
    assert.equal(answerGraduationReview('My status',data,graduationReviewPath,history)!.url,graduationReviewPath);
  }
  const modernHistory=[{role:'user',content:'My graduation review'},{role:'assistant',content:'Legacy graduation report (15-2)'}];
  assert.equal(answerGraduationReview('My status',data,'',modernHistory)!.url,graduationReviewPath);
  assert.equal(answerGraduationReview('My status',data,graduationReviewPaths.legacy,modernHistory)!.url,graduationReviewPaths.legacy);
  assert.equal(answerGraduationReview('My legacy graduation review',data,graduationReviewPath,modernHistory)!.url,graduationReviewPaths.legacy);
  assert.deepEqual(data,before);
});
test('intervening unrelated users and assistant-only mentions cannot restore older report context',()=>{
  for(const intervening of ['What is my fee balance?','Tell me about the weather','What is my status?']){
    const history=[{role:'user',content:'My legacy graduation review'},{role:'assistant',content:'Legacy report'},
      {role:'user',content:intervening},{role:'assistant',content:'My legacy graduation review'}];
    assert.equal(isGraduationReviewQuestion('Which credits are missing?','',history),false,intervening);
    assert.equal(answerGraduationReview('Which credits are missing?',snapshot(),'',history),null,intervening);
  }
  const assistantOnly=[{role:'assistant',content:'My legacy graduation review'}];
  assert.equal(isGraduationReviewQuestion('My status','',assistantOnly),false);
  assert.equal(answerGraduationReview('My status',snapshot(),'',assistantOnly),null);
});
test('strict caller ownership and unique requested kind fail closed on malformed snapshots',async()=>{
  const {ownGraduationReview}=await import(new URL('../../src/services/graduationReview.ts',import.meta.url).href);
  const own=mapGraduationReview([row()]).reports[0];
  for(const userId of ['', ' ', 'student-two']){
    assert.equal(ownGraduationReview({reports:[own]},userId),null);
    assert.doesNotMatch(answerGraduationReview('My graduation review',{profile:{userId},graduationReview:{reports:[own]}})!.answer,/Synthetic/);
  }
  const ownerless={...own};delete (ownerless as Partial<typeof own>).userId;
  const inherited=Object.assign(Object.create({userId:'student-one'}),ownerless) as typeof own;
  for(const record of [ownerless,inherited]){
    assert.equal(ownGraduationReview({reports:[record]},'student-one'),null);
    assert.doesNotMatch(answerGraduationReview('My graduation review',{profile:{userId:'student-one'},graduationReview:{reports:[record]}})!.answer,/Synthetic/);
  }
  const duplicate={reports:[own,{...own,id:'another-modern'}]};
  assert.equal(ownGraduationReview(duplicate,'student-one'),null);
  const answer=answerGraduationReview('My graduation review',{profile:{userId:'student-one'},graduationReview:duplicate})!;
  assert.match(answer.answer,/Multiple saved records/);assert.doesNotMatch(answer.answer,/Synthetic|detail subtotal/);
});
test('graduation answers quote report statuses and explicit credits without deriving eligibility or missing totals',()=>{
  const answer=answerGraduationReview('Show my graduation credits and missing requirements',snapshot())!;
  assert.equal(answer.url,graduationReviewPath);assert.match(answer.answer,/Report-stated Graduation review: Synthetic review text/);
  assert.match(answer.answer,/required 12; matched 0; missing not recorded/);
  assert.match(answer.answer,/required 20; completed 7.25; matched 0; excluded not recorded; detail subtotal 99/);
  assert.match(answer.answer,/not a calculation or decision of graduation eligibility/);
  assert.doesNotMatch(answer.answer,/missing 12|missing 20|missing 12.75|eligible to graduate|total credits 3/);
  const eligibility=answerGraduationReview('Can I graduate?',snapshot())!;
  assert.match(eligibility.answer,/Report-stated Graduation review/);assert.doesNotMatch(eligibility.answer,/Yes|No, you/);
});
test('course details use explicit matching arrays and account ownership, never admin fallback',()=>{
  const mine=row(),foreign={...row(),id:'foreign',user_id:'student-two',report:{...fixture(),graduationReview:{text:'PRIVATE OTHER REPORT',indicator:null,note:null}}};
  const data={profile:{userId:'student-one'},graduationReview:mapGraduationReview([foreign,mine])};
  const answer=answerGraduationReview('My graduation review course details',data)!;
  assert.match(answer.answer,/Required course Synthetic required course/);assert.match(answer.answer,/Matched course Synthetic actual course: credits 0/);
  assert.match(answer.answer,/Other actual course Synthetic actual course: credits 0/);assert.doesNotMatch(answer.answer,/PRIVATE OTHER/);
  for(const value of [{graduationReview:data.graduationReview},{profile:{userId:'empty'},graduationReview:data.graduationReview},
    {profile:{userId:'empty'},admin:{graduationReview:data.graduationReview}}]){
    assert.match(answerGraduationReview('My graduation review',value)!.answer,/no saved Academic Services graduation report/);
    assert.doesNotMatch(answerGraduationReview('My graduation review',value)!.answer,/PRIVATE OTHER|Synthetic required/);
  }
});
test('predicate follows report context while yielding unrelated records, navigation and actions',()=>{
  for(const question of ['My graduation review','我的畢業學分檢核','Can I graduate?','My degree audit'])assert.equal(isGraduationReviewQuestion(question),true,question);
  assert.equal(isGraduationReviewQuestion('Which credits are missing?',graduationReviewPath),true);
  assert.equal(isGraduationReviewQuestion('What is my status?','',[{role:'user',content:'My graduation review'}]),true);
  assert.equal(isGraduationReviewQuestion('My credits'),false);
  for(const question of ['My DTM grades','My transcript','我的選課紀錄','My timetable','My transfer credits','我的抵免學分','My credit-load history',
    'My fee balance','My attendance records','Where can I find graduation review?','Where is my degree audit?',
    'Remind me to review graduation credits','新增待辦：畢業檢核'])assert.equal(isGraduationReviewQuestion(question,graduationReviewPath),false,question);
});
test('natural graduation readiness and remaining-credit requests use explicit report values outside report routes',()=>{
  for(const question of ['How many credits do I still need to graduate?','Am I ready to graduate?','What is my graduation status?',
    'Do I qualify for graduation?','我還差多少學分才能畢業？']){
    assert.equal(isGraduationReviewQuestion(question),true,question);
    const answer=answerGraduationReview(question,snapshot())!;
    assert.equal(answer.url,graduationReviewPath);assert.match(answer.answer,/Synthetic review text/);
    assert.match(answer.answer,/not a calculation or decision of graduation eligibility|不計算或判定畢業資格/);
    assert.doesNotMatch(answer.answer,/You are ready|You qualify|You need 12|您已符合|尚缺 12/);
  }
});
test('large report answers bound every presented collection, disclose row coverage and preserve complete stored content',()=>{
  const report=fixture();
  const requirement=structuredClone(report.categories[0].requirements[0]);
  report.languageRequirements=Array.from({length:100},(_,i)=>({...report.languageRequirements[0],id:`language-${i}`,label:`Synthetic language ${i}`}));
  report.categories=Array.from({length:100},(_,i)=>({...report.categories[0],id:`category-${i}`,label:`Synthetic category ${i}`,requirements:i<25?
    [{...requirement,id:`requirement-${i}`,title:`SyntheticRequired${i}`,matchedCourses:[{...course(`matched-${i}`),title:`SyntheticMatched${i}`}]}]:[]}));
  report.otherCourses=Array.from({length:150},(_,i)=>({...course(`course-${i}`),title:`SyntheticCourse${i.toString().padStart(3,'0')}`}));
  assert.equal(validateGraduationReviewContent(report),null);
  const data={profile:{userId:'student-one'},graduationReview:mapGraduationReview([row(report)])};
  const saved=structuredClone(data.graduationReview);
  const answer=answerGraduationReview('Show all my graduation review course details and credits',data)!;
  assert.match(answer.answer,/Language rows shown: 10 of 100/);assert.match(answer.answer,/Category rows shown: 10 of 100/);
  assert.match(answer.answer,/Course-detail rows shown: 20 of 200/);assert.match(answer.answer,/shows only part of the report/);
  assert.match(answer.answer,/all saved rows remain available/);assert.ok(answer.answer.includes(graduationReviewPath));
  assert.doesNotMatch(answer.answer,/SyntheticCourse149|SyntheticMatched24/);assert.ok(answer.answer.length<12000);
  assert.deepEqual(data.graduationReview,saved,'Answer presentation cannot mutate or truncate stored report arrays.');
  const named=answerGraduationReview('Show graduation review course details for SyntheticCourse149',data)!;
  assert.match(named.answer,/SyntheticCourse149: credits 0/);assert.match(named.answer,/Named course rows shown: 1 of 1 matches/);
  assert.match(named.answer,/full report contains 200 course-detail rows/);assert.match(named.answer,/shows only part of the report/);
  const nested=answerGraduationReview('Show graduation review course details for SyntheticMatched24',data)!;
  assert.match(nested.answer,/SyntheticMatched24: credits 0; matched to SyntheticRequired24/);
  assert.deepEqual(data.graduationReview,saved);
});
test('source contract, ordered private read source and draft mutation boundary remain explicit',async()=>{
  const frontendUrl=new URL('../../src/services/graduationReview.ts',import.meta.url).href;
  const {graduationLanguageColumns,graduationCategoryColumns,graduationReviewNotes}=await import(frontendUrl);
  assert.deepEqual([...graduationLanguageColumns],['課程類別','是否通過','應修學分','符合學分','尚缺學分']);
  assert.equal(graduationCategoryColumns.length,7);assert.match(graduationReviewNotes[0],/參考/);
  assert.deepEqual(graduationReviewReadSource,{table:'affairs_graduation_reviews',order:'user_id.asc,id.asc'});
  assert.equal(graduationReviewNavigation.localUrl,graduationReviewPath);
  const migration=await readFile(new URL('../../supabase/migrations/20261112130000_graduation_review.sql',import.meta.url),'utf8');
  assert.match(migration,/report_kind text not null check\(report_kind in \('academic_services','legacy'\)\)/);
  assert.match(migration,/unique\(user_id,report_kind\)/);assert.doesNotMatch(migration,/user_id uuid not null unique/);
  assert.match(migration,/new.report_kind is distinct from old.report_kind/);
  assert.match(migration,/existing.report_kind<>v_report_kind/);
  assert.match(migration,/jsonb_typeof\(p_payload->'report_kind'\) is distinct from 'string'/);
  assert.match(migration,/where user_id=owner_id and report_kind=v_report_kind and id<>record_id/);
  assert.match(migration,/insert into public.affairs_graduation_reviews\(id,user_id,report_kind,report\)/);
  assert.doesNotMatch(migration,/do update set[^;]*report_kind=/);
  assert.match(migration,/enable row level security/);assert.match(migration,/receipt.payload<>p_payload/);
  assert.match(migration,/existing.user_id<>owner_id/);assert.match(migration,/coalesce\(existing.version,0\)<>expected/);
  assert.match(migration,/octet_length\(p_payload::text\)>131072/);assert.doesNotMatch(migration,/insert into auth\.users|insert into auth\.identities/i);
});
