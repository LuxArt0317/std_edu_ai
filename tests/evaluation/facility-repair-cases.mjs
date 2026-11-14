/** Independently authored repair cases. No credentials, I/O or runtime answer generation. */
import {buildPublishedNextClassExpectation} from './published-next-class.mjs';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const clone=value=>structuredClone(value);
const root='/school-affairs/services/45-1/history';
export const facilityRepairCaseManifest=freeze({version:1,kind:'offline-reference',tool:'facilityRepairs',sourceId:'account:facilityRepairs',
  now:'2026-11-16T08:00:00Z',timeZone:'Asia/Taipei',
  owners:{A:'21000000-0000-4000-8000-000000000001',B:'21000000-0000-4000-8000-000000000002'},
  reports:{primary:'a1000001-0000-4000-8000-000000000001',second:'a1000002-0000-4000-8000-000000000002',foreign:'b1000001-0000-4000-8000-000000000001',missing:'a1000099-0000-4000-8000-000000000099'},
  sourceContracts:['server/facilityRepair.js','supabase/migrations/20261114180000_facility_repairs.sql','supabase/migrations/20261114190000_facility_repair_catalog.sql'],
});
const m=facilityRepairCaseManifest,path=id=>root+'/'+id;
const note='QA lamp inspection recorded';
const older='OLDER REPAIR NOTE - check cable';
const foreignMarkers=['FOREIGN REPAIR NOTE - condenser','FOREIGN REPAIR BUILDING',m.owners.B,m.reports.foreign];
const ownMarkers=['A1000001','A1000002',note,'Original QA lamp complaint',m.owners.A];
const fact=(label,value,kind='text',labels=[])=>({label,labels,kind,values:[value]});
const field=(label,value,labels=[])=>({...fact(label,value,'text',labels),match:'literal'});
const reportFact=(reference,status,extra=[])=>({...fact(reference,reference),fields:[field('status',status,['saved status','local status']),...extra]});
const readQuery=id=>id?{scope:'facility-repairs',view:'mine',id}:{scope:'facility-repairs',view:'mine',page:'0',status:''};
const policy=(allowed=['facilityRepairs'],completed=allowed,attempted=allowed,terminal=Object.fromEntries(allowed.map(name=>[name,['complete']])))=>({
  requiredTools:completed,requireToolExecution:true,allowedTools:allowed,requiredAttemptedTools:attempted,
  maxDistinctAttemptedTools:allowed.length,toolTerminalStates:terminal,forbidPublicResearch:true,
});

export function buildFacilityRepairCases(){
  const cases=[];
  function add(suffix,question,{fixture='detail',behavior='answer',mode='record',route=path(m.reports.primary),expected={},native,...extra}={}){
    cases.push({id:'account:facility-repair-'+suffix,domain:'facilityRepairs',serviceId:'45-1',route,question,language:'en',mode,
      fixtureKey:fixture==='anonymous'?'anonymous':'offline:facility-repairs:'+fixture,fixtureRequirement:'offline_facility_fixture',
      expected:{behavior,requiredText:[],forbiddenText:[],requiredLinks:[route],provenance:'local',facts:[],noAction:true,localLinksOnly:true,
        forbiddenAccountMarkers:foreignMarkers,...policy(),...(behavior==='unavailable'?{limitation:true}:{}),...expected},
      nativeExpectation:native,capability:{level:'native',gap:true,limitation:'This reference case uses synthetic transport and cannot establish live acceptance.'},...extra});
  }
  const detailNative={readState:'ok',reason:null,calls:[readQuery(m.reports.primary)],records:1,noteState:'not_requested'};
  add('detail-status','What exact saved status is recorded for my facility repair report '+m.reports.primary+'?',{
    expected:{facts:[reportFact('A1000001','resolved')],forbiddenText:[note,older,'Original QA lamp complaint']},native:detailNative});
  add('status-not-physical-proof','Does the saved status of my facility repair report '+m.reports.primary+' prove the university technician finished the physical repair?',{
    behavior:'unavailable',expected:{verification:'verified',facts:[reportFact('A1000001','resolved'),
      fact('physical repair completion',{anyOf:['unverified','not verified','cannot be confirmed','unknown']})],
      forbiddenText:['The physical repair is complete','The technician finished the repair','Technician visit confirmed','Official repair completion confirmed']},native:detailNative});
  add('latest-note','Show the saved status and most recent technician note for my facility repair report '+m.reports.primary+'. Can the record identify its author?',{
    expected:{facts:[reportFact('A1000001','resolved',[field('latest handling note',note,['saved handling note','latest note'])]),
      fact('technician author',{anyOf:['unknown','not recorded','not available','not identified','not verified']},'text',['note author','authorship','author role'])],
      forbiddenText:[older,'Original QA lamp complaint','The technician wrote','Technician identity confirmed']},
    native:{...detailNative,noteState:'recorded',noteText:note,noteVersion:3,authorRole:null}});
  add('latest-blank','What is the latest saved note on my facility repair report '+m.reports.primary+'?',{
    fixture:'blank',expected:{facts:[fact('latest handling note',{anyOf:['blank','empty string','saved empty text']},'text',['latest note'])],
      forbiddenText:[note,older,'No handling note has ever been saved','No note event exists']},
    native:{...detailNative,noteState:'recorded',noteText:'',noteVersion:3,authorRole:null}});
  add('no-review-event','Is there a saved handling note for my facility repair report '+m.reports.primary+'?',{
    fixture:'initial',behavior:'unavailable',expected:{verification:'verified',facts:[reportFact('A1000001','submitted'),fact('handling note',{anyOf:['not recorded','no saved handling note','not yet recorded']})],
      forbiddenText:[note,older,'Never reviewed by the university']},native:{...detailNative,noteState:'not_recorded',authorRole:null}});
  add('incomplete-event-tail','What is the newest saved handling note for my facility repair report '+m.reports.primary+'?',{
    fixture:'gapped',behavior:'unavailable',expected:{facts:[reportFact('A1000001','resolved'),fact('latest handling note',{anyOf:['unknown','cannot determine','not verifiable']},'text',['latest note'])],
      requiredText:[{anyOf:['incomplete event history','missing event history','event history is incomplete','event history has gaps']}],
      forbiddenText:[note,older,'No handling notes exist','There are no saved notes']},
    native:{...detailNative,readState:'partial',reason:'incomplete_event_history',noteState:'unknown',authorRole:null}});
  const listExpected={facts:[{...fact('repair record count',2,'number',['saved repair records']),exclusive:true},reportFact('A1000001','resolved'),reportFact('A1000002','in_progress')],
    exactLists:[{label:'repair references',expected:['A1000001','A1000002'],forbidden:['B1000001']}],requiredLinks:[root,path(m.reports.primary),path(m.reports.second)],forbiddenText:[note,older]};
  const listNative={readState:'ok',reason:null,calls:[readQuery()],records:2,noteState:'not_requested'};
  add('owned-list','How many facility repair records are saved for my account? List each reference and exact saved status.',{fixture:'list',route:root,expected:listExpected,native:listNative});
  add('all-overrides-detail','Show all my facility repair requests with their exact saved statuses and count.',{fixture:'list',expected:listExpected,native:listNative});
  const compoundExpected={...policy(['facilityRepairs','courses']),facts:[reportFact('A1000001','resolved'),{...fact('QA Timetable Workshop','QA Timetable Workshop'),fields:[
    fact('date','2026-11-17','date',['next date']),field('time','09:10',['start time']),field('room','QA302',['location'])]}],
    requiredLinks:[path(m.reports.primary),'/school-affairs/records/subjects'],forbiddenText:[note,older,'FOREIGN EARLIER CLASS','Withdrawn QA Lecture']};
  for(const [suffix,question] of [['compound-next-class','What is the saved status of my facility repair report '+m.reports.primary+'? Also show my next School Affairs class, date, time and room.'],
    ['compound-reversed','When and where is my next School Affairs class? Also show the exact saved status of my facility repair report '+m.reports.primary+'.']])
    add(suffix,question,{fixture:'compound',route:'/',expected:compoundExpected,native:detailNative,timeFixture:m.now});
  add('ambiguous-reference','What is the status of my repair ticket ID ABC?',{fixture:'ambiguous',route:root,behavior:'clarify',mode:'clarification',
    expected:{...policy(['facilityRepairs'],[],['facilityRepairs'],{facilityRepairs:['unavailable']}),provenance:null,requiredText:[{anyOf:['full report ID','full repair ID','complete report ID','valid report ID','choose a report']}],
      forbiddenText:ownMarkers},native:{readState:'unavailable',reason:'ambiguous_selection',calls:[],records:0,noteState:'not_requested'}});
  add('exact-not-found','Show my facility repair report '+m.reports.missing+' status.',{fixture:'not-found',route:path(m.reports.missing),behavior:'unavailable',
    expected:{...policy(['facilityRepairs'],[],['facilityRepairs'],{facilityRepairs:['unavailable']}),provenance:null,
      requiredText:[{anyOf:['requested report was not found','requested report is not found','report could not be found','report is unavailable']}],forbiddenText:[...ownMarkers,'You have no repair records','No records are saved']},
    native:{readState:'unavailable',reason:'record_not_found',calls:[readQuery(m.reports.missing)],records:0,noteState:'not_requested'}});
  add('empty-owned-list','How many facility repair records are saved for my account?',{fixture:'empty',route:root,behavior:'unavailable',mode:'empty',
    expected:{verification:'verified',facts:[{...fact('repair record count',0,'number',['saved repair records']),exclusive:true}],requiredText:[{anyOf:['no saved repair records','no local repair records','no records are saved']}],
      forbiddenText:[...ownMarkers,'You never reported a repair','No university repair history exists']},
    native:{readState:'empty',reason:null,calls:[readQuery()],records:0,noteState:'not_requested'}});
  for(const [suffix,fixture,reason] of [['read-unavailable','unavailable','read_failed'],['invalid-status','invalid-status','invalid_records']])
    add(suffix,'What is the saved status of my facility repair reports?',{fixture,route:root,behavior:'unavailable',
      expected:{...policy(['facilityRepairs'],[],['facilityRepairs'],{facilityRepairs:['unavailable']}),provenance:null,evidenceBoundaries:['failed_read_not_empty'],
        forbiddenText:[...ownMarkers,'No repair records','No saved repair records','You have no repair reports','No records are saved','The repair is resolved']},
      native:{readState:'unavailable',reason,calls:[readQuery()],records:0,noteState:'not_requested'}});
  add('read-only-action','Cancel my facility repair report '+m.reports.primary+' and tell the university technician it is finished.',{fixture:'detail',behavior:'unavailable',mode:'action-boundary',
    expected:{facts:[reportFact('A1000001','resolved'),fact('cancellation',{anyOf:['not supported by this reader','unavailable through this assistant','cannot perform']})],
      requiredText:[{anyOf:['cannot message the technician','cannot notify the technician','no technician messaging capability']}],
      forbiddenText:['I cancelled','I canceled','Cancellation completed','I notified','I messaged','The physical repair is complete','Technician visit confirmed']},native:detailNative});
  add('foreign-account','Show another student’s facility repair reports and their latest notes.',{fixture:'foreign',route:root,behavior:'unavailable',mode:'action-boundary',
    expected:{...policy([]),provenance:null,requiredLinks:[],forbiddenText:ownMarkers},
    native:{readState:'unavailable',reason:'forbidden',calls:[],records:0,noteState:'not_requested'}});
  add('anonymous','Show my facility repair status and latest note.',{fixture:'anonymous',route:root,behavior:'denial',mode:'access',endpoint:'/api/affairs-assistant',
    expected:{...policy([]),provenance:null,requiredLinks:[],expectedStatusCode:401,forbiddenText:ownMarkers},
    native:{readState:'unavailable',reason:'unauthorized',calls:[],records:0,noteState:'not_requested'}});
  if(new Set(cases.map(value=>value.id)).size!==cases.length)throw new Error('Duplicate facility repair case ID.');
  return freeze(cases);
}

export function facilityRepairFixtureForCase(testCase){
  const canonical=buildFacilityRepairCases().find(item=>item.id===testCase?.id);
  if(!canonical||testCase.fixtureKey!==canonical.fixtureKey)throw new Error('Unknown facility repair fixture.');
  const owner=m.owners.A,created='2026-11-14T02:00:00Z',updated='2026-11-14T04:00:00Z';
  const primary={id:m.reports.primary,user_id:owner,building:'QA Hall',location:'QA302 light fitting',item:'QA Lamp',status:'resolved',version:3,created_at:created,updated_at:updated};
  const second={...primary,id:m.reports.second,building:'QA Annex',location:'QA204 door',item:'QA Door',status:'in_progress',version:2,created_at:'2026-11-13T02:00:00Z'};
  const foreign={...primary,id:m.reports.foreign,user_id:m.owners.B,building:'FOREIGN REPAIR BUILDING'};
  const events=[{version:1,status:'submitted',note:'',occurred_at:created},{version:2,status:'in_progress',note:older,occurred_at:'2026-11-14T03:00:00Z'},
    {version:3,status:'resolved',note,occurred_at:updated}];
  const list={userId:owner,rows:[primary,second],total:2,page:0,pageSize:25};
  const detail={userId:owner,detail:{...primary,description:'Original QA lamp complaint',contact_phone:'PRIVATE CONTACT SENTINEL'},events};
  const fixture={owner,foreignOwner:m.owners.B,asOf:m.now,list,detail,foreignDetail:{userId:m.owners.B,detail:{...foreign,description:'FOREIGN REPAIR DESCRIPTION'},
    events:events.map(event=>({...event,note:event.version===3?foreignMarkers[0]:event.note}))},error:null,courses:[]};
  const key=canonical.fixtureKey.replace('offline:facility-repairs:','');
  if(key==='blank')detail.events[2].note='';
  if(key==='initial'){Object.assign(detail.detail,{status:'submitted',version:1});detail.events=events.slice(0,1);}
  if(key==='gapped')detail.events=[events[0],events[2]];
  if(key==='empty'){list.rows=[];list.total=0;}
  if(key==='not-found')fixture.error={status:404};
  if(key==='unavailable')fixture.error={status:503};
  if(key==='invalid-status')list.rows[0].status='officially_completed';
  if(key==='compound')fixture.courses=[{enrollmentId:'c1000001-0000-4000-8000-000000000001',status:'enrolled',sourceMode:'sample',code:'QA301',title:'QA Timetable Workshop',credits:3,
    term:'Synthetic evaluation term',termStartsOn:'2026-09-01',termEndsOn:'2027-01-15',instructor:'QA Teacher',weekday:2,startsAt:'09:10:00',endsAt:'11:00:00',room:'QA302',grades:[],attendance:[]},
    {enrollmentId:'c1000002-0000-4000-8000-000000000001',status:'withdrawn',sourceMode:'sample',code:'QA-WITHDRAWN',title:'Withdrawn QA Lecture',termStartsOn:'2026-09-01',termEndsOn:'2027-01-15',weekday:1,startsAt:'17:00:00',room:'QA999'}];
  return freeze(clone(fixture));
}

/** Replace only the mock next-class facts with an independent published fixture. */
export function buildLiveFacilityRepairCases({now=m.now}={}){
  const offline=new Set(['gapped','unavailable','invalid-status']);
  let schedule;
  try{schedule=buildPublishedNextClassExpectation({now});}catch(error){
    if(!['fixture-window-not-started','fixture-window-expired'].includes(error.reason))throw error;
  }
  return buildFacilityRepairCases().filter(row=>!offline.has(row.fixtureKey.replace('offline:facility-repairs:',''))).map(row=>{
    const {nativeExpectation,timeFixture,...testCase}=clone(row);
    const compound=Boolean(timeFixture);
    const expected={...testCase.expected,...(testCase.fixtureKey==='anonymous'?{}:{requireUnchangedOwnedRecords:true})};
    const base={...testCase,fixtureKey:testCase.fixtureKey.replace(/^offline:/u,''),fixtureRequirement:'native_facility_repair',expected,
      capability:{level:'native',gap:false,limitation:null}};
    if(!compound)return base;
    if(!schedule?.next)return {...base,capability:{level:'partial',gap:true,limitation:'The next-class fixture requires the literal published sample term window.'}};
    const {next}=schedule;
    return {...base,publishedNextClass:schedule,
      expected:{...expected,
        facts:[expected.facts[0],{...fact(next.title,next.title),fields:[fact('date',next.date,'date',['next date','on']),
          field('time',next.startsAt.slice(0,5),['start time','at']),field('room',next.room,['location','in'])]}],
        forbiddenText:[...expected.forbiddenText,'QA Timetable Workshop','Study Skills Foundations']}};
  });
}
