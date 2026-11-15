import {isDeepStrictEqual} from 'node:util';
import {buildServiceNoteCases,gradeServiceNoteCase,serviceNoteCaseManifest,serviceNoteFixtureForCase} from './service-note-cases.mjs';

const prefix='account:service-notes-';
const bound='service_notes_disposable',unbound='service_notes_unbound';
const projectRef='xiftudmvxphxcjtmfmib';
const original=buildServiceNoteCases();
const outsideFixture={
  'mixed-next-class':'The published timetable needs an exact clock and enrollment binding.',
  'mixed-next-class-reversed':'The published timetable needs an exact clock and enrollment binding.',
  'mixed-tuition':'The companion balance needs an independent billing fixture.',
  'negative-notes-positive-tuition':'The companion balance needs an independent billing fixture.',
  'read-unavailable':'A hosted note-source failure cannot be induced by the read-only fixture.',
};
const anonymousLink='/school-affairs/login?next='+encodeURIComponent('/school-affairs/services/35-1');
export const foreignServiceNoteMarkers=Object.freeze(serviceNoteCaseManifest.services.map(({id})=>'FOREIGN SERVICE NOTE '+id));

function buildRunnerCase(source){
  const row=structuredClone(source),suffix=row.id.slice(prefix.length);
  const guest=row.auth==='anonymous',readsNotes=row.toolPolicy.required.includes('serviceRecords');
  const reason=outsideFixture[suffix]??(suffix.endsWith('-write')
    ?'The combined note change and official submission requires a verified no-write boundary beyond note retrieval.'
    :suffix.endsWith('-link')?'The current phrasing reaches the general navigation handler; its separate tool and source contract remains unbound.':null);
  if(reason)return {...row,fixtureRequirement:unbound,setupReason:reason};
  row.fixtureRequirement=bound;
  row.fixtureKey=guest?'anonymous':row.fixtureKey.replace(/^offline:/u,'');
  row.endpoint=guest?'/api/research-assistant':'/api/affairs-assistant';
  row.executionContract='live-native';
  row.capability={...row.capability,mounted:true};
  row.expected.forbiddenAccountMarkers.push(...foreignServiceNoteMarkers);
  if(!guest)row.expected.requireUnchangedOwnedRecords=true;
  row.coveredTools=[...row.toolPolicy.required];
  if(readsNotes)Object.assign(row.expected,{verification:'verified',requiredTools:['serviceRecords']});
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
  if(guest){
    row.expected.behavior='unavailable';row.expected.limitation=true;row.expected.requiredLinks=[anonymousLink];
  }
  return row;
}
export const serviceNoteRunnerCases=()=>original.map(buildRunnerCase);
export const isServiceNoteCase=row=>typeof row?.id==='string'&&row.id.startsWith(prefix)||row?.fixtureRequirement===bound||row?.fixtureRequirement===unbound;
export const serviceNoteSetupRequired=row=>isServiceNoteCase(row)&&row.fixtureRequirement!==bound;
export const serviceNoteSetupSummary=cases=>{
  const selected=cases.filter(isServiceNoteCase);
  return {registered:selected.length,liveEligible:selected.filter(row=>!serviceNoteSetupRequired(row)).length,
    unboundCaseIds:selected.filter(serviceNoteSetupRequired).map(row=>row.id)};
};
export function serviceNoteRunnerOracle(row){
  const source=original.find(item=>item.id===row?.id);
  if(!source||!isDeepStrictEqual(row,buildRunnerCase(source)))throw new Error('The service-note case differs from its independent fixture and grading definition.');
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
  return gradeServiceNoteCase(source,envelope,{hosted:{testCase:row,paired:row.auth==='anonymous'||paired}});
}
