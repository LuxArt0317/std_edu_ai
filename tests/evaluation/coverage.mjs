const liveMatches=(testCase,result)=>result.execution===(testCase.executionContract==='live-native'?'live-native':'live-model');
/** Full-bank acceptance accounting. Missing, skipped and unsupported are never silently green. */
const identity=value=>typeof value==='string'?value:value?.id ?? value?.serviceId ?? value?.name;
const unique=values=>[...new Set(values)];
const aliases=item=>typeof item==='object' && Array.isArray(item?.routes)?item.routes:[];
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const resultKind=result=>result?.executed===false||result?.failureKind==='setup'?'setup':result?.failureKind==='infrastructure'?'infrastructure':'behavior';
const wasExecuted=result=>Boolean(result)&&resultKind(result)!=='setup';
const passedBehavior=result=>wasExecuted(result)&&resultKind(result)==='behavior'&&result.passed===true&&Array.isArray(result.checks)&&result.checks.length>0&&result.checks.every(check=>check.passed===true);

function localRoute(value) {
  if(typeof value!=='string'||!value||value.startsWith('//'))return null;
  try{
    const url=new URL(value,'https://stu.best');
    if(url.origin!=='https://stu.best'||url.username||url.password)return null;
    const path=decodeURI(url.pathname).replace(/\/+$/,'')||'/';
    const query=[...url.searchParams].sort(([a,av],[b,bv])=>a.localeCompare(b)||av.localeCompare(bv));
    return {path,query,key:path+(query.length?'?'+new URLSearchParams(query).toString():'')};
  }catch{return null;}
}

/** Match declared path/query placeholders to real sample routes, never to literal :id. */
export function routeMatches(pattern,concrete) {
  const expected=localRoute(pattern),actual=localRoute(concrete);
  if(!expected||!actual||/(?:^|\/)[:*][^/]*(?:\/|$)/.test(actual.path))return false;
  try{if(actual.path.split('/').some(part=>/^[:*]/.test(decodeURIComponent(part))))return false;}catch{return false;}
  const expression=expected.path.split('/').map(part=>/^:[A-Za-z][\w]*$/.test(part)?'[^/?#:]+':part==='*'?'[^?#]+':escape(part)).join('/');
  if(!new RegExp('^'+expression+'$','u').test(actual.path)||expected.query.length!==actual.query.length)return false;
  return expected.query.every(([key,value],index)=>{
    const [actualKey,actualValue]=actual.query[index];
    return key===actualKey && (/^:[A-Za-z][\w]*$/.test(value)?Boolean(actualValue)&&!/^[:*]/.test(actualValue):value===actualValue);
  });
}

const browserCheckNames=['assistantPresent','keyboardUsable','sessionVerified','navigationSucceeded','accountStateVerified','privateTranscriptCleared','oauthParametersCleared','hostContextVerified','answerScopeVerified'];
const browserAuthModes=['public','signed-in','signed-out','either','transition'];
const scenarioName=value=>typeof value==='string'&&/^[a-z][a-z0-9-]{0,79}$/.test(value);
const validChecks=value=>Array.isArray(value)&&value.length>0&&unique(value).length===value.length&&value.every(key=>browserCheckNames.includes(key));
const observedState=result=>result.authenticated===true?'signed-in':result.authenticated===false?'signed-out':'unspecified';
const localDestination=value=>Boolean(localRoute(value))&&!new URL(value,'https://stu.best').hash;

function routeInventory(families,fail) {
  const paths=new Map();
  for(const family of families){
    const routes=aliases(family);
    if(!routes.length){fail('routes.inventoryMissing',`Route family ${identity(family)} has no concrete paths or patterns.`);continue;}
    const browserChecks=family.browserChecks||['assistantPresent','keyboardUsable','sessionVerified'];
    if(!validChecks(browserChecks)||!browserAuthModes.includes(family.auth??'public'))
      fail('routes.browserContractInvalid',`Route family ${identity(family)} needs explicit, recognized browser observations.`);
    const scenarios=family.browserScenarios??[];
    if(!Array.isArray(scenarios))fail('routes.browserContractInvalid',`Route family ${identity(family)} has invalid browser scenarios.`);
    const declared=Array.isArray(scenarios)?scenarios:[];
    for(const scenario of declared)if(!scenario||!routes.includes(scenario.route))
      fail('routes.browserContractInvalid',`Route family ${identity(family)} declares a scenario outside its route inventory.`);
    for(const route of routes){
      const normalized=localRoute(route);
      if(!normalized){fail('routes.inventoryInvalid',`Route family ${identity(family)} contains an invalid local route.`);continue;}
      const row=paths.get(normalized.key)||{route,pattern:normalized.key,families:[],contracts:[]};
      row.families=unique([...row.families,identity(family)]);
      const selected=declared.filter(scenario=>scenario?.route===route),seen=new Set();
      for(const scenario of selected.length?selected:[{id:'page',frame:'top-level'}]){
        const auth=scenario.auth??family.auth??'public',checks=scenario.checks??browserChecks;
        const key=scenario.id+':'+scenario.frame;
        const transition=auth==='transition';
        const hostContext=scenario.semanticContext==='host-route';
        const invalidContext=scenario.semanticContext!==undefined&&(!hostContext||scenario.frame!=='iframe'||auth!=='either'
          ||!normalized.query.length||!routeMatches(route,route)||!routes.includes(normalized.path)
          ||!validChecks(checks)||!['hostContextVerified','answerScopeVerified'].every(check=>checks.includes(check)));
        const invalid=!scenarioName(scenario.id)||!['top-level','iframe'].includes(scenario.frame)||!validChecks(checks)
          ||invalidContext||!browserAuthModes.includes(auth)||['either','signed-in','signed-out','transition'].includes(family.auth)&&auth!==family.auth
          ||seen.has(key)||transition&&(typeof scenario.initialAuthenticated!=='boolean'||typeof scenario.resultingAuthenticated!=='boolean'
            ||!localDestination(scenario.resultingRoute)||!checks.includes('sessionVerified')||!checks.includes('navigationSucceeded'))
          ||!transition&&['initialAuthenticated','resultingAuthenticated','resultingRoute'].some(name=>Object.hasOwn(scenario,name));
        if(invalid){fail('routes.browserContractInvalid',`Invalid browser scenario for ${normalized.key}.`);continue;}
        seen.add(key);
        if(hostContext)row.semanticHost=normalized.path;
        const states=auth==='either'?['signed-in','signed-out']:transition?[scenario.resultingAuthenticated?'signed-in':'signed-out']:[auth==='public'?'any':auth];
        for(const authState of states){
          const contract={scenario:scenario.id,frame:scenario.frame,authState,checks:[...checks],
            ...(transition?{initialAuthenticated:scenario.initialAuthenticated,resultingRoute:scenario.resultingRoute}:{})};
          const existing=row.contracts.find(item=>item.scenario===contract.scenario&&item.frame===contract.frame&&item.authState===contract.authState);
          if(existing){
            if(existing.initialAuthenticated!==contract.initialAuthenticated||existing.resultingRoute!==contract.resultingRoute)
              fail('routes.browserContractInvalid',`Conflicting browser scenarios for ${normalized.key}.`);
            existing.checks=unique([...existing.checks,...checks]);
          }else row.contracts.push(contract);
        }
      }
      paths.set(normalized.key,row);
    }
  }
  return [...paths.values()];
}

function assessBrowserAcceptance(input,routes,sourceRevision,inventoryFailures=[]) {
  const failures=[],fail=(id,detail)=>failures.push({id,detail});
  for(const failure of inventoryFailures)fail('browser.inventoryInvalid',failure.detail);
  if(!input)fail('browser.missing','No browser acceptance evidence was supplied. API answers do not prove page or chatbot usability.');
  else{
    if(input.status!=='passed')fail('browser.failed','Browser acceptance did not report a successful completed run.');
    if(!sourceRevision||input.sourceRevision!==sourceRevision)fail('browser.revisionMismatch','Browser acceptance must match the evaluated source revision.');
    if(!Array.isArray(input.routeResults))fail('browser.resultsMissing','Per-route browser observations are required.');
  }
  const results=Array.isArray(input?.routeResults)?input.routeResults:[];
  const observations=new Map();
  for(const result of results){
    const normalized=localRoute(result?.route);
    if(!normalized||!routes.some(row=>routeMatches(row.route,result.route))){fail('browser.unknownRoute','A browser result does not match an inventoried concrete route or pattern.');continue;}
    const scenario=result.scenario??'page',frame=result.frame??'top-level',authState=observedState(result);
    if(!scenarioName(scenario)||!['top-level','iframe'].includes(frame)||result.authenticated!==undefined&&typeof result.authenticated!=='boolean'){
      fail('browser.invalidObservation',`Invalid browser state or context: ${normalized.key}`);continue;
    }
    if(!routes.some(row=>routeMatches(row.route,result.route)&&row.contracts.some(item=>item.scenario===scenario&&item.frame===frame))){
      fail('browser.unknownScenario',`Browser observation has no declared scenario/frame: ${normalized.key}`);continue;
    }
    if(!routes.some(row=>routeMatches(row.route,result.route)&&row.contracts.some(item=>item.scenario===scenario&&item.frame===frame
      &&(item.authState==='any'||item.authState===authState))))
      fail('browser.unexpectedAuthState',`Browser observation does not establish a required authentication state: ${normalized.key}`);
    const key=JSON.stringify([normalized.key,scenario,frame,authState]);
    if(observations.has(key)){fail('browser.duplicateRoute',`Duplicate browser route/state/scenario/frame observation: ${normalized.key}`);continue;}
    observations.set(key,{...result,scenario,frame,authState});
    if(result.sourceRevision&&result.sourceRevision!==sourceRevision)fail('browser.routeRevisionMismatch',`Browser route is from another revision: ${normalized.key}`);
  }
  const missing=[],incomplete=[],passedRoutes=[],missingScenarios=[],incompleteScenarios=[];
  for(const row of routes){
    const matches=[...observations.values()].filter(result=>routeMatches(row.route,result.route));
    if(!matches.length)missing.push(row.pattern);
    let ok=row.contracts.length>0;
    for(const contract of row.contracts){
      const candidates=matches.filter(result=>result.scenario===contract.scenario&&result.frame===contract.frame
        &&(contract.authState==='any'||result.authState===contract.authState));
      const description={route:row.pattern,scenario:contract.scenario,frame:contract.frame,authState:contract.authState};
      if(!candidates.length){missingScenarios.push(description);ok=false;continue;}
      const passed=candidates.every(result=>result.status==='passed'&&contract.checks.every(key=>result[key]===true)
        &&(!result.sourceRevision||result.sourceRevision===sourceRevision)
        &&(!Object.hasOwn(contract,'initialAuthenticated')||result.initialAuthenticated===contract.initialAuthenticated
          &&localDestination(result.resultingRoute)&&routeMatches(contract.resultingRoute,result.resultingRoute)));
      if(!passed){incompleteScenarios.push(description);ok=false;}
    }
    // An extra failed observation cannot be hidden behind another passing state.
    if(matches.some(result=>result.status!=='passed'))ok=false;
    if(ok)passedRoutes.push(row.pattern);else incomplete.push(row.pattern);
  }
  if(missing.length)fail('browser.unobservedRoutes',`${missing.length} route paths/patterns have no concrete browser observation.`);
  if(incomplete.length)fail('browser.incompleteRoutes',`${incomplete.length} route paths/patterns failed required chatbot, keyboard, session or authentication observations.`);
  if(missingScenarios.length)fail('browser.missingScenarios',`${missingScenarios.length} required route/state/scenario/frame observations are missing.`);
  if(incompleteScenarios.length)fail('browser.incompleteScenarios',`${incompleteScenarios.length} browser scenarios failed their state or resulting-destination checks.`);
  if(!routes.length)fail('browser.noRouteInventory','Browser acceptance requires a nonempty authoritative route inventory.');
  return {required:true,passed:failures.length===0,total:routes.length,requiredScenarios:routes.reduce((sum,row)=>sum+row.contracts.length,0),observations:observations.size,passedRoutes:passedRoutes.length,missing,incomplete,missingScenarios,incompleteScenarios,failures};
}

function coveredBy(testCase,kind) {
  if (kind==='services') return unique([testCase.serviceId,...(testCase.coveredServices || [])].filter(Boolean));
  if (kind==='tools') return unique([...(testCase.expected?.requiredTools || []),...(testCase.coveredTools || [])]);
  return unique([testCase.routeFamily,...(testCase.coveredRouteFamilies || [])].filter(Boolean));
}

/**
 * inventory: {services:[id|{id,requiredModes?}], tools:[id|{id}],
 * routeFamilies:[id|{id,routes?:[],requiredModes?}]}. Pass the authoritative
 * current catalog and tool exports; never derive this denominator from cases.
 * results are gradeCase outputs. A legitimate subset can pass its behavior,
 * but cannot be releaseReady. Every full case must execute on the same revision.
 * browserAcceptance is separate observed UI evidence: {status,sourceRevision,
 * routeResults:[{route,status,assistantPresent,keyboardUsable,sessionVerified,
 * authenticated?,scenario?,frame?,initialAuthenticated?,resultingRoute?}]}.
 * Ordinary pages default to scenario:'page'/frame:'top-level'. auth:'either'
 * requires both authenticated states; transition scenarios require the declared
 * initial/resulting state and destination. None of this creates semantic cases.
 */
export function assessCoverage({cases=[],results=[],inventory={},requestedSuite='full',sourceRevision,requireLive=true,browserAcceptance}={}) {
  const failures=[];
  const fail=(id,detail)=>failures.push({id,detail});
  if (!Array.isArray(cases)||!Array.isArray(results)) throw new TypeError('cases and results must be arrays');
  if (!['full','subset'].includes(requestedSuite)) fail('suite.invalid','Only full or subset evaluation is defined.');
  if (!cases.length) fail('cases.empty','An empty question bank cannot establish coverage.');
  const caseMap=new Map(),resultMap=new Map();
  for(const testCase of cases){
    if(typeof testCase?.id!=='string'||!testCase.id){fail('case.invalid','Every case needs a stable ID.');continue;}
    if(caseMap.has(testCase.id))fail('case.duplicate',`Repeated case ID: ${testCase.id}`);
    else caseMap.set(testCase.id,testCase);
  }
  for(const result of results){
    if(!caseMap.has(result?.caseId)){fail('result.unknown',`Result has no registered case: ${String(result?.caseId)}`);continue;}
    if(resultMap.has(result.caseId)){fail('result.duplicate',`Repeated execution cannot replace first result: ${result.caseId}`);continue;}
    resultMap.set(result.caseId,result);
    const kind=resultKind(result);
    if(kind==='setup')fail('result.setupFailed',`Case was not executed because setup was unavailable: ${result.caseId}`);
    else if(kind==='infrastructure')fail('result.infrastructureFailed',`Case request did not produce an evaluable answer: ${result.caseId}`);
    else{
      if(result.passed!==true)fail('result.failed',`Case failed: ${result.caseId}`);
      if(!Array.isArray(result.checks)||!result.checks.length||result.checks.some(check=>check.passed!==true))fail('result.ungraded',`Case lacks passing independent checks: ${result.caseId}`);
      if(requireLive&&!liveMatches(caseMap.get(result.caseId),result))fail('result.notLive',`Semantic release proof requires live execution: ${result.caseId}`);
    }
    if(!['live-model','deterministic','recorded',...(caseMap.get(result.caseId).executionContract==='live-native'?['live-native']:[]),...(kind==='setup'?['not-run']:[])].includes(result.execution))fail('result.executionMissing',`Unknown execution provenance: ${result.caseId}`);
    if(wasExecuted(result)&&sourceRevision&&result.sourceRevision!==sourceRevision)fail('result.revisionMismatch',`Case was not run against the requested revision: ${result.caseId}`);
    const testCase=caseMap.get(result.caseId);
    if(testCase.fixtureKey && result.fixtureKey!==testCase.fixtureKey)fail('result.fixtureMismatch',`Case used another fixture: ${result.caseId}`);
  }
  const missingCases=[...caseMap.keys()].filter(id=>!wasExecuted(resultMap.get(id)));
  if(requestedSuite==='full'&&missingCases.length)fail('cases.unexecuted',`${missingCases.length} registered cases were not executed.`);
  if(!results.length)fail('results.empty','No executed evidence exists.');
  const coverage={};
  for(const kind of ['services','tools','routeFamilies']){
    const entries=inventory[kind];
    if(!Array.isArray(entries)){fail('inventory.missing',`An authoritative ${kind} inventory is required.`);coverage[kind]={total:0,registered:0,executed:0,passed:0,missing:[]};continue;}
    if(!entries.length)fail('inventory.empty',`An empty ${kind} inventory cannot establish system-wide coverage.`);
    const ids=entries.map(identity);
    if(ids.some(id=>typeof id!=='string'||!id)||unique(ids).length!==ids.length)fail('inventory.invalid',`The ${kind} inventory contains missing or repeated IDs.`);
    const mapped=new Map(ids.map(id=>[id,[]]));
    for(const testCase of caseMap.values()){
      let covered=coveredBy(testCase,kind);
      if(kind==='routeFamilies'&&!covered.length)covered=entries.filter(entry=>aliases(entry).some(route=>routeMatches(route,testCase.route))).map(identity);
      for(const id of covered){
        if(!mapped.has(id)){fail('coverage.unknown',`Case ${testCase.id} names a nonexistent ${kind} capability: ${id}`);continue;}
        mapped.get(id).push(testCase);
      }
    }
    const missing=ids.filter(id=>!mapped.get(id)?.length);
    for(const id of missing)fail('coverage.omitted',`No case covers ${kind}: ${id}`);
    for(const entry of entries){
      if(typeof entry!=='object'||!Array.isArray(entry?.requiredModes))continue;
      for(const mode of entry.requiredModes)if(!mapped.get(identity(entry))?.some(testCase=>testCase.mode===mode))fail('coverage.modeOmitted',`${kind} ${identity(entry)} lacks required mode ${mode}.`);
    }
    const executed=ids.filter(id=>mapped.get(id)?.some(testCase=>wasExecuted(resultMap.get(testCase.id))));
    const passed=ids.filter(id=>mapped.get(id)?.length && mapped.get(id).every(testCase=>{
      const result=resultMap.get(testCase.id);return passedBehavior(result) && (!requireLive||liveMatches(testCase,result));
    }));
    coverage[kind]={total:ids.length,registered:ids.length-missing.length,executed:executed.length,passed:passed.length,missing};
  }
  const routeFailures=[];
  const routes=routeInventory(Array.isArray(inventory.routeFamilies)?inventory.routeFamilies:[],(id,detail)=>{fail(id,detail);routeFailures.push({id,detail});});
  const routeCases=new Map(routes.map(row=>[row.pattern,[]]));
  for(const testCase of caseMap.values()){
    const candidates=unique([testCase.route,...(testCase.expected?.requiredLinks||[]),...(testCase.coveredRoutes||[])].filter(Boolean));
    for(const row of routes)if(candidates.some(route=>routeMatches(row.route,route)))routeCases.get(row.pattern).push(testCase);
  }
  const hostContextFrames=routes.filter(row=>row.semanticHost&&[...caseMap.values()]
    .some(testCase=>routeMatches(row.semanticHost,testCase.route))).map(row=>row.pattern);
  const missingRoutes=routes.filter(row=>!routeCases.get(row.pattern).length&&!hostContextFrames.includes(row.pattern)).map(row=>row.pattern);
  for(const route of missingRoutes)fail('routes.omitted',`No semantic/navigation case covers concrete path or pattern: ${route}`);
  coverage.routes={total:routes.length,registered:routes.filter(row=>routeCases.get(row.pattern).length).length,
    executed:routes.filter(row=>routeCases.get(row.pattern).some(testCase=>wasExecuted(resultMap.get(testCase.id)))).length,
    passed:routes.filter(row=>routeCases.get(row.pattern).length&&routeCases.get(row.pattern).every(testCase=>{
      const result=resultMap.get(testCase.id);return passedBehavior(result)&&(!requireLive||liveMatches(testCase,result));
    })).length,missing:missingRoutes,hostContextFrames,
    basis:'API route context or required destination checks. Host-context frames require their own browser observations and use the host page for semantic evaluation.'};
  const browser=assessBrowserAcceptance(browserAcceptance,routes,sourceRevision,routeFailures);
  const capabilityGaps=unique([...caseMap.values()].filter(testCase=>testCase.capability?.gap===true || testCase.capability?.gap!==false && (['partial','generic-tracker'].includes(testCase.capability?.level)||testCase.capability?.complete===false))
    .map(testCase=>JSON.stringify({domain:testCase.domain,serviceId:testCase.serviceId??null,level:testCase.capability?.level,limitation:testCase.capability?.limitation||'Capability is not complete.'}))).map(value=>JSON.parse(value));
  const byDomain={};
  for(const testCase of caseMap.values()){
    const domain=testCase.domain||'unclassified';
    const row=byDomain[domain]??={total:0,executed:0,evaluated:0,passed:0,setupFailed:0,infrastructureFailed:0,answerRequired:0,answersPassed:0,limitations:0,clarifications:0};
    row.total++;
    const result=resultMap.get(testCase.id);
    if(wasExecuted(result))row.executed++;
    if(result&&resultKind(result)==='behavior')row.evaluated++;
    if(result&&resultKind(result)==='setup')row.setupFailed++;
    if(result&&resultKind(result)==='infrastructure')row.infrastructureFailed++;
    if(passedBehavior(result))row.passed++;
    if(testCase.expected?.behavior==='answer'){row.answerRequired++;if(passedBehavior(result))row.answersPassed++;}
    if(testCase.expected?.behavior==='unavailable')row.limitations++;
    if(testCase.expected?.behavior==='clarify')row.clarifications++;
  }
  const reported=[...resultMap.values()],executed=reported.filter(wasExecuted),behavior=reported.filter(result=>resultKind(result)==='behavior');
  const behaviorPassed=behavior.length>0?behavior.every(passedBehavior):null;
  const capabilityComplete=capabilityGaps.length===0;
  const passed=failures.length===0;
  const releaseReady=passed && behaviorPassed && capabilityComplete && requestedSuite==='full' && requireLive && Boolean(sourceRevision) && missingCases.length===0 && browser.passed;
  coverage.cases={total:caseMap.size,executed:executed.length,evaluated:behavior.length,passed:behavior.filter(passedBehavior).length,missing:missingCases};
  return {passed,releaseReady,behaviorPassed,behaviorStatus:behaviorPassed===null?'not-evaluated':behaviorPassed?'passed':'failed',capabilityComplete,requestedSuite,sourceRevision:sourceRevision??null,coverage,
    totals:{registered:caseMap.size,reported:reported.length,executed:executed.length,evaluated:behavior.length,passed:behavior.filter(passedBehavior).length,failed:behavior.filter(result=>!passedBehavior(result)).length,
      setupFailed:reported.filter(result=>resultKind(result)==='setup').length,infrastructureFailed:reported.filter(result=>resultKind(result)==='infrastructure').length,unexecuted:missingCases.length,capabilityGaps:capabilityGaps.length},
    failures,capabilityGaps,byDomain,browserAcceptance:browser,releaseBlockers:[...(failures.length?['evaluation_integrity_or_case_failure']:[]),...(!sourceRevision?['source_revision_missing']:[]),...(!browser.passed?['browser_acceptance_missing_or_failed']:[]),...(!capabilityComplete?['incomplete_product_capabilities']:[]),...(requestedSuite!=='full'?['subset_only']:[])],
    execution:{required:requireLive?(cases.some(row=>row.executionContract==='live-native')?'case-scoped-live':'live-model'):'any-explicit',counts:Object.fromEntries(['live-model','live-native','deterministic','recorded'].map(mode=>[mode,executed.filter(result=>result.execution===mode).length]))}};
}
