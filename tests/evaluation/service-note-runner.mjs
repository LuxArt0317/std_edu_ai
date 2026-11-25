import {isDeepStrictEqual} from 'node:util';
import {buildPublishedNextClassExpectation} from './published-next-class.mjs';
import {extractAnswerLinks} from './grading.mjs';
import {buildServiceNoteCases,gradeServiceNoteCase,serviceNoteCaseManifest,serviceNoteFixtureForCase} from './service-note-cases.mjs';

const prefix='account:service-notes-';
const bound='service_notes_disposable',unbound='service_notes_unbound';
const projectRef='xiftudmvxphxcjtmfmib';
const original=buildServiceNoteCases();
const nextClassIds=new Set(['mixed-next-class','mixed-next-class-reversed']);
const tuitionIds=new Set(['mixed-tuition','negative-notes-positive-tuition']);
const clockGap='The published timetable has no independently bound next meeting in the evaluation clock window.';
export const serviceNoteForeignChargeLabel='Foreign QA Notes Tuition instalment';
const anonymousLink='/school-affairs/login?next='+encodeURIComponent('/school-affairs/services/35-1');
export const foreignServiceNoteMarkers=Object.freeze(serviceNoteCaseManifest.services.map(({id})=>'FOREIGN SERVICE NOTE '+id));

function buildRunnerCase(source,now){
  const row=structuredClone(source),suffix=row.id.slice(prefix.length);
  const guest=row.auth==='anonymous',readsNotes=row.toolPolicy.required.includes('serviceRecords');
  if(suffix==='read-unavailable')return {...row,fixtureRequirement:unbound,
    setupReason:'A hosted note-source failure cannot be induced by the read-only fixture.'};
  if(nextClassIds.has(suffix)){
    row.companionClock=now;
    try{row.publishedNextClass=buildPublishedNextClassExpectation({now});}
    catch{return {...row,fixtureRequirement:unbound,setupReason:clockGap};}
    const next=row.publishedNextClass.next;
    if(!next)return {...row,fixtureRequirement:unbound,setupReason:clockGap};
    row.serviceNoteCompanion='courses';
    const oldTitle=serviceNoteFixtureForCase(source).snapshot.courses[0].title;
    const nextFact={label:next.title,kind:'text',values:[next.code,next.date,next.startsAt.slice(0,5),next.endsAt.slice(0,5),next.room]};
    row.expected.facts=row.expected.facts.map(fact=>fact.label===oldTitle?nextFact:fact);
  }
  if(tuitionIds.has(suffix)){
    row.serviceNoteCompanion='charges';
    row.expected.forbiddenAccountMarkers.push(serviceNoteForeignChargeLabel);
    for(const fact of row.expected.facts)for(const field of fact.fields??[])
      field.labels.push('remaining balance','calculated remaining');
  }
  row.fixtureRequirement=bound;
  row.fixtureKey=guest?'anonymous':row.fixtureKey.replace(/^offline:/u,'');
  row.endpoint=guest?'/api/research-assistant':'/api/affairs-assistant';
  row.executionContract='live-native';
  row.capability={...row.capability,mounted:true};
  row.expected.forbiddenAccountMarkers.push(...foreignServiceNoteMarkers);
  if(!guest)row.expected.requireUnchangedOwnedRecords=true;
  row.coveredTools=[...row.toolPolicy.required];
  if(readsNotes||row.serviceNoteCompanion)Object.assign(row.expected,{verification:'verified',requiredTools:[...row.toolPolicy.required]});
  if(row.language==='zh-TW')for(const fact of row.expected.facts)
    fact.values=fact.values.map(value=>value==='filed'?{anyOf:['filed','自己標記已送件']}:value);
  // Local safety rejections use an explicit handoff. Foreign reads deliberately
  // omit a destination and anonymous guidance preserves the intended return path.
  if(suffix.endsWith('-foreign'))row.expected.requiredLinks=[];
  if(suffix.endsWith('-negative')){
    row.expected.behavior='unavailable';row.expected.limitation=true;
    row.expected.requiredText[0].anyOf.push('skipped');
  }
  if(suffix.endsWith('-official-only'))row.expected.requiredText[0].anyOf.push('can’t verify');
  const boundary=serviceNoteEndpointBoundary(row);
  if(boundary){
    if(boundary.event)row.expected.requiredEvents=[boundary.event];
    row.expected.requiredSourceBindings=[{sourceId:'directory:service-note:'+boundary.serviceId,url:boundary.url}];
    if(boundary.event==='service-note-write-boundary')row.expected.requiredText=['cannot change','cannot submit'];
  }
  if(guest){
    row.expected.behavior='unavailable';row.expected.limitation=true;row.expected.requiredLinks=[anonymousLink];
  }
  return row;
}
function serviceNoteEndpointBoundary(row){
  if(row.serviceBoundary&&row.serviceBoundary.kind!=='tracking'){
    const {serviceId,kind}=row.serviceBoundary;
    return {serviceId,url:'/school-affairs/services/'+serviceId,event:kind==='navigation'?'service-note-navigation':null};
  }
  const match=/^(\d{2}-\d)-(link|write)$/u.exec(row.id.slice(prefix.length));
  if(!match)return null;
  const [,serviceId,kind]=match;
  return {serviceId,url:'/school-affairs/services/'+serviceId,
    event:kind==='link'?'service-note-navigation':'service-note-write-boundary'};
}

export const serviceNoteRunnerCases=({now=serviceNoteCaseManifest.clock}={})=>original.map(source=>buildRunnerCase(source,now));
export const isServiceNoteCase=row=>typeof row?.id==='string'&&row.id.startsWith(prefix)||row?.fixtureRequirement===bound||row?.fixtureRequirement===unbound;
export const serviceNoteSetupRequired=row=>isServiceNoteCase(row)&&row.fixtureRequirement!==bound;
export const serviceNoteSetupSummary=cases=>{
  const selected=cases.filter(isServiceNoteCase);
  return {registered:selected.length,liveEligible:selected.filter(row=>!serviceNoteSetupRequired(row)).length,
    unboundCaseIds:selected.filter(serviceNoteSetupRequired).map(row=>row.id)};
};
export function serviceNoteRunnerOracle(row){
  const source=original.find(item=>item.id===row?.id);
  if(!source||!isDeepStrictEqual(row,buildRunnerCase(source,row.companionClock??serviceNoteCaseManifest.clock)))throw new Error('The service-note case differs from its independent fixture and grading definition.');
  return source;
}
export function serviceNoteFixtureForRunnerCase(row){
  const source=serviceNoteRunnerOracle(row);
  if(serviceNoteSetupRequired(row)||row.auth==='anonymous')throw new Error('The service-note case has no signed-in fixture.');
  return serviceNoteFixtureForCase(source);
}
export function gradeLiveServiceNoteCase(row,envelope){
  const source=serviceNoteRunnerOracle(row);
  const observation=envelope.fixtureReadback?.serviceNotes;
  const paired=observation?.twoOwnersVerified===true&&observation.caseId===row.id&&observation.method==='caller RLS and persisted notes'
    &&envelope.fixtureReadback?.projectRef===projectRef;
  const result=gradeServiceNoteCase(source,envelope,{hosted:{testCase:row,paired:row.auth==='anonymous'||paired}});
  const boundary=serviceNoteEndpointBoundary(row);
  if(boundary){
    const response=Array.isArray(envelope.events)?envelope.events:[];
    const links=extractAnswerLinks(envelope.body??{});
    const activity=boundary.event?response.length===1&&response[0]?.kind===boundary.event&&response[0]?.status==='complete'
      :response.length===0;
    const check={id:'notes.exactReadOnlyRoute',passed:activity&&links.length===1&&links[0]===boundary.url,
    detail:'The endpoint emits one local boundary event and only the exact service destination.'};
    result.checks.push(check);
    if(!check.passed){result.passed=false;result.failures.push(check);}
  }
  if(row.serviceBoundary){
    const {kind,serviceId,unsupportedClaims}=row.serviceBoundary;
    const body=envelope.body??{},output=JSON.stringify([body,envelope.events]).toLowerCase();
    const expectedSource=kind==='navigation'?'directory':'account';
    const checks=[
      {id:'notes.serviceBoundary.scope',passed:body.grounding?.source===expectedSource&&body.grounding?.webSearched===false
        &&body.status===(kind==='navigation'||kind==='tracking'?'answered':'handoff'),
        detail:'The terminal answer stays in the requested local directory or authenticated account scope without public research.'},
      {id:'notes.serviceBoundary.outcome',passed:![...unsupportedClaims,...row.expected.forbiddenAccountMarkers].some(marker=>output.includes(marker.toLowerCase())),
        detail:'Neither a seeded unrelated or crossed-owner note nor a service-specific unsupported outcome appears in the response.'},
      {id:'notes.serviceBoundary.destination',passed:isDeepStrictEqual(extractAnswerLinks(body),['/school-affairs/services/'+serviceId]),
        detail:'All displayed destinations point to the exact requested service, including health equipment on 30-2.'},
    ];
    for(const check of checks){
      result.checks.push(check);
      if(!check.passed){result.passed=false;result.failures.push(check);}
    }
  }
  if(row.serviceNoteCompanion){
    const companion=observation?.companion;
    const check={id:'notes.companionReadback',passed:paired&&companion?.kind===row.serviceNoteCompanion
      &&typeof companion.before==='string'&&/^[a-f0-9]{64}$/u.test(companion.before)&&companion.before===companion.after
      &&companion.validUntil===(row.publishedNextClass?.validUntil??null),
    detail:'Both caller scopes and the persisted companion source agree before and after the assistant request.'};
    result.checks.push(check);
    if(!check.passed){result.passed=false;result.failures.push(check);}
  }
  return result;
}
