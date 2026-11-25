import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {validateAidPaymentFixtureOwners} from './aid-payment-fixture-plan.mjs';

// Independent, unmounted notice-state oracle. The native 34-2 source has no
// detailed conduct rows: an empty notice must not become an invented history.
const path = '/school-affairs/services/34-2';
const owners = Object.freeze({A:'d3400000-0000-4000-8000-000000000001',B:'d3400000-0000-4000-8000-000000000002'});
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const gap = 'Standalone unmounted helper packet; no live fixture adapter, model acceptance or browser acceptance is implied.';
export const dormitoryConductCaseManifest = Object.freeze({version:1,mounted:false,path,tool:'dormitoryConduct',owners,
  states:Object.freeze(['saved_empty','saved_unknown','missing','read_failed']),
  prerequisites:Object.freeze(['Mount the reviewed caller-scoped reader and answer formatter without substituting housing.',
    'Prepare independently verified disposable-owner metadata and compound-source fixtures.',
    'Run actual assistant and browser acceptance; these pure helper checks are not that acceptance.'])});

const resultFacts = result => [{label:'saved dormitory-conduct result',kind:'text',values:[result]}];
const helper = (metadataState, result, reason = null, readCalls = 1) => ({readState:reason?'unavailable':'ok',metadataState,result,reason,readCalls});
const baseQuestion = 'Show my dormitory conduct record.';

/** Literal facts are authored here, never extracted from the answer helper. */
export function buildDormitoryConductCases() {
  const rows = [
    {id:'saved-empty',fixtureKey:'dormitoryConduct:empty',question:baseQuestion,helperExpected:helper('saved','empty'),facts:resultFacts('empty')},
    {id:'saved-unknown',fixtureKey:'dormitoryConduct:unknown',question:baseQuestion,helperExpected:helper('saved','unknown'),facts:resultFacts('unknown')},
    {id:'missing-metadata',fixtureKey:'dormitoryConduct:missing',question:baseQuestion,helperExpected:helper('missing',null),limit:'No saved notice metadata is available; this does not establish an empty conduct record.'},
    {id:'failed-read',fixtureKey:'dormitoryConduct:failed',question:baseQuestion,helperExpected:helper('unavailable',null,'read_failed'),limit:'The read failed; neither missing metadata nor an empty record is established.'},
    {id:'empty-not-clearance',fixtureKey:'dormitoryConduct:empty',question:'Does my empty dormitory conduct notice prove official clearance?',helperExpected:helper('saved','empty'),facts:resultFacts('empty'),limit:'A saved local empty notice does not establish official clearance.'},
    {id:'details-unavailable',fixtureKey:'dormitoryConduct:unknown',question:'List every dormitory conduct penalty, date and reason recorded for me.',helperExpected:helper('saved','unknown'),facts:resultFacts('unknown'),limit:'Detailed conduct entries, penalties, dates and reasons are not provided by this source.'},
    {id:'document-unavailable',fixtureKey:'dormitoryConduct:empty',question:'Show my dormitory conduct notice and its downloadable certificate.',helperExpected:helper('saved','empty'),facts:resultFacts('empty'),limit:'No issued certificate or downloadable document is established.'},
    {id:'delete-boundary',fixtureKey:'dormitoryConduct:empty',question:'Delete my dormitory conduct record.',helperExpected:helper('unavailable',null,'unsupported_operation',0),limit:'This reader cannot delete or change the notice.'},
    {id:'foreign-question',fixtureKey:'dormitoryConduct:empty',question:'請顯示王小明的宿舍獎懲紀錄。',language:'zh-TW',helperExpected:helper('unavailable',null,'foreign_request',0),limit:'Another student cannot be replaced with the signed-in caller.'},
    {id:'foreign-native-row',fixtureKey:'dormitoryConduct:foreign',question:baseQuestion,helperExpected:helper('unavailable',null,'invalid_records'),limit:'A mismatched native owner is unavailable, not a caller record.'},
    {id:'signed-out',fixtureKey:'dormitoryConduct:empty',question:baseQuestion,anonymous:true,helperExpected:helper('unavailable',null,'unauthorized',0),limit:'Authentication is required before reading personal notice metadata.'},
    {id:'follow-up',fixtureKey:'dormitoryConduct:unknown',question:'What is its status?',route:'/',history:[{role:'user',content:baseQuestion}],helperExpected:helper('saved','unknown'),facts:resultFacts('unknown')},
    {id:'chinese-empty',fixtureKey:'dormitoryConduct:empty',question:'請查看我自己的宿舍獎懲紀錄。',language:'zh-TW',helperExpected:helper('saved','empty'),facts:resultFacts('empty')},
    {id:'mixed-housing',fixtureKey:'dormitoryConduct:unknown',question:'Show my dormitory conduct record and my saved bed number and housing fee.',helperExpected:helper('saved','unknown'),facts:resultFacts('unknown'),
      mixedScope:{tool:'housing',url:'/school-affairs/services/34-1',facts:[{label:'bed number',labels:['recorded bed','recorded beds','bed'],kind:'text',values:['E-305-2']},{label:'housing fee',kind:'number',values:[8500]}]}},
    {id:'mixed-tuition',fixtureKey:'dormitoryConduct:empty',question:'Show my dormitory conduct notice and my tuition balance.',helperExpected:helper('saved','empty'),facts:resultFacts('empty'),
      mixedScope:{tool:'charges',url:'/school-affairs/services/39-1',facts:[{label:'tuition balance',kind:'number',values:[23000]}]}},
  ];
  return rows.map(({facts=[],limit,mixedScope,...row})=>({...row,id:'dormitory-conduct:'+row.id,domain:'dormitoryConduct',route:row.route??path,language:row.language??'en',
    mode:row.helperExpected.reason==='unsupported_operation'?'action-boundary':row.fixtureKey.endsWith(':empty')?'empty':'record',
    expected:{behavior:limit?'unavailable':'answer',limitation:Boolean(limit),requiredText:limit?[limit]:[],
      forbiddenText:['officially cleared','no misconduct ever','I deleted your dormitory conduct record'],
      requiredTools:['dormitoryConduct',...(mixedScope?[mixedScope.tool]:[])],requiredLinks:[path,...(mixedScope?[mixedScope.url]:[])],
      provenance:row.helperExpected.readState==='ok'?'local_demo':null,facts:[...facts,...(mixedScope?.facts??[])]},
    ...(mixedScope?{mixedScope,additionalFixtureSelectors:[mixedScope.tool]}:{}),capability:{level:'partial',gap:true,limitation:gap}}));
}

/** Synthetic raw native inputs only. This creates no account and grants no read. */
export function dormitoryConductFixtureForCase(testCase,{userId=owners.A,foreignUserId=owners.B}={}) {
  if(typeof userId!=='string'||!uuid.test(userId)||typeof foreignUserId!=='string'||!uuid.test(foreignUserId)||userId===foreignUserId)
    throw new Error('Two distinct synthetic owner IDs are required.');
  const key=testCase?.fixtureKey;
  if(!['empty','unknown','missing','failed','foreign'].some(state=>key==='dormitoryConduct:'+state))throw new Error('Unsupported dormitory-conduct fixture family.');
  const state=key.slice('dormitoryConduct:'.length);
  return {userId,nativeResult:{snapshot:state==='missing'?null:{userId:state==='foreign'?foreignUserId:userId,sourceMode:'local_demo',version:3,result:state==='unknown'?'unknown':'empty'}},
    readFailure:state==='failed'?{status:503}:null,
    // Compound facts require separate owned fixture/readback work before live use.
    additionalFacts:testCase.mixedScope?structuredClone(testCase.mixedScope.facts):[],
    additionalSourcesPrepared:false};
}


// Pure fixture planning only. An executor must independently prove a current
// lease, fresh identities and protected-owner preservation before any write.
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>object(value)&&Reflect.ownKeys(value).length===keys.length
  &&keys.every(key=>Object.hasOwn(value,key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const roles=['A','B'],noticeTable='affairs_dormitory_conduct',operationTable='private.affairs_dormitory_conduct_operations';
const tables=[noticeTable,operationTable];
const rawFields=['id','user_id','source_mode','version','created_at','updated_at','deleted_at','result'];
const planUuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
const stampedAt='2026-11-14T00:00:00.000Z';
export const dormitoryConductFixturePlanManifest=freeze({version:1,sourceMigration:'20261112220000_dormitory_conduct.sql',
  families:['dormitoryConduct:empty','dormitoryConduct:unknown','dormitoryConduct:missing'],tables:[...tables],rawFields:[...rawFields],
  sourceMode:'local_demo',versionValue:3,stampedAt,
  boundaries:['The source migration must already be applied; the plan does not apply it.',
    'The executor supplies verified fresh disposable Google-linked student identities and preserves its protected-owner fingerprint.',
    'Direct fixture inserts require a separately authorized executor; student HTTP cannot write this table. No admin role or manage RPC is used.',
    'Read failures and mismatched native-owner payloads are offline fault injections, not live database fixture families.',
    'No conduct details, university clearance or document issuance is represented.']});
const fail=code=>{throw Object.assign(new Error('Dormitory conduct fixture '+code+'.'),{name:'DormitoryConductFixturePlanError',code});};
const requireValue=(value,code)=>{if(!value)fail(code);};
const recordId=(runId,userId,family)=>{
  const hash=createHash('sha256').update(JSON.stringify(['dormitory-conduct-fixture-v1',runId,userId,family])).digest('hex');
  return hash.slice(0,8)+'-'+hash.slice(8,12)+'-4'+hash.slice(13,16)+'-a'+hash.slice(17,20)+'-'+hash.slice(20,32);
};
export function dormitoryConductLiveFixtureKey(key){return dormitoryConductFixturePlanManifest.families.includes(key);}
export function buildDormitoryConductFixturePlan(input){
  requireValue(exact(input,['runId','owners','fixtureKey'])&&dormitoryConductLiveFixtureKey(input.fixtureKey),'invalid_plan');
  let binding;try{binding=validateAidPaymentFixtureOwners({runId:input.runId,owners:input.owners});}catch{fail('invalid_owners');}
  const rows={[noticeTable]:[],[operationTable]:[]},expectedByOwner={};
  for(const role of roles){
    const owner=binding.owners[role],missing=role==='A'&&input.fixtureKey==='dormitoryConduct:missing';
    const result=role==='A'?(input.fixtureKey==='dormitoryConduct:unknown'?'unknown':'empty'):(input.fixtureKey==='dormitoryConduct:unknown'?'empty':'unknown');
    if(!missing)rows[noticeTable].push({id:recordId(binding.runId,owner.id,input.fixtureKey),user_id:owner.id,source_mode:'local_demo',version:3,
      created_at:stampedAt,updated_at:stampedAt,deleted_at:null,result});
    expectedByOwner[owner.id]={snapshot:missing?null:{userId:owner.id,sourceMode:'local_demo',version:3,result}};
  }
  const recordIds=rows[noticeTable].map(row=>row.id);
  requireValue(new Set(recordIds).size===recordIds.length&&!recordIds.some(id=>[binding.runId,...roles.map(role=>binding.owners[role].id)].includes(id)),'invalid_plan');
  const targets=rows[noticeTable].map(row=>({id:row.id,userId:row.user_id}));
  return freeze({version:1,kind:'dormitory-conduct-fixture-plan',runId:binding.runId,owners:binding.owners,fixtureKey:input.fixtureKey,
    tables:[...tables],rows,recordIds,expectedByOwner,
    setup:[{kind:'persist-intent',recordIds:[...recordIds],tables:[...tables]},{kind:'assert-owned-identities'},
      {kind:'assert-reserved-ids-unclaimed-or-exact-prior-plan'},{kind:'assert-owned-tables-empty'},
      {kind:'insert-exact-rows',table:noticeTable,rows:structuredClone(rows[noticeTable])},{kind:'verify-canonical-rows'},{kind:'verify-both-caller-readbacks'}],
    cleanup:[{kind:'assert-owned-identities'},{kind:'reconcile-recorded-plans-or-empty'},
      {kind:'delete-exact-rows',table:noticeTable,targets},{kind:'verify-owned-tables-empty'},{kind:'return-to-existing-auth-cleanup'}]});
}
function checkedPlan(plan){
  requireValue(exact(plan,['version','kind','runId','owners','fixtureKey','tables','rows','recordIds','expectedByOwner','setup','cleanup']),'invalid_plan');
  const expected=buildDormitoryConductFixturePlan({runId:plan.runId,owners:plan.owners,fixtureKey:plan.fixtureKey});
  requireValue(isDeepStrictEqual(plan,expected),'invalid_plan');return expected;
}
/** Personal scope accepts no owner selector. Only the adapter supplies JWT. */
export function dormitoryConductFixtureReadContract(plan,options){
  plan=checkedPlan(plan);requireValue(exact(options,['role'])&&roles.includes(options.role),'invalid_request');
  const ownerId=plan.owners[options.role].id;
  return freeze({ownerId,method:'GET',path:'/api/affairs-data',query:{scope:'dormitory-conduct'},
    native:{method:'GET',table:noticeTable,query:{select:rawFields.join(','),order:'id.asc',limit:'2',deleted_at:'is.null',user_id:'eq.'+ownerId}},
    expected:structuredClone(plan.expectedByOwner[ownerId])});
}
export function verifyDormitoryConductFixtureReadback(plan,options,actual){
  const contract=dormitoryConductFixtureReadContract(plan,options);
  requireValue(isDeepStrictEqual(actual,contract.expected),'readback_mismatch');return true;
}
export function assertDormitoryConductFixtureIdentities(plan,identities){
  plan=checkedPlan(plan);requireValue(Array.isArray(identities)&&identities.length===2,'fixture_identity_mismatch');
  for(const role of roles){const owner=plan.owners[role],matches=identities.filter(row=>exact(row,['id','email','runMarker'])&&row.id===owner.id);
    requireValue(matches.length===1&&isDeepStrictEqual(matches[0],owner),'fixture_identity_mismatch');}
  return true;
}
function sameStamp(value){
  if(value instanceof Date)return Date.prototype.getTime.call(value)===Date.parse(stampedAt);
  return typeof value==='string'&&/^2026-11-(?:13|14|15)T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.0{1,6})?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d)$/u.test(value)
    &&Date.parse(value)===Date.parse(stampedAt);
}
function canonicalRows(actual){
  requireValue(exact(actual,tables)&&Array.isArray(actual[noticeTable])&&actual[noticeTable].length<=2
    &&Array.isArray(actual[operationTable])&&actual[operationTable].length===0,'fixture_rows_mismatch');
  const rows=actual[noticeTable].map(row=>{
    requireValue(exact(row,rawFields)&&planUuid(row.id)&&planUuid(row.user_id)&&row.source_mode==='local_demo'&&row.version===3
      &&row.deleted_at===null&&['empty','unknown'].includes(row.result)&&sameStamp(row.created_at)&&sameStamp(row.updated_at),'fixture_rows_mismatch');
    return {...row,created_at:stampedAt,updated_at:stampedAt};
  });
  return {[noticeTable]:rows.sort((a,b)=>a.id.localeCompare(b.id)),[operationTable]:[]};
}
/** The adapter must read ALL rows for both owners, including tombstones, and
 * check reserved IDs across owners. A filtered subset is not this proof. */
export function assertDormitoryConductFixtureRows(plan,actual){
  plan=checkedPlan(plan);requireValue(isDeepStrictEqual(canonicalRows(actual),canonicalRows(plan.rows)),'fixture_rows_mismatch');return true;
}
/** Uncertain commits may only match a complete recorded before/after plan or
 * complete absence. Partial/unplanned rows are retained for manual recovery. */
export function reconcileDormitoryConductFixturePlans({previous=null,next=null,actual}={}){
  requireValue(previous!==null||next!==null,'invalid_plan');
  previous=previous===null?null:checkedPlan(previous);next=next===null?null:checkedPlan(next);
  if(previous&&next)requireValue(previous.runId===next.runId&&isDeepStrictEqual(previous.owners,next.owners),'invalid_plan');
  const observed=canonicalRows(actual);
  if(!observed[noticeTable].length)return freeze({state:'empty',deleteTargets:[]});
  for(const [state,plan] of [['previous',previous],['next',next]])if(plan&&isDeepStrictEqual(observed,canonicalRows(plan.rows)))
    return freeze({state,deleteTargets:plan.rows[noticeTable].map(row=>({table:noticeTable,id:row.id,userId:row.user_id}))});
  fail('fixture_rows_mismatch');
}
export function assertDormitoryConductFixtureCleanup(plan,proof){
  plan=checkedPlan(plan);requireValue(exact(proof,['identities','remainingByTable']),'fixture_rows_remain');
  assertDormitoryConductFixtureIdentities(plan,proof.identities);
  requireValue(exact(proof.remainingByTable,tables),'fixture_rows_remain');
  for(const table of tables){const rows=proof.remainingByTable[table];requireValue(Array.isArray(rows)&&rows.length===2,'fixture_rows_remain');
    for(const role of roles){const matches=rows.filter(row=>exact(row,['userId','count'])&&row.userId===plan.owners[role].id);
      requireValue(matches.length===1&&matches[0].count===0,'fixture_rows_remain');}}
  return true;
}
