import {isDeepStrictEqual} from 'node:util';

export const venueFixture=Object.freeze({
  requestId:'ad100000-2026-4000-8000-000000000002',room:'T0308',date:'2026-11-23',period:'2',status:'approved',
  amountDue:30000,amountPaid:7000,remaining:23000,
});
const prefix='account:venue-native-',requirement='offline_native_venue_requests',fixturePrefix='offline:venue-requests:';
const legacyRequirement='legacy_venue_request_rebind';
const legacyIds=new Set(['record','empty','action-boundary'].map(mode=>'service:44-1:'+mode));
const venue='/school-affairs/services/44-1',fees='/school-affairs/services/39-1';
const room=venueFixture.room,date=venueFixture.date,id=venueFixture.requestId;
const detail='Venue request cases require exact caller-bound venue and companion fixtures plus independent request observations. No case was executed.';
const count='How many approved venue requests do I have for '+room+' on '+date+'?';
const exact='Show the status of my venue request ID '+id+'.';
const feeQuestion='What is my tuition balance?';
const fact=(label,value,kind='text')=>({label,kind,values:[value],exclusive:true});
const scope={room,from:date,through:date,status:'approved',limit:1};
const countFacts=[fact('Matching saved venue requests',1,'number')];
const venueFacts=[fact('Room',room),fact('Booking date',date,'date'),fact('Saved local status','Approved')];
const feeFacts=[{...fact('Remaining balance',venueFixture.remaining,'number'),maxWindow:20}];
const defs=[
  {id:'record',question:exact,venue:{id,limit:1,rows:1},facts:venueFacts,required:['venueRequests']},
  {id:'count',question:count,venue:{...scope,rows:1},facts:countFacts,required:['venueRequests']},
  {id:'count-and-fees',question:count+' Also show my tuition balance.',venue:{...scope,rows:1},fees:'saved',
    facts:[...countFacts,...feeFacts],required:['venueRequests','charges']},
  {id:'fees-and-record',question:feeQuestion+' Also show the status of my venue request ID '+id+'.',
    venue:{id,limit:1,rows:1},fees:'saved',facts:[...feeFacts,...venueFacts],required:['charges','venueRequests']},
  {id:'fees-unavailable',question:count+' Also show my tuition balance.',venue:{...scope,rows:1},fees:'unavailable',attempts:2,
    facts:countFacts,required:['venueRequests'],requiredAttempted:['venueRequests','charges'],
    limitation:'couldn’t verify your saved fee balance',forbidden:['NT$23,000','no saved charge rows']},
  {id:'venue-unavailable',question:feeQuestion+' Also show the status of my venue request ID '+id+'.',
    venue:{id,limit:1,mode:'unavailable'},fees:'saved',attempts:2,
    facts:feeFacts,required:['charges'],requiredAttempted:['venueRequests','charges'],
    limitation:'couldn’t verify your saved venue requests',forbidden:[room,'No saved venue requests match']},
  {id:'empty',question:'Show my venue request ID '+id+'.',venue:{id,limit:1,rows:0},facts:[],required:['venueRequests'],
    requiredText:['No saved venue requests match this lookup']},
  {id:'foreign',question:'Show another student’s venue requests.',venue:null,facts:[],required:[],
    behavior:'denial',requiredText:['own account']},
  {id:'unsupported-companion',question:'Show my venue request status and my next class.',venue:null,facts:[],required:[],
    behavior:'clarify',requiredText:['separately']},
];
const source={venueRequests:venue,charges:fees};
function makeCase(def){
  const caseId=prefix+def.id,requiredAttempted=def.requiredAttempted??def.required;
  const requiredLinks=def.required.map(tool=>source[tool]);
  const requiredText=[...(def.requiredText??[]),...(def.limitation?[def.limitation]:[])];
  const expected={
    behavior:def.behavior??'answer',facts:structuredClone(def.facts),requiredText,
    requiredTools:[...def.required],requiredAttemptedTools:[...requiredAttempted],allowedTools:[...requiredAttempted],
    maxDistinctAttemptedTools:requiredAttempted.length,requiredLinks,
    requiredSourceBindings:def.required.map(tool=>({sourceId:'account:'+tool,url:source[tool]})),
    noAction:true,forbidPublicResearch:true,localLinksOnly:true,
    forbiddenAccountMarkers:['FOREIGN PRIVATE VENUE','OWNER PRIVATE PURPOSE','OWNER PRIVATE REVIEW','UNREQUESTED FEE CONTACT'],
    forbiddenText:[...(def.forbidden??[])],
    ...(def.required.length?{requireToolExecution:true,verification:def.limitation?'unverified':'verified'}:{}),
    ...(def.limitation?{toolTerminalStates:{[def.fees==='unavailable'?'charges':'venueRequests']:['unavailable','error']}}:{}),
  };
  return {id:caseId,domain:'venueRequests',routeFamily:'school-services',route:venue,endpoint:'/api/affairs-assistant',mode:def.behavior?'boundary':def.limitation?'partial':def.id==='empty'?'empty':'record',
    language:'en',fixtureKey:fixturePrefix+def.id,fixtureRequirement:requirement,question:def.question,history:[],
    coveredTools:[...requiredAttempted],expected,venueOracle:{caseId,scope:structuredClone(def.venue),fees:def.fees??null,
      attempts:def.attempts??(def.behavior?0:1),fixtureMounted:false,requiresRequestObservations:true}};
}

export const venueRunnerCases=()=>defs.map(makeCase);

/** Exact case identity includes the question, route, selectors and independent oracle. */
export function assertVenueCaseDefinition(testCase){
  const canonical=defs.find(row=>prefix+row.id===testCase?.id);
  if(!canonical||!isDeepStrictEqual(makeCase(canonical),testCase))throw Object.assign(
    new Error('The venue case and its independent scoped oracle must match the canonical definition.'),{code:'venue_case_binding_mismatch'});
  return true;
}

export function markLegacyVenueFixture(testCase){
  return legacyIds.has(testCase?.id)?{...testCase,fixtureRequirement:legacyRequirement,
    fixtureSetupDetail:'The earlier generic venue-note question is preserved. Its fixture must be independently rebound or assessed as an unresolved capability.'}:testCase;
}

export function nativeVenueSetupRequired(testCase){
  return testCase?.venueOracle!==undefined||testCase?.fixtureRequirement===requirement||testCase?.fixtureRequirement===legacyRequirement||legacyIds.has(testCase?.id)
    ||typeof testCase?.id==='string'&&testCase.id.startsWith(prefix)
    ||typeof testCase?.fixtureKey==='string'&&testCase.fixtureKey.startsWith(fixturePrefix);
}

export function assertNativeVenueCaseReady(testCase){
  if(nativeVenueSetupRequired(testCase))throw Object.assign(new Error(detail),{code:'venue_fixture_and_observation_unmounted'});
}

export function venueSetupSummary(cases){
  const caseIds=cases.filter(nativeVenueSetupRequired).map(row=>row.id);
  return {registered:caseIds.length,liveEligible:0,observationsMounted:false,caseIds,legacyCaseIds:caseIds.filter(id=>legacyIds.has(id))};
}
