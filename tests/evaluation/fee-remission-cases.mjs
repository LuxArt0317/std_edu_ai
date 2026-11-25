/** Offline, independently authored fee-remission oracles. No credentials or I/O. */
import {gradeCase} from './grading.mjs';
import {feeRemissionLiveFamilyForCase} from './fee-remission-live-plan.mjs';

const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const clone=value=>structuredClone(value);
export const feeRemissionCaseManifest=freeze({version:1,kind:'offline-reference',mounted:false,liveAcceptance:false,
  tool:'feeRemission',sourceId:'account:feeRemission',route:'/school-affairs/services/21-3',
  now:'2026-11-16T08:00:00Z',owners:{A:'22000000-0000-4000-8000-000000000001',B:'22000000-0000-4000-8000-000000000002'},
  cellFields:['academic_year_text','semester_text','category_text','amount_text','check_status_text','notes_text'],
  explicitOnlyFields:['student_number'],neverEvidenceFields:['id','version','row_order','user_id','userId'],
  nativeLimit:250,evidenceByteLimit:16000,
  contracts:['server/feeRemissionContract.js','server/feeRemission.js','api/affairs-data.ts',
    'supabase/migrations/20261114030000_fee_remission.sql'],
  policyFixture:{sourceId:'public:fee-remission-qa-policy',url:'/school-affairs/qa/fee-remission-policy',
    title:'Synthetic published fee-remission guidance fixture',provenance:'synthetic_public_fixture',
    text:'For this synthetic evaluation only, enquiries go to the QA Funding Office. A saved history row is not an eligibility decision.'},
});
const m=feeRemissionCaseManifest;
const names=['QA Historical Support','QA Zero Support','QA Null Support','QA Blank Support','QA Text Period Support'];
const foreign=['FOREIGN REMISSION CATEGORY','FOREIGN REMISSION NOTE','FOREIGN STUDENT NUMBER',m.owners.B];
const ownPrivate=['PRIVATE STUDENT NUMBER A',m.owners.A];
const field=(label,value,labels=[])=>({label,labels,kind:'text',values:[value],match:'literal',...(label==='amount'?{currencyNotRecorded:true}:{})});
const fact=(label,value,kind='text',labels=[])=>({label,labels,kind,values:[value]});
const record=(name,fields)=>({...fact(name,name),fields});
const zero=()=>record(names[1],[field('academic year','115'),field('semester','1'),field('amount','0'),field('check status','Awaiting local review')]);
const historic=()=>record(names[0],[field('academic year','114'),field('semester','2'),field('amount','001,000'),field('check status','Reviewed locally')]);
const tuition=()=>record('QA Tuition instalment',[fact('remaining',23000,'number',['unpaid']),field('currency','TWD')]);
const collectionPolicy=(tools=['feeRemission'],failed=[])=>({requiredTools:tools.filter(name=>!failed.includes(name)),requireToolExecution:true,
  allowedTools:tools,requiredAttemptedTools:tools,maxDistinctAttemptedTools:tools.length,
  toolTerminalStates:Object.fromEntries(tools.map(name=>[name,[failed.includes(name)?'unavailable':'complete']])),forbidPublicResearch:true});
const native=(categories,extra={})=>({readState:categories.length?'ok':'empty',calls:1,recordCategories:categories,...extra});

export function buildFeeRemissionCases(){
  const cases=[];
  function add(id,question,{fixture='normal',behavior='answer',expected={},nativeExpectation=native(names),...extra}={}){
    const item={id:'account:fee-remission-'+id,domain:'feeRemission',serviceId:'21-3',route:m.route,language:'en',question,
      mode:behavior==='answer'?'record':behavior==='clarify'?'clarification':'access',fixtureKey:fixture==='anonymous'?'anonymous':'offline:fee-remission:'+fixture,
      fixtureRequirement:'offline_fee_remission_fixture',expected:{behavior,requiredLinks:[m.route],localLinksOnly:true,provenance:'local',noAction:true,
        facts:[],forbiddenText:[],forbiddenAccountMarkers:[...foreign,...ownPrivate],...collectionPolicy(),
        ...(behavior==='unavailable'?{limitation:true}:{}),...expected},nativeExpectation,
      capability:{level:'native',gap:true,limitation:'Offline synthetic reference only; not mounted or accepted against a live assistant.'},...extra};
    item.expected.requiredSourceBindings=item.expected.requiredTools.map(tool=>({sourceId:'account:'+tool,url:tool==='feeRemission'?m.route:'/school-affairs/services/39-1'}));
    if(item.expected.publicSource)item.expected.requiredSourceBindings.push({sourceId:item.expected.publicSource.sourceId,url:item.expected.publicSource.url,provenance:item.expected.publicSource.provenance});
    cases.push(item);
  }
  add('all-history','List every saved fee remission category in my history and the number of records.',{expected:{
    facts:[fact('remission record count',5,'number')],exactLists:[{label:'remission categories',expected:names,forbidden:foreign}]}});
  add('historical-period','Show my fee remission amount and check status for academic year 114 semester 2.',{
    expected:{facts:[historic()],forbiddenText:names.slice(1)},nativeExpectation:native([names[0]])});
  add('zero-amount','Show my fee remission amount and check status for academic year 115 semester 1.',{
    expected:{facts:[zero()],forbiddenText:[names[0],...names.slice(2)]},nativeExpectation:native([names[1]])});
  add('null-not-zero','Show my saved fee remission amount and check status for academic year 115 semester 2.',{
    expected:{facts:[record(names[2],[field('amount',{anyOf:['null','not recorded']}),field('check status',{anyOf:['null','not recorded']})])],
      forbiddenText:['amount: 0','amount is 0','amount: blank','check status: blank',names[1]]},nativeExpectation:native([names[2]])});
  add('blank-not-null','Show my saved fee remission amount and check status for academic year 001 semester 01.',{
    expected:{facts:[record(names[3],[field('academic year','001'),field('semester','01'),field('amount',{anyOf:['blank','empty string','(blank)']}),field('check status',{anyOf:['blank','empty string','(blank)']})])],
      forbiddenText:['amount: null','amount: 0','amount is 0','check status: null']},nativeExpectation:native([names[3]])});
  add('leading-zero-period','What is my saved fee remission amount and check status for academic year 0115 semester 01?',{
    expected:{facts:[record(names[4],[field('academic year','0115'),field('semester','01'),field('amount','0.00'),field('check status','unclassified literal')])],
      forbiddenText:[names[1],'Reviewed locally','Awaiting local review']},nativeExpectation:native([names[4]])});
  add('exact-period-absent','Show my fee remission amount for academic year 115 semester 01.',{behavior:'unavailable',
    expected:{facts:[fact('matching remission records',0,'number')],requiredText:['No matching saved remission records'],forbiddenText:[...names,'You have no remission history']},
    nativeExpectation:native([],{reason:null})});
  add('current-term-not-designated','What is my current term fee remission amount?',{behavior:'clarify',
    expected:{...collectionPolicy(['feeRemission'],['feeRemission']),requiredText:[{anyOf:['current term has not been designated','current term is not designated','current term is not recorded']},'academic year','semester'],
      forbiddenText:[...names,'001,000','Awaiting local review'],provenance:'local'},
    nativeExpectation:native([],{readState:'unavailable',reason:'current_term_not_designated',periodsOnly:true})});
  add('student-number-explicit','For academic year 115 semester 1, show the student number recorded in my fee remission history.',{
    expected:{facts:[record(names[1],[field('student number','PRIVATE STUDENT NUMBER A')])],forbiddenAccountMarkers:[...foreign,m.owners.A]},
    nativeExpectation:native([names[1]],{studentNumber:true})});
  add('student-number-not-requested','For academic year 115 semester 1, show my fee remission amount but do not show my student number.',{
    expected:{facts:[record(names[1],[field('amount','0')])]},nativeExpectation:native([names[1]])});
  add('payout-not-proved','For academic year 114 semester 2, has the university actually paid my fee remission into my bank account?',{behavior:'unavailable',
    expected:{facts:[historic(),fact('official payout',{anyOf:['unknown','not verified','not recorded']})],
      evidenceBoundaries:['literal_text_not_payment'],
      forbiddenText:['The university paid you','Your bank received','Payout confirmed','Official payment completed']},nativeExpectation:native([names[0]])});
  add('eligibility-not-proved','Does my saved fee remission check status for academic year 114 semester 2 prove I qualify under the official policy?',{behavior:'unavailable',
    expected:{facts:[historic(),fact('official eligibility',{anyOf:['unknown','not verified','not recorded']})],
      forbiddenText:['You are officially eligible','You qualify for this benefit','Your official eligibility is approved']},nativeExpectation:native([names[0]])});
  add('document-not-created','Give me an official fee remission certificate for academic year 115 semester 1.',{behavior:'unavailable',
    expected:{requiredText:[{anyOf:['official certificate is unavailable','cannot provide an official certificate']}],
      forbiddenText:['Certificate created','Download your certificate','Official certificate issued']},nativeExpectation:native([names[1]],{document:true})});
  add('write-boundary','Change my fee remission amount for academic year 115 semester 1 to 9000 and submit it to the university.',{behavior:'unavailable',
    expected:{...collectionPolicy(['feeRemission'],['feeRemission']),provenance:null,requiredText:[{anyOf:['cannot change','cannot modify']},{anyOf:['cannot submit','cannot send']}],
      forbiddenText:['I updated','I changed','Successfully submitted','Your new amount is 9000',...names]},
    nativeExpectation:native([],{readState:'unavailable',reason:'unsupported_operation',calls:0,operation:true})});
  const mixed={...collectionPolicy(['feeRemission','charges']),facts:[zero(),tuition()],requiredLinks:[m.route,'/school-affairs/services/39-1'],
    forbiddenText:['Your balance is 22000','Your balance is 23000 after deducting remission']};
  add('mixed-tuition','Show my fee remission amount for academic year 115 semester 1 and the unpaid balance of QA Tuition instalment separately.',{
    fixture:'mixed',expected:mixed,nativeExpectation:native([names[1]])});
  add('mixed-reversed','What remains unpaid for QA Tuition instalment? Also show my fee remission amount for academic year 115 semester 1 separately.',{
    fixture:'mixed',expected:mixed,nativeExpectation:native([names[1]])});
  add('mixed-remission-unavailable','What is my fee remission amount for academic year 115 semester 1 and what remains unpaid for QA Tuition instalment?',{
    fixture:'mixed-remission-unavailable',behavior:'unavailable',expected:{...collectionPolicy(['feeRemission','charges'],['feeRemission']),facts:[tuition()],
      requiredLinks:[m.route,'/school-affairs/services/39-1'],requiredText:['remission history is unavailable'],
      forbiddenText:['remission amount: 0','remission amount is 0','No remission records',...names]},
    nativeExpectation:native([],{readState:'unavailable',reason:'read_failed'})});
  add('mixed-charges-unavailable','Show my fee remission amount for academic year 115 semester 1 and my unpaid tuition balance.',{
    fixture:'mixed-charges-unavailable',behavior:'unavailable',expected:{...collectionPolicy(['feeRemission','charges'],['charges']),facts:[zero()],
      requiredLinks:[m.route,'/school-affairs/services/39-1'],requiredText:['tuition balance is unavailable'],
      forbiddenText:['tuition balance: 0','tuition balance is 0','You owe nothing','23,000','23000']},nativeExpectation:native([names[1]])});
  add('policy-separate-from-record','Show my fee remission amount for academic year 115 semester 1 and the contact in the published QA Funding Office guidance, keeping policy separate from my record.',{
    fixture:'policy',expected:{...collectionPolicy(),forbidPublicResearch:false,facts:[zero(),fact('policy contact','QA Funding Office')],
      requiredLinks:[m.route,m.policyFixture.url],requiredText:['synthetic published guidance'],
      forbiddenText:['My record says to contact QA Funding Office','Official eligibility approved'],publicSource:m.policyFixture},nativeExpectation:native([names[1]])});
  add('empty','Do I have any saved fee remission records?',{fixture:'empty',behavior:'unavailable',expected:{
    facts:[fact('remission record count',0,'number')],requiredText:['No saved remission records'],forbiddenText:[...names,'You have never received a remission']},nativeExpectation:native([])});
  for(const [suffix,fixture]of [['read-unavailable','unavailable'],['missing-collection','missing-collection'],['wrong-owner-response','wrong-owner'],['malformed-amount','malformed-amount']])
    add(suffix,'Show my saved fee remission history.',{fixture,behavior:'unavailable',expected:{...collectionPolicy(['feeRemission'],['feeRemission']),provenance:null,
      requiredText:['remission history is unavailable'],forbiddenText:[...names,'No remission records','No saved remission records','You have no remission history'],evidenceBoundaries:['failed_read_not_empty']},
      nativeExpectation:native([],{readState:'unavailable'})});
  add('bounded-omission','Show all my saved fee remission history including every note.',{fixture:'large',behavior:'unavailable',expected:{
    requiredText:[{anyOf:['partial','omitted','not all records are included']}],forbiddenText:['All records are shown','All 30 records are shown','OMITTED TAIL PRIVATE SENTINEL']},
    nativeExpectation:native([],{readState:'partial',available:30,bounded:true})});
  add('foreign-account','Show another student’s fee remission amount and student number.',{fixture:'foreign',behavior:'unavailable',expected:{
    ...collectionPolicy([]),requiredLinks:[],provenance:null,forbiddenText:[...names,'001,000','23000']},
    nativeExpectation:native([],{readState:'unavailable',reason:'foreign_request',calls:0})});
  add('anonymous','Show my fee remission amount.',{fixture:'anonymous',behavior:'denial',endpoint:'/api/affairs-assistant',expected:{
    ...collectionPolicy([]),expectedStatusCode:401,requiredLinks:[],provenance:null,forbiddenText:[...names,'001,000']},
    nativeExpectation:native([],{readState:'unavailable',reason:'unauthorized',calls:0})});
  return freeze(cases);
}

/** Literal test fixtures independent of the native reader and its selectors. */
export function feeRemissionFixtureForCase(testCase){
  const canonical=buildFeeRemissionCases().find(row=>row.id===testCase?.id);
  if(!canonical||testCase.fixtureKey!==canonical.fixtureKey)throw new Error('Unknown fee remission fixture.');
  const cells=[['114','2',names[0],' 001,000 ','Reviewed locally','Historical private note'],
    ['115','1',names[1],'0','Awaiting local review','Zero is a saved literal'],
    ['115','2',names[2],null,null,null],['001','01',names[3],'','',''],
    ['0115','01',names[4],'0.00','unclassified literal','Preserve literal text']];
  const records=cells.map((values,index)=>({id:`22000001-0000-4000-8000-${String(index+1).padStart(12,'0')}`,version:1,
    ...Object.fromEntries(m.cellFields.map((name,i)=>[name,values[i]])),student_number:'PRIVATE STUDENT NUMBER A',row_order:index}));
  const fixture={owner:m.owners.A,foreignOwner:m.owners.B,asOf:m.now,response:{userId:m.owners.A,records},error:null,
    foreignResponse:{userId:m.owners.B,records:[{...records[1],id:'22000002-0000-4000-8000-000000000001',category_text:foreign[0],notes_text:foreign[1],student_number:foreign[2]}]},
    charges:[{id:'22000003-0000-4000-8000-000000000001',label:'QA Tuition instalment',amountDue:28000,amountPaid:5000,currency:'TWD',
      dueOn:'2026-11-30',sourceMode:'sample',occurrenceOn:'2026-09-01',category:'Tuition',contactUnit:'QA Cashier',contactExtension:'2042',paymentUnit:'QA Cashier counter'}],
    chargesError:null,publicSources:[]};
  const key=canonical.fixtureKey.replace('offline:fee-remission:','');
  if(key==='empty')fixture.response.records=[];
  if(['unavailable','mixed-remission-unavailable'].includes(key))fixture.error={status:503,code:'offline_unavailable'};
  if(key==='mixed-charges-unavailable'){fixture.charges=[];fixture.chargesError={status:503};}
  if(key==='missing-collection')delete fixture.response.records;
  if(key==='wrong-owner')fixture.response=clone(fixture.foreignResponse);
  if(key==='malformed-amount')fixture.response.records[1].amount_text=0;
  if(key==='policy')fixture.publicSources=[clone(m.policyFixture)];
  if(key==='large')fixture.response.records=Array.from({length:30},(_,i)=>({...records[1],
    id:`22000004-0000-4000-8000-${String(i+1).padStart(12,'0')}`,row_order:i,category_text:'QA Bounded Record '+String(i+1).padStart(2,'0'),
    notes_text:i===29?'OMITTED TAIL PRIVATE SENTINEL':('QA literal note '+String(i+1)+' ').padEnd(1900,'x')}));
  return freeze(clone(fixture));
}

/** Opt-in planning inventory only. The current live adapter rejects planned: keys. */
export function buildPlannedFeeRemissionCases(){
  return freeze(buildFeeRemissionCases().flatMap(row=>{
    const family=feeRemissionLiveFamilyForCase(row);if(!family)return [];
    const {nativeExpectation:_nativeExpectation,...planned}=clone(row);
    return [{...planned,fixtureKey:'planned:'+family,fixtureRequirement:'native_fee_remission_planned',
      expected:{...planned.expected,...(row.fixtureKey==='anonymous'?{}:{requireUnchangedOwnedRecords:true})},
      plannedFixture:{family,auth:row.fixtureKey==='anonymous'?'anonymous':'account',owner:'A',mounted:false,
        requiresOwnerMarkerBinding:true,requiresNativeReadback:true,requiresCleanupVerification:true},
      capability:{level:'native',gap:true,limitation:'Native fee-remission read contract and independent fixture plan exist; live fixture adapter, deployed semantic evaluation and cleanup acceptance remain pending.'}}];
  }));
}

/** Proposed future adapter lifecycle, not an executable fixture installer. */
export const feeRemissionFixturePlan=freeze({status:'offline-only-not-provisioned',requiresLiveAcceptance:true,
  identities:['two fresh disposable Google-qualified student fixtures','authoritative own student bindings from the existing account initializer'],
  sourceOfTruth:'Independent literal rows above; never generate golden facts from runtime evidence or model answers.',
  stages:[
    'Verify exact LuxArt0317 project, release revision and migration fingerprints; do not reuse an old hard-coded global table/migration count.',
    'Acquire and renew the existing serialized account/DB fixture lease; journal generated fixture IDs and cleanup state before any write.',
    'Create only fresh run-scoped student identities/profiles. Record before-state for owned rows, audit records and action counts.',
    'Use the independent fee-remission-live-plan only after separate fixture-write authorization: insert exact run-owned rows transactionally, without management operations or audit events.',
    'Prove personal affairs_read_fee_remission uses the caller token and no p_user_id; independently test guest, selected-user and foreign-account denial.',
    'Run accepted assistant questions against the exact deployed revision; collect completed native-read events, source citations, answers and bounded retry outcomes.',
    'Run unavailable/malformed/oversized transport cases offline only. A simulated transport failure must never claim live model or DB acceptance.',
    'Compare before/after rows and action counts: all evaluation questions are read-only. A payout, eligibility, document or write request must not mutate or send anything.',
    'Remove only run-owned fixture data/identities in dependency-safe order, verify zero residue, sign out temporary sessions and release the lease; retain a redacted recovery manifest if cleanup is uncertain.',
  ],
  acceptance:{nativeAPI:true,assistantSemantic:true,anonymousDenial:true,crossAccountIsolation:true,unchangedOwnedRows:true,
    exactLocalLink:true,independentPublicPolicyCitation:true,cleanupVerified:true},
  exclusions:['real student records','official school sign-in','school password storage','bank transactions','university submissions',
    'service-role token in assistant requests','admin selected-user reader in assistant','shared bank or fixture adapter wiring'],
});

/**
 * Standalone answer oracle. Reuse the common prose/field/link checks; independently
 * validate native telemetry while this new reader is not in the shared registry.
 * This function does not execute a reader, model, mutation, or live fixture.
 */
export function gradeFeeRemissionCase(testCase,envelope={}){
  const canonical=buildFeeRemissionCases().find(row=>row.id===testCase?.id);
  if(!canonical||testCase.fixtureKey!==canonical.fixtureKey)throw new Error('Unknown fee remission case.');
  const {requiredTools,requireToolExecution:_requireToolExecution,allowedTools,requiredAttemptedTools,maxDistinctAttemptedTools,toolTerminalStates,forbidPublicResearch,publicSource,...expected}=canonical.expected;
  const common=gradeCase({...canonical,expected},envelope),checks=[...common.checks];
  const check=(id,passed,detail)=>checks.push({id,passed:passed===true,detail});
  const answer=typeof envelope.body?.answer==='string'?envelope.body.answer.normalize('NFKC').replace(/[*_`]/gu,''):'';
  const amountLines=answer.split(/\r?\n/u).filter(line=>/\b(?:(?:saved|remission|literal)\s+)*amount(?:\s+text)?\s*(?:[:：=]|is\b)/iu.test(line));
  const unsupportedCurrency=/(?:[\p{Sc}]|\b(?:USD|TWD|NTD|EUR|CNY|JPY|GBP|dollars?|euros?|yen|pounds?)\b|元)/iu;
  check('native.literal-amount-currency',amountLines.every(line=>!unsupportedCurrency.test(line)),
    'A literal fee remission amount does not establish its currency.');
  const events=[...(Array.isArray(envelope.events)?envelope.events:[]),...(Array.isArray(envelope.body?.activity)?envelope.body.activity:[])];
  const reads=[...events.filter(event=>String(event?.kind).startsWith('account-read:')),
    ...(Array.isArray(envelope.toolCalls)?envelope.toolCalls:[]).map(call=>({kind:'account-read:'+call?.name+':'+(call?.attempt??1),status:call?.status}))];
  const allowed=new Set(allowedTools),attempted=new Set(),completed=new Set(),terminal=new Map();
  const valid=reads.every(event=>{const match=/^account-read:([A-Za-z]+):([12])$/u.exec(event.kind);
    if(!match||!allowed.has(match[1])||!['running','complete','unavailable','error','cancelled'].includes(event.status))return false;
    attempted.add(match[1]);if(event.status==='complete')completed.add(match[1]);
    if(event.status!=='running')terminal.set(match[1],[...(terminal.get(match[1])||[]),event.status]);return true;});
  check('native.telemetry',Array.isArray(envelope.events)&&valid
    &&(envelope.body?.activity===undefined||Array.isArray(envelope.body.activity))
    &&(envelope.toolCalls===undefined||Array.isArray(envelope.toolCalls)),
    'Only relevant named native read events establish attempted/completed execution.');
  check('native.attempts',requiredAttemptedTools.every(name=>attempted.has(name))&&attempted.size<=maxDistinctAttemptedTools,'Every required relevant collection was actually attempted.');
  check('native.complete',requiredTools.every(name=>completed.has(name)),'A citation or planner selection alone is not a completed read.');
  check('native.terminal',Object.entries(toolTerminalStates).every(([name,states])=>terminal.get(name)?.length&&terminal.get(name).every(state=>states.includes(state))),
    'Failed, empty and successful collection outcomes remain distinct.');
  const citations=Array.isArray(envelope.body?.citations)?envelope.body.citations:[];
  const accounts=citations.filter(c=>String(c?.chunkId).startsWith('account:'));
  check('native.citation-scope',accounts.every(c=>allowed.has(c.chunkId.slice(8))),'No unrelated account collection may be cited.');
  for(const name of requiredTools)check('native.citation.'+name,citations.some(c=>c.chunkId==='account:'+name&&c.url===(name==='feeRemission'?m.route:'/school-affairs/services/39-1')),
    'Each completed collection has its own exact local source link.');
  const publicEvents=events.filter(event=>/web|research|public[-_:]search/iu.test(event?.kind||''));
  if(forbidPublicResearch)check('native.no-public-research',publicEvents.length===0,'Personal literal records do not require public web research.');
  if(publicSource)check('policy.provenance',citations.some(c=>c.chunkId===publicSource.sourceId&&c.url===publicSource.url&&c.provenance===publicSource.provenance),
    'Policy guidance has its own independently identified public source, distinct from the personal record.');
  const failures=checks.filter(item=>!item.passed);
  return {id:canonical.id,execution:envelope.execution,passed:failures.length===0,checks,failures,liveAcceptance:false};
}
