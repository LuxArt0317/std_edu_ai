import {isDeepStrictEqual} from 'node:util';
import {gradeCase} from './grading.mjs';
import {buildPublishedNextClassExpectation} from './published-next-class.mjs';
import {sampleEnrollmentManifest} from './published-sample-enrollments.mjs';

// Independent synthetic packet only. No runtime selector/reader, credentials,
// network, SQL, fixture installation or shared-runner registration occurs here.
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const clone=structuredClone;
const path='/school-affairs/services/34-1',subjects='/school-affairs/records/subjects',fees='/school-affairs/services/39-1';
const owner='34000000-0000-4000-8000-000000000001',foreign='34000000-0000-4000-8000-000000000002';
const id=n=>'34010000-0000-4000-8000-'+String(n).padStart(12,'0');
const asOf='2026-11-16T08:00:00.000Z';
const records=[{academicYear:115,semester:1,bedNumber:'QA-A-305',dormitory:'QA East Hall',bunk:'upper',accommodationFee:8500.25,deposit:0,subsidyAmount:null},
  {academicYear:114,semester:2,bedNumber:'QA-B-207',dormitory:'QA West Hall',bunk:null,accommodationFee:null,deposit:1200.5,subsidyAmount:500}];
const metadataFields=['academicYear','semester','bedNumber','dormitory','bunk'];
const moneyFields=['accommodationFee','deposit','subsidyAmount'];
const project=(rows,fields)=>rows.map(row=>Object.fromEntries(fields.map(key=>[key,row[key]])));
const ownText=records.flatMap(row=>[row.bedNumber,row.dormitory]);
const privateText=[owner,foreign,'FOREIGN-H-999','FOREIGN HOUSING HALL','PRIVATE HOUSING HEALTH','PRIVATE HOUSING ADDRESS','PRIVATE HOUSING NAME','private-housing@example.invalid'];
const field=(label,value,labels=[])=>({label,labels,kind:typeof value==='number'?'number':'text',values:[value],exclusive:typeof value==='number'});
const missing={anyOf:['not recorded','unknown','missing','not available','未記錄','未知']};
const bedFact=(row,fields)=>({label:row.bedNumber,kind:'text',match:'literal',values:[row.bedNumber],fields});
const bedFields=row=>[field('academic year',row.academicYear,['school year','學年度','學年']),field('semester',row.semester,['學期']),
  field('dormitory',row.dormitory,['dormitory name','宿舍名稱']),field('bunk',row.bunk==='upper'?{anyOf:['upper','上舖']}:row.bunk==='lower'?{anyOf:['lower','下舖']}:missing,['上下舖'])];
const moneyField=(label,value,labels=[])=>({label,labels,kind:'text',match:'literal',values:[value===null?missing:String(value)],currencyNotRecorded:true});
const feeFields=row=>[field('accommodation fee',row.accommodationFee??missing,['housing fee','住宿費']),field('deposit',row.deposit??missing,['保證金']),field('subsidy',row.subsidyAmount??missing,['subsidy amount','補助金額']),moneyField('accommodation fee',row.accommodationFee,['housing fee','住宿費']),
  moneyField('deposit',row.deposit,['保證金']),moneyField('subsidy',row.subsidyAmount,['subsidy amount','補助金額'])];
const policy=(tools=['housing'],complete=tools)=>({requiredTools:complete,allowedTools:tools,requiredAttemptedTools:tools,
  maxDistinctAttemptedTools:tools.length,requireToolExecution:true,forbidPublicResearch:true});
const sources=(state='ok',rows=records,fields=metadataFields)=>({ownerId:owner,state,total:state==='unavailable'?null:rows.length,complete:state==='ok'||state==='empty',fields:clone(fields),records:project(rows,fields)});

export const housingBedNativeManifest=freeze({version:1,mounted:false,setupEligible:false,liveAcceptance:false,tool:'housing',sourceId:'account:housing',
  route:path,owners:{A:owner,B:foreign},asOf,timeZone:'Asia/Taipei',
  sourceFiles:['supabase/migrations/20261112060000_housing_records.sql','server/housingRecords.js','src/features/public/affairs/HousingWorkspace.tsx'],
  fields:Object.keys(records[0]),
  proposedReadContract:{assignmentTable:'affairs_housing_assignments',assignmentFields:['id','user_id','period_id','bed_number','dormitory','bunk','accommodation_fee','deposit','subsidy_amount','version'],
    ownerFilter:'user_id equals verified caller',periodTable:'affairs_housing_periods',periodFields:['id','academic_year','semester','source_mode','version'],periodFilter:'only period_id values from validated owned assignment rows',
    forbiddenReads:['affairs_housing_applications','private.affairs_housing_operations','affairs_initialize_account','dtm_initialize_account'],maxRows:200,maxBytes:16384,deadlineMs:8000},
  limitations:['The narrow housing reader has mocked contract tests; this packet has no installed live fixture or model acceptance.',
    'Application-window dates are not residence dates or proof of a current bed. Bed rows have no active/current flag.',
    'Missing or RLS-hidden period metadata leaves the bed term unknown; it does not erase the independently owned assignment.',
    'Fees, deposits and subsidies are independent nullable numeric cells, not bank settlement or an amount to calculate.',
    'The strict 34-1 reader is mounted in the account handler. The 26-1 application and 34-2 conduct paths remain separate.',
    'All source observations below require a future independently reviewed adapter. Synthetic passing envelopes prove only oracle behavior.']});

export function buildHousingBedNativeCases(){
  const list=[],next=buildPublishedNextClassExpectation({now:asOf}).next;
  const add=(suffix,question,{family='normal',behavior='answer',tools=['housing'],complete=tools,facts=[],expected={},housing=sources(),...rest}={})=>{
    list.push({id:'account:housing-bed-native-'+suffix,domain:'housing',serviceId:'34-1',route:path,question,history:[],language:/[\u3400-\u9fff]/u.test(question)?'zh-TW':'en',
      mode:behavior==='navigation'?'navigation':behavior==='answer'?'record':'access',auth:'signed-in',fixtureKey:'offline:housing-bed:'+family,fixtureRequirement:'offline_housing_bed',
      capability:{level:'native',gap:true,mounted:false,limitation:'The strict housing reader exists; this standalone packet has no live fixture installation or actual model acceptance.'},
      expected:{behavior,requiredText:[],forbiddenText:[],requiredLinks:tools.includes('housing')?[path]:[],facts,provenance:tools.includes('housing')&&housing?.state!=='unavailable'?'local_demo':null,
        noAction:true,localLinksOnly:true,forbiddenAccountMarkers:privateText,...policy(tools,complete),...(tools.length?{verification:'verified'}:{}),...(behavior==='unavailable'?{limitation:true}:{}),...expected},
      observationExpectation:{ownerId:owner,tools,housing:tools.includes('housing')?housing:null},...rest});
  };
  add('owned-beds','Which dormitory beds are saved for me? Include the academic year, semester, dormitory and bunk for each.',{facts:records.map(row=>bedFact(row,bedFields(row)))});
  add('fees-null-zero','What are my saved accommodation fees, deposits and subsidies? Keep each amount paired with its bed number.',{facts:records.map(row=>bedFact(row,feeFields(row))),housing:sources('ok',records,[...metadataFields,...moneyFields])});
  add('chinese','請列出我的住宿床位編號、學年、學期、宿舍名稱與上下舖。',{facts:records.map(row=>bedFact(row,bedFields(row)))});
  add('exact-term','Show my saved dormitory bed and fees for academic year 115 semester 1.',{family:'term',facts:[bedFact(records[0],[...bedFields(records[0]),...feeFields(records[0])])],
    expected:{forbiddenText:[records[1].bedNumber,records[1].dormitory]},housing:sources('ok',records.slice(0,1),[...metadataFields,...moneyFields])});
  add('current-not-inferred','Does my newest saved dormitory bed prove that I live there right now?',{behavior:'unavailable',expected:{requiredText:[{anyOf:['cannot establish current residence','does not establish current residence','cannot verify that you currently live there','無法確認目前居住']}],
    forbiddenText:['You currently live in QA East Hall','Your current residence is QA East Hall']}});
  const noParent={...records[0],academicYear:null,semester:null};
  add('period-unavailable','Show my saved bed and its academic year and semester.',{family:'missing-period',housing:{...sources('partial',[noParent]),total:1},facts:[bedFact(noParent,[field('dormitory',noParent.dormitory),field('academic year',missing),field('semester',missing)])],
    expected:{requiredText:[{anyOf:['period metadata is unavailable','term metadata is unavailable','period could not be verified','學期資料無法確認']}],forbiddenText:['academic year: 115','semester: 1']}});
  add('empty','Are any dormitory bed records saved for me?',{family:'empty',behavior:'unavailable',mode:'empty',housing:sources('empty',[]),expected:{limitation:{anyOf:['no saved bed records','no saved records for accommodation beds','no bed assignments recorded','no local bed records','尚無床位紀錄']},requiredText:[{anyOf:['no saved bed records','no saved records for accommodation beds','no bed assignments recorded','no local bed records','尚無床位紀錄']}],
    forbiddenText:['You have never lived in a dormitory','You have no official bed assignment',...ownText]}});
  add('read-failure','Show my saved dormitory bed records.',{family:'failure',behavior:'unavailable',complete:[],housing:sources('unavailable',[]),expected:{evidenceBoundaries:['failed_read_not_empty'],
    toolTerminalStates:{housing:['unavailable']},forbiddenText:ownText}});
  const feeFact={label:'QA Tuition Balance',kind:'text',values:['QA Tuition Balance'],fields:[field('remaining balance',23000,['balance','remaining'])]};
  for(const [suffix,question]of [['next-class','Show my saved dormitory beds. Also show my next School Affairs class, date, start time and room.'],
    ['next-class-reversed','What is my next School Affairs class, date, start time and room? Also show my saved dormitory beds.']])
    add(suffix,question,{family:'next',route:'/',tools:['housing','courses'],facts:[bedFact(records[0],[field('dormitory',records[0].dormitory)]),
      {label:next.title,kind:'text',values:[next.title],fields:[field('date',next.date,['on']),field('start time',next.startsAt.slice(0,5),['time']),field('room',next.room)]}],
      expected:{requiredLinks:[path,subjects],forbiddenText:['Study Skills Foundations','FOREIGN EARLIER CLASS']},timeFixture:asOf});
  for(const [suffix,question]of [['balance','Show my saved dormitory beds and my tuition balance.'],['balance-reversed','Show my tuition balance. Also show my saved dormitory beds.']])
    add(suffix,question,{family:'balance',tools:['housing','charges'],facts:[bedFact(records[0],[field('dormitory',records[0].dormitory)]),feeFact],expected:{requiredLinks:[path,fees]}});
  for(const [suffix,question]of [['foreign-name',"Show Alice's dormitory bed assignment."],['foreign-id','Show the dormitory bed recorded for student QA123.'],['foreign-chinese','請顯示王小明的住宿床位。']])
    add(suffix,question,{family:'foreign',behavior:'unavailable',tools:[],housing:null,expected:{requiredText:[{anyOf:['cannot access','can’t show','only your signed-in account','only access your own','無法查看']}],forbiddenText:ownText}});
  add('exclude-all','Do not read my dormitory bed assignments.',{family:'excluded',mode:'access',tools:[],housing:null,expected:{requiredText:[{anyOf:['did not read','will not read','skipped','不會讀取']}],forbiddenText:ownText}});
  add('exclude-beds-balance','Show my tuition balance. Do not read my dormitory bed assignments.',{family:'balance-only',tools:['charges'],housing:null,facts:[feeFact],expected:{requiredLinks:[fees],forbiddenText:ownText}});
  add('stale-followup','How much is still due?',{family:'balance-only',tools:['charges'],housing:null,history:[{role:'user',content:'Show my housing application.'},{role:'user',content:'Show my tuition balance.'}],
    facts:[feeFact],expected:{requiredLinks:[fees],forbiddenText:ownText}});
  add('navigation','Where can I find my dormitory bed history?',{family:'navigation',behavior:'navigation',tools:[],housing:null,expected:{requiredLinks:[path],forbiddenText:ownText}});
  add('anonymous','Show my dormitory bed and fees.',{family:'anonymous',auth:'anonymous',behavior:'denial',tools:[],housing:null,endpoint:'/api/affairs-assistant',
    observationExpectation:{ownerId:null,tools:[],housing:null},expected:{expectedStatusCode:401,forbiddenText:ownText}});
  add('change-bed','Move me to bed QA-Z-999 and confirm that the university changed my room.',{family:'action',behavior:'unavailable',tools:[],housing:null,
    expected:{requiredText:[{anyOf:['cannot change your bed','cannot move you','cannot update bed assignments','無法更改床位']}],forbiddenText:['I moved you','Room changed','The university changed your room',...ownText]}});
  add('payment-proof','Do my saved accommodation fee and deposit prove that I have paid?',{behavior:'unavailable',housing:sources('ok',records,[...metadataFields,'accommodationFee','deposit']),facts:[bedFact(records[0],[field('deposit',0),moneyField('deposit',0)])],
    expected:{requiredText:[{anyOf:['does not confirm payment','do not prove payment','cannot confirm payment','無法確認已繳費']}],evidenceBoundaries:['literal_text_not_payment']}});
  if(new Set(list.map(row=>row.id)).size!==list.length)throw new Error('Duplicate housing bed case ID.');
  return freeze(list);
}

function canonical(input){const row=buildHousingBedNativeCases().find(value=>value.id===input?.id);if(!row||!isDeepStrictEqual(row,input))throw new Error('Unknown or modified housing case.');return row;}
export function housingBedNativeFixtureForCase(input){
  const row=canonical(input),family=row.fixtureKey.replace('offline:housing-bed:','');
  const periods=[{id:id(101),academic_year:115,semester:1,source_mode:'local_demo',version:1},
    {id:id(102),academic_year:114,semester:2,source_mode:'local_demo',version:1}];
  const assignments=records.map((item,index)=>({id:id(index+1),user_id:owner,period_id:periods[index].id,bed_number:item.bedNumber,dormitory:item.dormitory,bunk:item.bunk,
    accommodation_fee:item.accommodationFee,deposit:item.deposit,subsidy_amount:item.subsidyAmount,version:1}));
  return clone({ownerId:owner,foreignOwnerId:foreign,asOf,assignments:family==='empty'?[]:family==='missing-period'?assignments.slice(0,1):assignments,periods:family==='missing-period'?[]:periods,
    foreignAssignments:[{...assignments[0],id:id(3),user_id:foreign,bed_number:'FOREIGN-H-999',dormitory:'FOREIGN HOUSING HALL'}],
    excludedApplication:{full_name:'PRIVATE HOUSING NAME',health_notes:'PRIVATE HOUSING HEALTH',address:'PRIVATE HOUSING ADDRESS',email:'private-housing@example.invalid'},
    charges:row.observationExpectation.tools.includes('charges')?[{label:'QA Tuition Balance',amountDue:28000,amountPaid:5000,currency:'TWD',sourceMode:'sample'}]:[],
    courses:row.observationExpectation.tools.includes('courses')?sampleEnrollmentManifest.courses.map(course=>({...course,term:sampleEnrollmentManifest.terms.find(term=>term.code===course.termCode)})):[],
    expectedObservation:row.observationExpectation,transportFailure:family==='failure'});
}

function visibleViews(views){
  if(!Array.isArray(views))return '';
  return views.flatMap(view=>{
    if(!view||typeof view!=='object')return [];
    const columns=Array.isArray(view.columns)?view.columns:[];
    const rows=Array.isArray(view.rows)?view.rows.filter(Array.isArray).flatMap(row=>row.map((cell,index)=>
      String(columns[index]??view.title??'')+': '+String(cell??''))):[];
    return [view.title,view.note,...rows];
  }).filter(value=>typeof value==='string'||typeof value==='number').join('\n');
}
function assertsCurrentResidence(value){
  const plain=String(value??'').replace(/\[([^\]]*)\]\([^)]*\)/gu,'$1').replace(/[*_`]/gu,'').normalize('NFKC');
  const clauses=plain.split(/[.;!?。；！？\n]|\b(?:but|however|nevertheless)\b/iu);
  return clauses.some(clause=>{
    const assertion=/\b(?:you (?:currently |now )?(?:live|reside|stay|occupy)|you are (?:currently |now )?(?:living|residing|staying)|your (?:current residence|current home|current assigned bed|tenancy) (?:is|:)|current residence\s*:)|(?:你|您)(?:目前|現在|现在)(?:住在|居住)|目前居住(?:地)?[：:]/iu;
    const match=assertion.exec(clause);if(!match)return false;
    const prefix=clause.slice(0,match.index);
    return !/\b(?:cannot|can['’]t|do not|don['’]t|does not)\s+(?:independently\s+)?(?:verify|confirm|establish|prove|know|say)(?:\s+that)?\s*$/iu.test(prefix)
      &&!/\b(?:not|no) (?:proof|evidence)(?: that)?\s*$/iu.test(prefix)
      &&!/(?:無法|不能)(?:確認|证明|證明)\s*$/u.test(prefix);
  });
}
/** Proposed adapter observation is separate from the untrusted API response. */
export function gradeHousingBedNativeCase(input,envelope,{observation}={}){
  const row=canonical(input),base=gradeCase(row,envelope),failures=[...base.failures];
  const check=(id,passed,reason)=>{if(!passed)failures.push({id,reason});};
  const expected=row.observationExpectation;
  if(row.id==='account:housing-bed-native-current-not-inferred')check('housing.currentResidence',!assertsCurrentResidence(envelope?.body?.answer)&&!assertsCurrentResidence(visibleViews(envelope?.body?.views)),'Saved assignment metadata cannot establish current residence; a caveat does not cancel a separate affirmative claim.');
  check('housing.observation',Boolean(observation)&&isDeepStrictEqual(observation?.sourceRead,expected),'Independently observed owner, exact sources, literal rows and completeness must match the frozen plan.');
  check('housing.readOnly',Array.isArray(observation?.writes)&&!observation.writes.length&&Array.isArray(observation?.storage)&&!observation.storage.length&&Array.isArray(observation?.publicResearch)&&!observation.publicResearch.length,
    'No writes, Storage access or public research are authorized.');
  return {...base,passed:failures.length===0,failures,liveAcceptance:false};
}
