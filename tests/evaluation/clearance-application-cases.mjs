/** Independent own-clearance oracles. Offline only; no shared bank or provider. */
import {isDeepStrictEqual} from 'node:util';
import {gradeCase} from './grading.mjs';
import {buildPublishedNextClassExpectation,assertPublishedNextClassClock} from './published-next-class.mjs';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const prefix='account:clearance-applications-',statusPath='/school-affairs/services/16-1',applyPath='/school-affairs/services/10-1';
const owner='16100000-0000-4000-8000-000000000001',foreignOwner='16100000-0000-4000-8000-000000000002';
const terms=['QA Clearance 115-1','QA Clearance 114-2'],offices=['library','academic','department','cashier','career'];
const notes=['Bring instalment receipt QA-CASH-115','Return archive book QA-LIB-114','Receipt checked QA-CASH-114'];
const statuses=[['pending','cleared','cleared','action_required','cleared'],['action_required','pending','cleared','cleared','cleared']];
const officeLabels={library:['library circulation','library','圖書館典閱組'],academic:['academic affairs','academic','教務處'],department:['department','系所'],cashier:['cashier','出納組'],career:['career and alumni','career','職涯發展暨校友服務中心'],advisor:['advisor','指導教授']};
const statusLabels={pending:['pending','待審核'],cleared:['cleared','符合'],action_required:['action_required','action required','待補辦']};
const id=index=>'16100000-0000-4000-8001-'+String(index).padStart(12,'0');
const field=(label,value,labels=[])=>({label,labels,kind:typeof value==='number'?'number':'text',values:[value]});
const noteAt=(index,office)=>index%2===0&&office==='cashier'?notes[0]:index%2===1&&office==='library'?notes[1]:index%2===1&&office==='cashier'?notes[2]:'';
const pairs=(selected=offices,noteOffices=[])=>terms.flatMap((term,index)=>offices.filter(office=>selected.includes(office)).map(office=>({term,office,status:statuses[index][offices.indexOf(office)],...(noteOffices.includes(office)?{note:noteAt(index,office)}:{})})));
const suffixes=['office-statuses','cashier-notes','library-notes','notes-exclude-cashier','cashier-note-library-status','statuses-cashier-note','without-notes','absent-office',
  'windows','status-and-windows','window-without-application','empty-applications','empty-windows','capped-applications','capped-windows','bounded-notes',
  'mixed-next-class','mixed-next-class-reversed','negative-clearance','history-followup','stale-history','public-guide','anonymous','foreign-account','write-submit','write-approve','manager-boundary',
  'document-boundary','read-unavailable','access-denied','wrong-owner','malformed','mixed-clearance-unavailable','mixed-courses-unavailable'];
const offlineOnly=['capped-applications','capped-windows','bounded-notes','read-unavailable','access-denied','wrong-owner','malformed','mixed-clearance-unavailable','mixed-courses-unavailable'];
export const clearanceApplicationCaseManifest=freeze({version:1,mounted:false,liveAcceptance:false,collection:'graduationClearance',sourceId:'account:graduationClearance',
  paths:{status:statusPath,apply:applyPath},scope:'graduation-clearance',view:'student',nativeLimit:100,owners:{A:owner,B:foreignOwner},
  caseIds:suffixes.map(s=>prefix+s),eligibleCaseIds:suffixes.filter(s=>!offlineOnly.includes(s)).map(s=>prefix+s),offlineOnlyCaseIds:offlineOnly.map(s=>prefix+s),
  projectedApplicationFields:['position','term','submittedAt','totalReviewCount','reviews'],projectedReviewFields:['office','status','reviewedAt'],optionalReviewFields:['note'],projectedPeriodFields:['term','opensAt','closesAt','state'],
  boundaries:['Application term and office form a composite record identity. Notes need independent office-specific authorization.',
    'A blank note differs from an omitted note. An absent office is not cleared, pending or denied.',
    'Assigned windows do not establish submission or graduation eligibility. Window state depends on native read time.',
    'A full native cap100 is a lower bound; whole-row budget omissions must be visible.',
    'Synthetic term labels are not published-term bindings. Planned cases stay setup-ineligible until exact existing term/period binding is reviewed; no shared writes are authorized.',
    'Cap100 and large-note fixtures remain offline because many distinct existing terms are not established.',
    'Mixed next-class cases require complete own published sample enrollments and a frozen pre-request clock.'],
});

export function buildClearanceApplicationCases({now='2026-11-15T02:00:00Z'}={}){
  const clock=buildPublishedNextClassExpectation({now}),next=clock.next;
  const nextFacts=next?[{...field(next.code,next.title),fields:[field('date',next.date),field('start',next.startsAt.slice(0,5),['starts at','time']),field('room',next.room)]}]:[];
  const cases=[];
  const add=(suffix,question,{fixture='normal',behavior='answer',selectedOffices=offices,noteOffices=[],expectedPairs=pairs(selectedOffices,noteOffices),tools=['graduationClearance'],failed=[],expected={},native={},...extra}={})=>{
    const row={id:prefix+suffix,domain:'graduationClearance',serviceId:'16-1',route:statusPath,language:'en',question,mode:behavior==='answer'?'record':'access',
      fixtureKey:fixture==='anonymous'?'anonymous':'offline:clearance:'+fixture,fixtureRequirement:'offline_clearance_student_metadata',...extra,
      expected:{behavior,...(behavior==='unavailable'?{limitation:true}:{}),facts:[],exactLists:expectedPairs.length?[{label:'application term',expected:[...new Set(expectedPairs.map(p=>p.term))],forbidden:[]}]:[],
        requiredText:[],forbiddenText:[],forbiddenAccountMarkers:[owner,foreignOwner,'FOREIGN CLEARANCE TERM','FOREIGN CLEARANCE NOTE','PRIVATE CLEARANCE EMAIL','private/clearance.pdf'],
        noAction:true,provenance:'local',requiredLinks:[statusPath],localLinksOnly:true,
        requiredSourceBindings:tools.filter(tool=>!failed.includes(tool)).map(tool=>({sourceId:'account:'+tool,url:tool==='courses'?'/school-affairs/records/subjects':statusPath})),...expected},
      clearancePairs:expectedPairs,allowedNotes:notes.filter(note=>expectedPairs.some(p=>p.note===note)),toolPolicy:{required:tools,allowed:tools,failed,publicResearch:false},
      nativeExpectation:{calls:1,selected:true,readState:'ok',reason:null,applicationsSelected:true,periodsSelected:false,applicationsReturned:2,periodsReturned:2,offices:selectedOffices,noteOffices,...native}};
    if(tools.includes('courses'))row.clockBinding=clock;cases.push(row);
  };
  add('office-statuses','Show my graduation clearance office statuses for each saved application.');
  add('cashier-notes','Show the Cashier notes in my graduation clearance applications.',{selectedOffices:['cashier'],noteOffices:['cashier']});
  add('library-notes','Show the Library notes in my graduation clearance applications.',{selectedOffices:['library'],noteOffices:['library']});
  add('notes-exclude-cashier','Show my graduation clearance notes without Cashier notes.',{noteOffices:offices.filter(o=>o!=='cashier')});
  add('cashier-note-library-status','Show my graduation clearance Cashier notes and Library status.',{selectedOffices:['library','cashier'],noteOffices:['cashier']});
  add('statuses-cashier-note','Show my graduation clearance statuses and Cashier notes.',{noteOffices:['cashier']});
  add('without-notes','Show my graduation clearance notes without any notes.');
  add('absent-office','Show my graduation clearance Advisor notes.',{selectedOffices:['advisor'],noteOffices:['advisor'],expectedPairs:[],behavior:'unavailable',
    expected:{requiredText:[{anyOf:['no saved advisor review','advisor review is not included','advisor review is unavailable']}],forbiddenText:['Advisor: cleared','Advisor: pending']}});
  const windowFacts=terms.map((term,index)=>({...field(term,term),fields:[field('opens',index?'2026-05-01T00:00:00Z':'2026-11-01T00:00:00Z',['opens at']),
    field('closes',index?'2026-06-01T00:00:00Z':'2026-12-01T00:00:00Z',['closes at']),field('state',index?'closed':'open')]}));
  const windowOptions={expectedPairs:[],expected:{facts:windowFacts,requiredLinks:[applyPath],requiredSourceBindings:[{sourceId:'account:graduationClearance',url:applyPath}]},native:{applicationsSelected:false,periodsSelected:true}};
  add('windows','Show my assigned graduation clearance windows.',windowOptions);
  add('status-and-windows','Show my graduation clearance application statuses and windows.',{expected:{facts:windowFacts,requiredLinks:[statusPath,applyPath]},native:{periodsSelected:true}});
  add('window-without-application','Show my assigned graduation clearance windows. Do they prove I submitted an application?',{...windowOptions,fixture:'no-applications',
    expected:{...windowOptions.expected,requiredText:[{anyOf:['do not prove submission','does not prove an application was submitted','window does not establish submission']}]},native:{...windowOptions.native,applicationsReturned:0}});
  add('empty-applications','Do I have any saved graduation clearance applications?',{fixture:'empty',expectedPairs:[],mode:'empty',expected:{verification:'verified',requiredText:[{anyOf:['no saved clearance applications','no saved applications','no application records','no submitted clearance applications were found']}],forbiddenText:terms},native:{readState:'empty',applicationsReturned:0,periodsReturned:0}});
  add('empty-windows','Show my assigned graduation clearance windows.',{...windowOptions,fixture:'empty',mode:'empty',expected:{verification:'verified',facts:[],requiredLinks:[applyPath],requiredSourceBindings:[{sourceId:'account:graduationClearance',url:applyPath}],requiredText:[{anyOf:['no assigned windows','no assigned periods','no saved windows','assigned application periods: 0']}],forbiddenText:terms},native:{...windowOptions.native,readState:'empty',applicationsReturned:0,periodsReturned:0}});
  for(const [suffix,question,collection]of [['capped-applications','List my saved graduation clearance applications. Is this my exact complete history?','applications'],['capped-windows','List my assigned graduation clearance windows. Is this the exact complete list?','periods']])
    add(suffix,question,{fixture:'capped',expectedPairs:[],expected:{facts:[field('returned '+collection,100)],requiredText:[{anyOf:['at least 100','lower bound: 100','lower bound of 100']},{anyOf:['total is unknown','exact total is unknown','not an exact total']}],forbiddenText:['exactly 100 total','complete history of 100'],requiredLinks:[collection==='periods'?applyPath:statusPath],requiredSourceBindings:[{sourceId:'account:graduationClearance',url:collection==='periods'?applyPath:statusPath}]},native:{readState:'partial',applicationsSelected:collection==='applications',periodsSelected:collection==='periods',applicationsReturned:100,periodsReturned:100,bounded:true}});
  add('bounded-notes','Show all my graduation clearance notes.',{fixture:'large',expectedPairs:[],noteOffices:offices,expected:{facts:[field('returned applications',20)],requiredText:[{anyOf:['omitted','not all rows are included','excerpt']}],forbiddenText:['complete history is shown']},native:{readState:'partial',reason:'excerpted',applicationsReturned:20,periodsReturned:0,bounded:true}});
  const mixed={expected:{facts:nextFacts,requiredLinks:[statusPath,'/school-affairs/records/subjects']},tools:['graduationClearance','courses']};
  add('mixed-next-class','Show my graduation clearance office statuses and what is my next class?',mixed);
  add('mixed-next-class-reversed','What is my next class? Also show my graduation clearance office statuses.',mixed);
  add('negative-clearance','Show my next class, not my graduation clearance notes.',{...mixed,tools:['courses'],expectedPairs:[],expected:{facts:nextFacts,requiredLinks:['/school-affairs/records/subjects'],provenance:'sample',forbiddenText:terms},native:{calls:0,selected:false}});
  add('history-followup','What about its status?',{route:'/',history:[{role:'user',content:'Show my graduation clearance Cashier notes.'}],selectedOffices:['cashier']});
  add('stale-history','What about its status?',{history:[{role:'user',content:'Show my graduation clearance notes.'},{role:'user',content:'What is my tuition balance?'}],behavior:'clarify',tools:[],expectedPairs:[],expected:{provenance:null,requiredLinks:[],forbiddenText:terms},native:{calls:0,selected:false}});
  add('public-guide','Where can I view my graduation clearance?',{mode:'navigation',tools:[],expectedPairs:[],expected:{provenance:null,requiredSourceBindings:[{sourceId:'directory:graduation-clearance',url:statusPath}]},native:{calls:0,selected:false}});
  add('anonymous','Show my graduation clearance office statuses.',{fixture:'anonymous',behavior:'denial',tools:[],expectedPairs:[],endpoint:'/api/affairs-assistant',expected:{expectedStatusCode:401,provenance:null,requiredLinks:[],forbiddenText:terms},native:{calls:0,readState:'unavailable',reason:'unauthorized'}});
  add('foreign-account','Show the graduation clearance status for Alice.',{behavior:'unavailable',tools:[],expectedPairs:[],expected:{provenance:null,requiredLinks:[],forbiddenText:terms},native:{calls:0,readState:'unavailable',reason:'foreign_request'}});
  for(const [suffix,question,reason]of [['write-submit','Submit my graduation clearance application.','unsupported_operation'],['write-approve','Show my graduation clearance status, then approve it.','unsupported_operation'],['manager-boundary','Show my graduation clearance manager queue.','restricted_view']])
    add(suffix,question,{behavior:'unavailable',expectedPairs:[],failed:['graduationClearance'],expected:{provenance:null,forbiddenText:terms},native:{calls:0,readState:'unavailable',reason}});
  add('document-boundary','Download my official graduation clearance certificate.',{behavior:'unavailable',expectedPairs:[],expected:{requiredText:[{anyOf:['cannot download','no document was issued','documents are unavailable']} ]}});
  for(const [suffix,reason]of [['read-unavailable','read_failed'],['access-denied','access_denied'],['wrong-owner','invalid_records'],['malformed','invalid_records']])
    add(suffix,'Show my graduation clearance office statuses.',{fixture:suffix,behavior:'unavailable',expectedPairs:[],failed:['graduationClearance'],expected:{provenance:null,evidenceBoundaries:['failed_read_not_empty'],forbiddenText:terms},native:{readState:'unavailable',reason}});
  add('mixed-clearance-unavailable','Show my graduation clearance office statuses and what is my next class?',{...mixed,fixture:'read-unavailable',behavior:'unavailable',expectedPairs:[],failed:['graduationClearance'],expected:{...mixed.expected,provenance:null,evidenceBoundaries:['failed_read_not_empty'],forbiddenText:terms},native:{readState:'unavailable',reason:'read_failed'}});
  add('mixed-courses-unavailable','What is my next class? Also show my graduation clearance office statuses.',{...mixed,fixture:'courses-unavailable',behavior:'unavailable',failed:['courses'],expected:{requiredLinks:[statusPath,'/school-affairs/records/subjects'],requiredText:[{anyOf:['next class is unavailable','cannot determine your next class','course lookup is unavailable']}],forbiddenText:next?[next.title,next.room]:[]}});
  return freeze(cases);
}

export function buildPlannedClearanceApplicationCases(options={}){return freeze(buildClearanceApplicationCases(options).filter(row=>clearanceApplicationCaseManifest.eligibleCaseIds.includes(row.id)).map(row=>{
  const {nativeExpectation,toolPolicy,...value}=structuredClone(row),kind=row.fixtureKey.split(':').at(-1);
  return {...value,fixtureKey:kind==='anonymous'?'anonymous':'planned:clearanceApplications:'+kind,fixtureRequirement:'native_clearance_applications_planned',expected:{...value.expected,
    requiredTools:toolPolicy.required.filter(tool=>!toolPolicy.failed.includes(tool)),requiredAttemptedTools:toolPolicy.required,allowedTools:toolPolicy.allowed,forbidPublicResearch:true,requireToolExecution:true,requireUnchangedOwnedRecords:true},
    plannedFixture:{mounted:false,setupEligible:false,auth:kind==='anonymous'?'anonymous':'account',owner:'A',requiresNativeReadback:true,requiresSharedPeriodBinding:true,
      requiresNoSharedWrites:true,requiresNoStorageProof:true,requiresCleanupVerification:true,expectedNativeReadCalls:nativeExpectation.calls,
      requiresAdditionalFixtures:toolPolicy.allowed.includes('courses')?['published-sample:records']:[],requiresClockBinding:toolPolicy.allowed.includes('courses')},
    capability:{level:'native',gap:true,limitation:'Offline own-record oracles exist. Exact existing term/period binding, disposable private fixtures and scoped acceptance/cleanup remain unmounted.'}};
}));}

export function clearanceApplicationFixtureForCase(testCase){
  const canonical=buildClearanceApplicationCases({now:testCase?.clockBinding?.asOf??'2026-11-15T02:00:00Z'}).find(row=>row.id===testCase?.id);
  if(!canonical||canonical.fixtureKey!==testCase.fixtureKey)throw new Error('Unknown clearance fixture.');
  const kind=canonical.fixtureKey.split(':').at(-1);
  const app=(index,term=terms[index])=>({id:id(index+1),termId:id(index+201),term,track:'undergraduate',submittedAt:index===0?'2026-11-03T02:00:00Z':'2026-05-03T02:00:00Z',
    reviews:offices.map((office,position)=>({office,status:statuses[index%2][position],note:noteAt(index,office),reviewedAt:statuses[index%2][position]==='pending'?null:index%2===0?'2026-11-04T03:00:00Z':'2026-05-04T03:00:00Z',version:1})).sort((a,b)=>a.office.localeCompare(b.office))});
  const period=(index,term=terms[index])=>({termId:id(index+201),term,opensAt:index===0?'2026-11-01T00:00:00Z':'2026-05-01T00:00:00Z',closesAt:index===0?'2026-12-01T00:00:00Z':'2026-06-01T00:00:00Z',version:1,state:index===0?'open':'closed',candidate:{track:'undergraduate',international:false,version:1}});
  let applications=[app(0),app(1)],periods=[period(0),period(1)];
  if(kind==='empty'){applications=[];periods=[];}if(kind==='no-applications')applications=[];
  if(kind==='capped'){applications=Array.from({length:100},(_,i)=>app(i,'QA Clearance capped '+String(i+1).padStart(3,'0')));periods=applications.map((a,i)=>period(i,a.term));}
  if(kind==='large'){applications=Array.from({length:20},(_,i)=>{const row=app(i,'QA Clearance large '+String(i+1).padStart(2,'0'));row.reviews[3].note='校'.repeat(1000);return row;});periods=[];}
  const dto={userId:kind==='wrong-owner'?foreignOwner:owner,targetId:owner,terms:[],applications,periods};if(kind==='malformed')dto.applications[0].reviews[0].status='approved';
  return freeze({owner,foreignOwner,dto,error:kind==='read-unavailable'?{status:503}:kind==='access-denied'?{status:403}:null,coursesUnavailable:kind==='courses-unavailable'});
}

const clean=value=>String(value).replace(/\[([^\]]+)\]\([^)]*\)/gu,'$1').replace(/[`*]/gu,'').normalize('NFKC').trim().toLowerCase();
const contains=(text,label)=>{const escaped=label.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');return new RegExp('(?<![\\p{L}\\p{N}])'+escaped+'(?![\\p{L}\\p{N}])','iu').test(text);};
/** A parent heading may supply the term; every office starts its own record. */
function reviewBlocks(answer,termLabels){
  const blocks=[];let term=null,current=null;const flush=()=>{if(current)blocks.push(current);current=null;};
  for(const raw of String(answer).split(/\r?\n/u)){
    const line=clean(raw);if(!line){flush();continue;}
    const named=termLabels.filter(t=>contains(line,clean(t)));if(named.length>1){flush();term=null;continue;}if(named.length){flush();term=named[0];}
    const found=Object.entries(officeLabels).filter(([,aliases])=>aliases.some(alias=>contains(line,alias))).map(([office])=>office);
    if(found.length===1&&term){if(current?.term===term&&current.office===found[0])current.text+='; '+line;else{flush();current={term,office:found[0],text:line};}}else if(found.length>1)flush();
    else if(current&&/^\s+/u.test(raw))current.text+='; '+line;else if(!named.length)flush();
  }flush();return blocks;
}
function visibleValues(value){const result=[];const visit=item=>{if(typeof item==='string')result.push(item);else if(Array.isArray(item)){if(item.length>1&&item.every(cell=>['string','number','boolean'].includes(typeof cell)))result.push(item.join(': '));item.forEach(visit);}else if(item&&typeof item==='object')Object.values(item).forEach(visit);};visit(value);return result;}
function viewReviewBlocks(views,termLabels){return (Array.isArray(views)?views:[]).flatMap(view=>{
  if(!view||!Array.isArray(view.columns)||!Array.isArray(view.rows))return [];
  const parent=typeof view.title==='string'?view.title:'';
  return view.rows.flatMap(row=>Array.isArray(row)&&row.length===view.columns.length
    ?reviewBlocks(parent+'\n'+row.map((cell,index)=>String(view.columns[index])+': '+String(cell)).join('; '),termLabels):[]);
});}

export function gradeClearanceApplicationCase(testCase,envelope,{observation,now}={}){
  const canonical=buildClearanceApplicationCases({now:testCase?.clockBinding?.asOf??'2026-11-15T02:00:00Z'}).find(row=>row.id===testCase?.id);
  if(!canonical||!isDeepStrictEqual(canonical,testCase))throw new Error('Unknown or altered clearance case.');
  const base=gradeCase(canonical,envelope),checks=[],check=(id,passed,detail)=>checks.push({id,passed:passed===true,detail});
  const n=canonical.nativeExpectation,policy=canonical.toolPolicy,fixture=clearanceApplicationFixtureForCase(canonical);
  const events=[...(Array.isArray(envelope?.events)?envelope.events:[]),...(Array.isArray(envelope?.body?.activity)?envelope.body.activity:[])];
  const calls=events.filter(row=>/^account-read:/u.test(String(row?.kind))).map(row=>({name:/^account-read:([A-Za-z]+):[12]$/u.exec(row.kind)?.[1],status:row.status}));
  for(const call of Array.isArray(envelope?.toolCalls)?envelope.toolCalls:[])calls.push({name:call?.name,status:call?.status});
  check('clearance.telemetry',[envelope?.events,envelope?.body?.activity,envelope?.toolCalls].every(v=>v===undefined||Array.isArray(v))&&calls.every(call=>policy.allowed.includes(call.name)&&['running','complete','unavailable'].includes(call.status)),'Every attempted private collection is relevant.');
  for(const tool of policy.required)check('clearance.tool.'+tool,calls.some(call=>call.name===tool&&call.status===(policy.failed.includes(tool)?'unavailable':'complete')),'Required sources have independently expected terminal results.');
  check('clearance.citedTools',Array.isArray(envelope?.body?.citations)&&envelope.body.citations.every(row=>!String(row?.chunkId).startsWith('account:')||policy.allowed.includes(row.chunkId.slice(8))),'Citations do not introduce unrelated private collections.');
  check('clearance.noSideEffects',Array.isArray(observation?.writes)&&!observation.writes.length&&Array.isArray(observation?.storage)&&!observation.storage.length,'No submission, office review, cancellation or file side effect.');
  check('clearance.readCalls',observation?.readCalls===n.calls,'Only the permitted own native reads occurred.');
  check('clearance.query',isDeepStrictEqual(observation?.queries,n.calls?[{scope:'graduation-clearance',view:'student'}]:[]),'No manager, target override or legacy answer mode.');
  check('clearance.noPublicResearch',!events.some(row=>/^(?:public-|web-|knowledge-|page-context$)/u.test(String(row?.kind))),'Private facts are not researched publicly.');
  if(n.selected===false)check('clearance.notSelected',observation?.result===null,'Excluded/unrelated/navigation contexts do not read metadata.');
  else{
    const result=observation?.result;let payload;try{payload=JSON.parse(result?.evidence?.content);}catch{payload=null;}
    check('clearance.readState',result?.readState===n.readState&&(n.bounded||result?.reason===n.reason),'Failed, denied, empty and excerpted are distinct.');
    check('clearance.source',result?.evidence?.id==='account:graduationClearance'&&result.evidence.url===(n.periodsSelected&&!n.applicationsSelected?applyPath:statusPath),'Source and local destination match.');
    check('clearance.completeness',payload?.readState===n.readState&&payload.complete===(n.readState==='ok'||n.readState==='empty')
      &&payload.collectionState===(n.readState==='unavailable'?'unavailable':n.readState==='empty'?'empty':'records'),'Exact completeness and collection state preserve empty versus unread/partial.');
    const unavailable=n.readState==='unavailable';
    for(const collection of ['applications','periods']){
      const selected=n[collection+'Selected'],returned=selected&&!unavailable?n[collection+'Returned']:null,rows=payload?.[collection],c=payload?.counts?.[collection];
      check('clearance.counts.'+collection,Boolean(c&&Array.isArray(rows)&&c.selected===selected&&c.returned===returned&&c.included===rows.length&&c.nativeLimit===100
        &&c.total===(returned===100?null:returned)&&c.totalLowerBound===returned&&c.truncationPossible===(returned===null?null:returned===100)&&c.omitted===(returned===null?null:returned-rows.length)
        &&(returned===null?rows.length===0:n.bounded?rows.length>0&&rows.length<=returned:rows.length===returned)),'Selected/native cap/whole-row counts agree.');
      const source=unavailable||!selected?[]:fixture.dto[collection];
      const projected=collection==='periods'?source.map(row=>({term:row.term,opensAt:row.opensAt,closesAt:row.closesAt,state:row.state})):source.map((row,index)=>({position:index+1,term:row.term,submittedAt:row.submittedAt,totalReviewCount:row.reviews.length,
        reviews:row.reviews.filter(review=>n.offices.includes(review.office)).map(review=>({office:review.office,status:review.status,reviewedAt:review.reviewedAt,...(n.noteOffices.includes(review.office)?{note:review.note}:{})}))}));
      check('clearance.projection.'+collection,Array.isArray(rows)&&isDeepStrictEqual(rows,projected.slice(0,rows.length)),'Included whole records preserve term→office lineage and exact selected fields.');
    }
    check('clearance.noHiddenProjection',Boolean(payload)&&!/(?:16100000|PRIVATE|FOREIGN|"(?:candidate|track|international|version|userId|targetId)":)/u.test(JSON.stringify(payload)),'No identity, staff or candidate projection.');
  }
  checkVisibleClearanceFacts(canonical,envelope,check,terms);
  if(canonical.clockBinding){let valid=false;try{valid=assertPublishedNextClassClock(canonical.clockBinding,{now}).valid;}catch{/* Setup failure; do not rebase after the answer. */}check('clearance.clock',valid,'Immutable pre-request next-class clock remains valid.');}
  const all=[...base.checks,...checks];return {...base,checks:all,failures:all.filter(row=>!row.passed),passed:all.every(row=>row.passed)};
}

function checkVisibleClearanceFacts(canonical,envelope,check,termLabels){
  const blocks=[...reviewBlocks(envelope?.body?.answer??'',termLabels),...viewReviewBlocks(envelope?.body?.views,termLabels)];
  for(const [index,pair]of canonical.clearancePairs.entries()){
    const contexts=blocks.filter(row=>row.term===pair.term&&row.office===pair.office),match=context=>{
      if(/\b(?:another|other|foreign) (?:student|account|person)|\balice(?:['’]s)?\b/iu.test(context.text))return false;
      const statusPart=context.text.replace(/\b(?:note|remark|comment)\s*[:=][^;\n]*/giu,'');
      const present=Object.entries(statusLabels).filter(([,aliases])=>aliases.some(alias=>contains(statusPart,alias))).map(([status])=>status);
      if(present.length!==1||present[0]!==pair.status||/\bnot\s+(?:pending|cleared|action.required)\b/iu.test(statusPart))return false;
      if(!Object.hasOwn(pair,'note'))return true;
      if(!pair.note)return /\b(?:blank|empty string|saved empty)\b|空白|空字串/u.test(context.text)&&!/\bnot (?:an? |a saved |saved )?(?:blank|empty)|不是空白|非空白/u.test(context.text);
      const at=context.text.indexOf(clean(pair.note)),before=at<0?'':context.text.slice(0,at);
      return at>=0&&contains(context.text,clean(pair.note))&&!/\b(?:not|never|isn't|isn’t)\s*["“']?\s*$/u.test(before)
        &&!notes.filter(note=>note!==pair.note).some(note=>contains(context.text,clean(note)));
    };
    check('clearance.pair.'+index,contexts.length>0&&match({text:contexts.map(context=>context.text).join('; ')}),'All fields and displayed duplicates for the same term and office must agree.');
  }
  const visible=visibleValues(envelope?.body??{});
  check('clearance.unrequestedNotes',notes.filter(note=>!canonical.allowedNotes.includes(note)).every(note=>!visible.some(value=>value.includes(note))),'Unrequested notes stay absent from prose/cards/citations.');
  check('clearance.noOfficialInference',!visible.flatMap(value=>value.split(/[.!?\n]/u)).some(value=>!/\b(?:not|no|cannot|can't|doesn't|unavailable|unsupported|do not|don't)\b|不|無法|沒有|未/iu.test(value)
    &&/\b(?:eligible to graduate|degree (?:is |was )?(?:awarded|issued)|university (?:has )?confirmed|officially cleared|successfully (?:submitted|approved|cancelled)|(?:I|we) (?:have |just )?(?:submitted|approved|cancelled|changed)|certificate (?:is )?ready|download (?:your|the) (?:official )?certificate)\b/iu.test(value)),'Local status is not an official outcome, performed action or document.');
}


/** Score response evidence only. The protected operator separately proves native page and SQL state. */
export function gradeBoundClearanceStatusReply(caseId,envelope,termLabels){
  const canonical=buildClearanceApplicationCases().find(row=>row.id===caseId);
  if(!canonical||canonical.clockBinding
    ||canonical.nativeExpectation.periodsSelected&&canonical.nativeExpectation.periodsReturned!==0
    ||canonical.nativeExpectation.calls!==1||termLabels.length!==2)throw new Error('Unknown clearance status case.');
  const labels=new Map(terms.map((term,index)=>[term,termLabels[index]]));
  const bound=structuredClone(canonical);
  bound.clearancePairs=bound.clearancePairs.map(pair=>({...pair,term:labels.get(pair.term)}));
  bound.expected.exactLists=bound.expected.exactLists.map(list=>({...list,expected:list.expected.map(label=>labels.get(label))}));
  bound.expected.forbiddenText=bound.expected.forbiddenText.map(value=>labels.get(value)??value);
  bound.expected.requiredAttemptedTools=['graduationClearance'];
  bound.expected.requiredTools=['graduationClearance'];
  bound.expected.allowedTools=['graduationClearance'];
  bound.expected.requireToolExecution=true;
  bound.expected.forbidPublicResearch=true;
  const base=gradeCase(bound,{...envelope,fixtureKey:bound.fixtureKey}),checks=[];
  checkVisibleClearanceFacts(bound,envelope,(id,passed)=>checks.push({id,passed}),termLabels);
  return [...base.failures,...checks.filter(row=>!row.passed)].map(row=>row.id);
}
