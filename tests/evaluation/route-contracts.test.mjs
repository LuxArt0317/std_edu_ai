import assert from 'node:assert/strict';
import {test} from 'node:test';
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

test('scenario bookkeeping preserves all 561 routes and all 59 raw semantic gaps',async()=>{
  const inventory=await discoverSurfaces();
  const cases=[...buildServiceCases(),...buildAccountCases({now:'2026-11-13T02:00:00Z'}),...buildPublicCases(inventory)];
  const report=assessCoverage({cases,results:[],inventory,sourceRevision:revision,requireLive:false});
  const join=(prefix,suffixes)=>suffixes.map(suffix=>prefix+suffix);
  const expected=[
    '/school-affairs/search',
    ...join('/school-affairs/menu/menu/',['custom','common','external','help','course','graduation']),
    ...join('/school-affairs/menu/aca/',['all','input','query','portal']),
    ...join('/school-affairs/menu/sao/',['all','input','query','portal']),
    ...join('/school-affairs/menu/swd/',['all','input','query']),
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
    '/campus-assistant','/campus-assistant?embed=1','/campus-directory','/local-pages',
  ];
  assert.equal(cases.length,931);assert.equal(report.coverage.routes.total,561);
  assert.equal(expected.length,59);assert.deepEqual(report.coverage.routes.missing,expected);
  assert.equal(report.browserAcceptance.total,561);assert.equal(report.browserAcceptance.requiredScenarios,566);
  assert.equal(report.coverage.routeFamilies.total,50);
  assert.deepEqual(report.coverage.routeFamilies.missing,['school-menus','dtm-submissions','legacy-route-aliases','authentication-transitions','account-information','assistant-sessions','campus-navigation']);
  assert.equal(report.releaseReady,false);assert.equal(report.totals.executed,0);
  assert.equal(report.failures.filter(row=>row.id==='routes.omitted').length,59);
});
