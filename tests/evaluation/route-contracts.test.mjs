import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {assessCoverage} from './coverage.mjs';
import {discoverSurfaces} from './surface-inventory.mjs';
import {buildAccountCases} from './account-cases.mjs';
import {buildServiceCases} from './service-cases.mjs';
import {buildPublicCases} from './public-cases.mjs';

const revision='offline-route-contract';
const observe=(route,extra={})=>({route,status:'passed',assistantPresent:true,keyboardUsable:true,sessionVerified:true,authenticated:true,...extra});
function assess(families,routeResults){
  return assessCoverage({cases:[],results:[],inventory:{services:[],tools:[],routeFamilies:families},sourceRevision:revision,
    browserAcceptance:{status:'passed',sourceRevision:revision,routeResults}});
}
const family=(id,routes,extra={})=>({id,routes,auth:'either',browserChecks:['assistantPresent','keyboardUsable','sessionVerified'],...extra});
const hasFailure=(report,id)=>report.browserAcceptance.failures.some(row=>row.id===id);

test('same route may have distinct required states, scenarios and frame contexts',()=>{
  const families=[family('assistant',['/assistant'],{browserScenarios:[
    {route:'/assistant',id:'standalone',frame:'top-level'},
    {route:'/assistant',id:'embedded',frame:'iframe'},
  ]})];
  const observations=['standalone','embedded'].flatMap(scenario=>[true,false].map(authenticated=>observe('/assistant',{
    scenario,frame:scenario==='embedded'?'iframe':'top-level',authenticated,
  })));
  const complete=assess(families,observations).browserAcceptance;
  assert.equal(complete.passed,true,JSON.stringify(complete));assert.equal(complete.total,1);
  assert.equal(complete.requiredScenarios,4);assert.equal(complete.observations,4);
  const missing=assess(families,observations.slice(0,3)).browserAcceptance;
  assert.equal(missing.passed,false);
  assert.deepEqual(missing.missingScenarios,[{route:'/assistant',scenario:'embedded',frame:'iframe',authState:'signed-out'}]);
});

test('wrong frame or unspecified authentication cannot satisfy a required state',()=>{
  const families=[family('assistant',['/assistant'],{browserScenarios:[{route:'/assistant',id:'embedded',frame:'iframe'}]})];
  const wrongFrame=assess(families,[observe('/assistant',{scenario:'embedded',frame:'top-level'})]);
  assert.equal(wrongFrame.browserAcceptance.passed,false);assert.ok(hasFailure(wrongFrame,'browser.unknownScenario'));
  const missingState=assess(families,[observe('/assistant',{scenario:'embedded',frame:'iframe',authenticated:undefined})]);
  assert.equal(missingState.browserAcceptance.passed,false);assert.ok(hasFailure(missingState,'browser.unexpectedAuthState'));
  assert.equal(missingState.browserAcceptance.missingScenarios.length,2);
});

test('an unknown scenario cannot conceal a failed observation or replace a declared context',()=>{
  const families=[family('assistant',['/assistant'])];
  const report=assess(families,[observe('/assistant'),observe('/assistant',{authenticated:false}),observe('/assistant',{scenario:'unregistered',status:'failed'})]);
  assert.equal(report.browserAcceptance.passed,false);assert.ok(hasFailure(report,'browser.unknownScenario'));
});

test('signed-out contracts cannot be downgraded and invalid inventory cannot report browser success',()=>{
  const downgraded=family('login',['/login'],{auth:'signed-out',browserScenarios:[{route:'/login',id:'page',frame:'top-level',auth:'public'}]});
  const report=assess([downgraded],[observe('/login',{authenticated:false})]);
  assert.ok(report.failures.some(row=>row.id==='routes.browserContractInvalid'));
  assert.equal(report.browserAcceptance.passed,false);assert.ok(hasFailure(report,'browser.inventoryInvalid'));
  const invalid=family('assistant',['/assistant'],{browserChecks:[],browserScenarios:[{
    route:'/assistant',id:'page',frame:'top-level',checks:['assistantPresent','keyboardUsable','sessionVerified'],
  }]});
  const otherwiseComplete=assess([invalid],[observe('/assistant'),observe('/assistant',{authenticated:false})]);
  assert.equal(otherwiseComplete.browserAcceptance.missingScenarios.length,0);
  assert.equal(otherwiseComplete.browserAcceptance.incompleteScenarios.length,0);
  assert.equal(otherwiseComplete.browserAcceptance.passed,false);assert.ok(hasFailure(otherwiseComplete,'browser.inventoryInvalid'));
});

test('account indicator requires both iframe account states, without a chatbot inside the widget',async()=>{
  const {routeFamilies}=await discoverSurfaces();
  const families=[routeFamilies.find(row=>row.id==='account-information')];
  const privacy=observe('/school-affairs/privacy',{authenticated:false});
  const widget=[true,false].map(authenticated=>observe('/account-status',{
    scenario:'account-indicator',frame:'iframe',authenticated,assistantPresent:false,accountStateVerified:true,
  }));
  const complete=assess(families,[privacy,...widget]).browserAcceptance;
  assert.equal(complete.passed,true,JSON.stringify(complete));assert.equal(complete.total,2);
  assert.equal(complete.requiredScenarios,3);
  const anonymousOnly=assess(families,[privacy,widget[1]]).browserAcceptance;
  assert.equal(anonymousOnly.passed,false);assert.equal(anonymousOnly.missingScenarios[0].authState,'signed-in');
  const launcherOnly=assess(families,[privacy,...widget.map(row=>({...row,assistantPresent:true,accountStateVerified:undefined}))]);
  assert.equal(launcherOnly.browserAcceptance.passed,false);assert.equal(launcherOnly.browserAcceptance.incompleteScenarios.length,2);
  const standalone=assess(families,[privacy,...widget.map(row=>({...row,frame:'top-level'}))]);
  assert.equal(standalone.browserAcceptance.passed,false);assert.ok(hasFailure(standalone,'browser.unknownScenario'));
});

async function transitionFixture(){
  const {routeFamilies}=await discoverSurfaces();
  const transition=routeFamilies.find(row=>row.id==='authentication-transitions');
  const observations=transition.browserScenarios.map(scenario=>observe(scenario.route,{
    scenario:scenario.id,frame:scenario.frame,assistantPresent:false,initialAuthenticated:scenario.initialAuthenticated,
    authenticated:scenario.resultingAuthenticated,resultingRoute:scenario.resultingRoute,
    navigationSucceeded:true,oauthParametersCleared:true,privateTranscriptCleared:true,
  }));
  return {transition,observations};
}

test('callback and sign-out contracts check the resulting state and destination, not a transient chatbot',async()=>{
  const {transition,observations}=await transitionFixture();
  assert.equal(transition.auth,'transition');assert.equal(observations.length,4);
  const report=assess([transition],observations).browserAcceptance;
  assert.equal(report.passed,true,JSON.stringify(report));assert.equal(report.total,2);
  assert.equal(report.requiredScenarios,4);assert.equal(report.observations,4);
  const missing=assess([transition],observations.filter(row=>row.scenario!=='callback-rejected')).browserAcceptance;
  assert.equal(missing.passed,false);assert.equal(missing.missingScenarios[0].scenario,'callback-rejected');
});

test('initial state, a spinner or a remaining account cannot masquerade as successful sign-in or sign-out',async()=>{
  const {transition,observations}=await transitionFixture();
  for(const [scenario,change] of [
    ['callback-success',{authenticated:false}],
    ['callback-success',{initialAuthenticated:undefined}],
    ['callback-success',{resultingRoute:'/school-affairs/auth/callback'}],
    ['callback-success',{resultingRoute:'/school-affairs#access_token=synthetic-sensitive-marker'}],
    ['callback-success',{oauthParametersCleared:false}],
    ['callback-rejected',{authenticated:true}],
    ['sign-out',{authenticated:true}],
    ['sign-out',{resultingRoute:'https://elsewhere.invalid/login'}],
    ['sign-out',{privateTranscriptCleared:false}],
    ['already-signed-out',{initialAuthenticated:true}],
  ]){
    const report=assess([transition],observations.map(row=>row.scenario===scenario?{...row,...change}:row));
    assert.equal(report.browserAcceptance.passed,false,JSON.stringify({scenario,change}));
  }
});

test('malformed or downgraded transition contracts fail closed',()=>{
  const base=family('transition',['/callback'],{auth:'transition',browserScenarios:[{
    route:'/callback',id:'callback-success',frame:'top-level',initialAuthenticated:false,resultingAuthenticated:true,
    resultingRoute:'/account',checks:['sessionVerified','navigationSucceeded'],
  }]});
  for(const change of [{auth:'public'},{resultingAuthenticated:undefined},{resultingRoute:'//elsewhere.invalid/'},{resultingRoute:'/account#code=synthetic'},{checks:['sessionVerified']},{route:'/unlisted'}]){
    const altered={...base,browserScenarios:base.browserScenarios.map(row=>({...row,...change}))};
    const report=assess([altered],[]);
    assert.ok(report.failures.some(row=>row.id==='routes.browserContractInvalid'),JSON.stringify(change));
    assert.equal(report.releaseReady,false);
  }
});

test('remote-learning inventory follows the authenticated workspace and distinct login/redirect states',async()=>{
  const {routeFamilies,services}=await discoverSurfaces();
  assert.equal(services.find(row=>row.id==='4-2').route,'/elearning');
  const workspace=routeFamilies.find(row=>row.id==='elearning');
  assert.equal(workspace.auth,'signed-in');
  assert.deepEqual(workspace.browserChecks,['assistantPresent','keyboardUsable','sessionVerified']);
  assert.deepEqual(workspace.routes,[
    '/elearning','/elearning/categories','/elearning/my-courses','/elearning/search','/elearning/category/:id','/elearning/notice/:id',
    '/elearning/course/:id','/elearning/course/:courseId/activity/:activityId',
    '/elearning/search?q=:query','/elearning/search?q=:query&page=:page','/elearning/category/:id?page=:page',
  ]);
  // Guard the actual Content dispatcher, not a second claimed page catalog.
  const source=await readFile(new URL('../../src/features/public/elearning/ElearningWorkspace.tsx',import.meta.url),'utf8');
  const views=[...source.matchAll(/if\(view==='([^']+)'&&segments\.length===(\d)\)/gu)].map(match=>[match[1],Number(match[2])]);
  assert.deepEqual(views,[['categories',1],['my-courses',1],['search',1],['category',2],['notice',2]]);
  assert.match(source,/if\(!user&&!isLogin\)return <Navigate/u);
  const login=routeFamilies.find(row=>row.id==='elearning-authentication');
  const validLogin=[observe('/elearning/login',{scenario:'signed-out-login',authenticated:false}),
    observe('/elearning/login',{scenario:'already-signed-in',initialAuthenticated:true,authenticated:true,
      resultingRoute:'/elearning',navigationSucceeded:true,assistantPresent:false})];
  assert.equal(assess([login],validLogin).browserAcceptance.passed,true);
  assert.equal(assess([login],validLogin.slice(0,1)).browserAcceptance.passed,false);
  assert.equal(assess([login],validLogin.map(row=>row.scenario==='already-signed-in'?{...row,resultingRoute:'/elearning/login'}:row)).browserAcceptance.passed,false);
  const redirects=routeFamilies.find(row=>row.id==='elearning-entry-transitions');
  assert.equal(redirects.auth,'transition');
  const actual=value=>value.replaceAll(':id','123');
  const entries=redirects.browserScenarios.map(row=>observe(actual(row.route),{
    scenario:row.id,initialAuthenticated:row.initialAuthenticated,authenticated:row.resultingAuthenticated,
    resultingRoute:actual(row.resultingRoute),navigationSucceeded:true,assistantPresent:false,
  }));
  assert.equal(assess([redirects],entries).browserAcceptance.passed,true);
  assert.equal(assess([redirects],entries.map(row=>({...row,navigationSucceeded:false}))).browserAcceptance.passed,false);
  assert.equal(assess([redirects],entries.map(row=>row.scenario==='signed-in-category'
    ?{...row,resultingRoute:'/elearning/category/987'}:row)).browserAcceptance.passed,false);
  assert.equal(assess([redirects],entries.map(row=>row.scenario==='signed-out-category'
    ?{...row,resultingRoute:'/elearning/login?next='+encodeURIComponent('/elearning/category/987')}:row)).browserAcceptance.passed,false);
});

test('route coverage retains only unresolved semantic cases after adding public assistant guidance',async()=>{
  const inventory=await discoverSurfaces();
  const cases=[...buildServiceCases(),...buildAccountCases({now:'2026-11-13T02:00:00Z'}),...buildPublicCases(inventory)];
  const report=assessCoverage({cases,results:[],inventory,sourceRevision:revision,requireLive:false});
  const join=(prefix,suffixes)=>suffixes.map(suffix=>prefix+suffix);
  const expected=[
    ...join('/school-affairs/menu/menu/',['custom','common','external','help','course','graduation']),
    ...join('/school-affairs/menu/aca/',['all','input','query','portal']),
    ...join('/school-affairs/menu/sao/',['all','input','query','portal']),
    '/school-affairs/menu/swd/all',
    ...join('/school-affairs/menu/rdd/',['all','input','query','portal']),
    ...join('/school-affairs/menu/personal/',['all','input']),
    ...join('/school-affairs/menu/infoSystem/',['all','library']),
    ...join('/school-affairs/services/leave/',['index','archive','periods','edit/:id']),
    ...join('/school-affairs/services/internship/',['contract','self_assessment','company','directory']),
    '/school-affairs/services/12-4?course=%3Aid','/school-affairs/services/12-4?syllabus=%3Aid',
    '/dtm/dashboard','/dtm/my','/dtm/grades','/dtm/course/:id/materials','/dtm/course/:id/assignments',
    '/dtm/course/:courseId/assignment/:assignmentId','/dtm/course/:courseId/assignment/:assignmentId/edit',
    '/ePortal/index.asp','/ePortal/apMenu.asp','/school-sites/dtm.stu.edu.tw',
    '/school-affairs/login','/dtm/login','/dtm/login/index.php','/ePortal/login.asp','/auth/realms/stuarm/protocol/saml',
    '/school-affairs/auth/callback','/school-affairs/signed-out','/school-affairs/privacy','/account-status',
    '/campus-assistant?embed=1','/campus-directory','/local-pages',
  ];
  const added=[
    '/elearning/categories','/elearning/search','/elearning/category/:id','/elearning/notice/:id',
    '/elearning/search?q=%3Aquery',
    '/elearning/search?page=%3Apage&q=%3Aquery','/elearning/category/:id?page=%3Apage','/elearning/login',
    '/school-affairs/services/4-2','/school-sites/elearning.stu.edu.tw','/school-sites/elearning.stu.edu.tw/login/index.php',
    '/school-sites/elearning.stu.edu.tw/course/index.php?categoryid=48',
  ];
  const reproductionIds=['record-overview','current-courses-year','remaining-balance','interview-help','completed-subject','friday-class']
    .map(id=>'account:reproduction-'+id);
  const nativeIds=['student-conduct-literal','student-conduct-empty','student-conduct-detail-unavailable',
    'student-loan-literal','student-loan-empty','student-loan-document-unavailable'].map(id=>'account:'+id);
  const aidIds=['salary-count','salary-multipart','salary-tax','claim','both','empty','bank-unavailable','foreign'].map(id=>'account:aid-payments-'+id);
  const dtmIds=['feedback','absent','total','saved-total','tail'].map(id=>'account:dtm-native-report-'+id);
  const elearningIds=['enrollment','enrollment-mixed','enrollment-empty','grades-unlinked'].map(id=>'account:elearning-'+id);
  const facilityIds=['detail-status','status-not-physical-proof','latest-note','latest-blank','no-review-event','owned-list','all-overrides-detail',
    'ambiguous-reference','exact-not-found','empty-owned-list','read-only-action','foreign-account','anonymous','compound-next-class','compound-reversed'].map(id=>'account:facility-repair-'+id);
  const outlineIds=['videos','feedback-and-slides','follow-up-slides','mixed-enrollments','crossed-access'].map(id=>'account:elearning-outline-'+id);
  const dormitoryIds=['saved-empty','saved-unknown','missing-metadata','empty-not-clearance','details-unavailable','document-unavailable',
    'follow-up','chinese-empty','mixed-housing','mixed-tuition'].map(id=>'account:dormitory-conduct-'+id);
  const receiptIds=['housing-receipt-metadata','housing-receipt-term-prefix','housing-receipt-and-bed','housing-bed-and-receipt','housing-receipt-and-balance','housing-receipt-excluded','housing-receipt-foreign','empty-housingApplications'].map(id=>'account:'+id);
  const addedPrivacyIds=['anonymous-records-studentConduct','anonymous-records-studentLoan','anonymous-records-aidPayments','anonymous-records-dtmGradeReport','anonymous-records-dtmAssignment',
    'anonymous-records-elearningEnrollments','anonymous-records-facilityRepairs','anonymous-records-elearningOutline','anonymous-records-dormitoryConduct','anonymous-records-feeRemission','anonymous-records-healthExaminations','anonymous-records-counselingAppointments','anonymous-records-graduationClearance','anonymous-records-tutorEvaluation','anonymous-records-teachingFeedback','anonymous-records-housingApplications'];
  const menuIds=['public-affairs-system-search','public-affairs-facilities-input','public-affairs-facilities-query'];
  const newIds=[...reproductionIds,...nativeIds,...aidIds,...dtmIds,...elearningIds,...facilityIds,...outlineIds,...dormitoryIds,...receiptIds,...addedPrivacyIds,...menuIds,'public-study-first-week'];
  assert.equal(cases.filter(row=>!newIds.includes(row.id)).length,945);
  for(const ids of [reproductionIds,nativeIds,aidIds,dtmIds,elearningIds,facilityIds,outlineIds,dormitoryIds,receiptIds,addedPrivacyIds,menuIds])
    assert.deepEqual(cases.filter(row=>ids.includes(row.id)).map(row=>row.id).sort(),[...ids].sort());
  assert.equal(report.coverage.routes.total,576);
  assert.equal(expected.length,55);assert.equal(added.length,12);
  assert.deepEqual(report.coverage.routes.missing.filter(route=>!added.includes(route)),expected);
  assert.deepEqual(report.coverage.routes.missing.filter(route=>added.includes(route)),added);
  assert.equal(report.coverage.routes.missing.length,67);
  assert.equal(report.browserAcceptance.total,576);assert.equal(report.browserAcceptance.requiredScenarios,586);
  assert.equal(report.coverage.routeFamilies.total,53);
  assert.deepEqual(report.coverage.routeFamilies.missing,['dtm-submissions','elearning-authentication','elearning-entry-transitions','legacy-route-aliases','authentication-transitions','account-information','assistant-sessions','campus-navigation']);
  assert.equal(report.releaseReady,false);assert.equal(report.totals.executed,0);
  assert.equal(report.failures.filter(row=>row.id==='routes.omitted').length,67);
});
