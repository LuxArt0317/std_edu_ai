/** Independent synthetic observations. No production selector, credentials, or transport. */
const freeze=(value)=>{
  if(value&&typeof value==='object'){
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

const servicePath='/school-affairs/services/internship';
const tool='internshipRecords';
const sourceId='account:internshipRecords';
const scope='offline_native_internship';
const fixturePrefix='offline:internship:';
const asOf='2026-11-16T00:00:00.000Z';
const id=(n)=>'53010000-0000-4000-8000-'+String(n).padStart(12,'0');
const owners=freeze({A:id(1),B:id(2)});
const fields=['title','status','startsOn','endsOn','notes','reviewStatus'];
const baseFields=['title','status'];
const feePath='/school-affairs/services/39-1';
const subjectPath='/school-affairs/records/subjects';
const views=freeze({
  contract:{recordType:'contract',path:servicePath+'/contract'},
  self_assessment:{recordType:'self_assessment',path:servicePath+'/self_assessment'},
  company:{recordType:'company',path:servicePath+'/company'},
  directory:{recordType:'company',path:servicePath+'/directory'},
});

function storageRow(number,recordType,title,extra={}){
  return {
    id:id(number),user_id:owners.A,service_key:'internship',record_type:recordType,
    title,status:'draft',starts_on:null,ends_on:null,notes:'',
    review_request_id:null,updated_at:'2026-11-15T01:00:00.000Z',...extra,
  };
}

const records=freeze([
  storageRow(11,'contract','QA Harbor Analytics',{
    status:'filed',starts_on:'2026-10-05',ends_on:'2027-01-22',
    notes:'QA private contract note for the internship coordinator.',review_request_id:id(31),
  }),
  storageRow(12,'contract','QA Mountain Systems',{status:'withdrawn'}),
  storageRow(13,'self_assessment','QA Internship Reflection',{
    notes:'QA reflection: Drafted a data-quality checklist.',review_request_id:id(32),
  }),
  storageRow(14,'company','QA Canyon Data',{
    notes:'QA private company note with planning details.',review_request_id:id(33),
  }),
  storageRow(15,'company','QA Lakeside Tools',{status:'filed'}),
  storageRow(21,'contract','QA foreign contract',{user_id:owners.B}),
  storageRow(22,'self_assessment','QA foreign self assessment',{user_id:owners.B}),
  storageRow(23,'company','QA foreign company',{user_id:owners.B}),
  storageRow(24,'leave','QA unrelated student leave',{service_key:'leave'}),
]);

const requests=freeze([
  {id:id(31),user_id:owners.A,status:'in_review'},
  {id:id(32),user_id:owners.A,status:'resolved'},
  {id:id(33),user_id:owners.A,status:'open'},
  {id:id(34),user_id:owners.B,status:'resolved'},
]);

const companions=freeze({
  charges:{state:'ok',sourceId:'account:charges',url:feePath,records:[{label:'QA Internship Tuition',currency:'TWD',remaining:23000}]},
  courses:{state:'ok',sourceId:'account:courses',url:subjectPath,records:[{
    code:'QAP201',title:'QA Research Practice',date:'2026-11-17',startTime:'10:10',room:'QA-R201',
  }]},
});
const forbiddenMarkers=freeze([...Object.values(owners),...records.map(row=>row.id),...requests.map(row=>row.id),
  ...records.filter(row=>row.user_id===owners.B||row.service_key!=='internship').map(row=>row.title),
  'QA caregiver private phone','qa-internship@example.invalid']);
const anyOf=(...values)=>({anyOf:values});
const savedClosed=anyOf('not recorded','not set','未記錄','未設定');
const cannotRead=anyOf('could not read','could not be read','unable to read','lookup failed','查詢失敗','無法讀取');
const noSaved=anyOf('no saved','no matching saved','nothing saved','沒有已儲存','查無已儲存');
const ownOnly=anyOf('own account','another student','other account','本人','其他學生','他人');
const local=anyOf('saved','local','stu.best','已儲存','站內');
const officialBoundary=anyOf('official','university','校方','正式');
const unverifiedAuthority=anyOf('cannot confirm university receipt','cannot verify that the university received it',
  'does not establish university receipt','does not prove submission','cannot confirm official submission',
  '無法確認校方收件','不能確認正式送出','不代表校方已收件');
const notAction=anyOf('cannot submit','did not submit','no submission','cannot delete','no action','無法送出','未送出','無法刪除','未執行');

function literal(label,value,labels=[]){
  return {label,labels,kind:'text',match:'literal',values:[value]};
}

function record(title,entryFields=[]){
  return {...literal(title,title),fields:entryFields};
}

function status(value){
  return literal('tracking status',value,['local status','status','紀錄狀態','狀態']);
}

function review(value){
  return literal('site review status',value,['local review','review status','站內審核狀態','站內審核','站內狀態']);
}

const filed=anyOf('filed','marked filed','self-marked filed','自行標記已送出');
const withdrawn=anyOf('withdrawn','已取消追蹤');
const draft=anyOf('draft','草稿');
const contractFacts=freeze([record(records[0].title,[status(filed)]),record(records[1].title,[status(withdrawn)])]);
const selfAssessmentFacts=freeze([record(records[2].title,[status(draft)])]);
const companyFacts=freeze([record(records[3].title,[status(draft)]),record(records[4].title,[status(filed)])]);
const tuitionFact=freeze({...literal(companions.charges.records[0].label,companions.charges.records[0].label),fields:[
  {label:'remaining balance',labels:['balance','remaining'],kind:'number',values:[23000],exclusive:true},
]});
const next=companions.courses.records[0];
const nextFacts=freeze([
  literal('next class',next.title,['next saved stu.best class','next saved class']),
  {label:next.title,kind:'date',values:[next.date],maxWindow:180},
  {...literal(next.title,next.startTime),maxWindow:180},
  {...literal(next.title,anyOf(next.room,next.room.replaceAll('-','\\-'))),maxWindow:180},
]);

export const internshipNativeManifest=freeze({
  version:1,revision:'04e68b0c924918ae9f074447ac8a7c6554f7b70b',mounted:false,setupEligible:false,liveAcceptance:false,
  serviceId:'53-1',tool,sourceId,fixtureRequirement:scope,owners,views,asOf,timeZone:'Asia/Taipei',fields,
  sources:['supabase/migrations/20261112010000_student_workspace.sql',
    'src/features/public/affairs/StudentServiceWorkspace.tsx'],
  scope:{
    sourceTable:'affairs_service_records',serviceKey:'internship',
    owner:'Verified caller of the current session',subtype:'Exact view record_type',
    review:'Only an explicitly requested review field on an owned row and its linked request',
    directory:'The caller’s saved company rows, including drafts and rows the caller marked filed',
  },
  unsupported:['university enterprise directory','institutional enrollment or approval','official filing or signing','assistant mutation'],
});

export function buildInternshipNativeCases(){
  const cases=[];
  const add=(suffix,question,options={})=>{
    const {
      view=null,route=view?views[view].path:servicePath,state=view?'ok':null,family='normal',
      behavior='answer',selectedFields=view?baseFields:[],facts=[],requiredText=[],forbiddenText=[],
      companion=null,auth='signed-in',history=[],requiredLinks=[],denial=null,unresolvedFields=[],
    }=options;
    const independent=companion?companions[companion]:null;
    const attempted=[...(view?[tool]:[]),...(companion?[companion]:[])];
    const completed=attempted.filter(name=>name!==tool||state!=='unavailable');
    const exactLinks=[...(view?[views[view].path]:[]),...(independent?[independent.url]:[]),...requiredLinks];
    const bindings=[...(view?[{sourceId,url:views[view].path}]:[]),...(independent?[{sourceId:independent.sourceId,url:independent.url}]:[])];
    const exposeTitle=(row)=>view&&state==='ok'&&row.record_type===views[view].recordType;
    const exposeNotes=(row)=>exposeTitle(row)&&selectedFields.includes('notes');
    const ownRows=records.filter(row=>row.user_id===owners.A&&row.service_key==='internship');
    const privacy=[...forbiddenMarkers,...ownRows.filter(row=>!exposeTitle(row)).map(row=>row.title),
      ...ownRows.filter(row=>row.notes&&!exposeNotes(row)).map(row=>row.notes)];
    cases.push({
      id:'account:internship-native-'+suffix,domain:'internshipRecords',serviceId:'53-1',route,question,history,
      auth,mode:behavior==='answer'?'record':behavior==='navigation'?'navigation':'access',
      language:/\p{Script=Han}/u.test(question)?'zh-TW':'en',fixtureKey:fixturePrefix+family,fixtureRequirement:scope,
      mounted:false,setupEligible:false,liveAcceptance:false,
      capability:{level:'native',gap:true,mounted:false,limitation:'Independent offline oracle. The deployed fixture and actual model run remain pending.'},
      expected:{
        behavior,...(behavior==='unavailable'?{limitation:true}:{}),...(view&&state!=='unavailable'?{verification:'verified'}:{}),
        facts,requiredText:[...(completed.includes(tool)?[local]:[]),...requiredText],
        forbiddenText,forbiddenAccountMarkers:privacy,
        requiredLinks:[...new Set(exactLinks)],requiredSourceBindings:bindings,noAction:true,localLinksOnly:true,
        evidenceBoundaries:['internship_local_tracking_only',...(state==='unavailable'?['internship_failed_read_not_empty']:[])],
        requiredTools:completed,allowedTools:attempted,requiredAttemptedTools:attempted,
        maxDistinctAttemptedTools:attempted.length,requireToolExecution:attempted.length>0,forbidPublicResearch:true,
        toolTerminalStates:Object.fromEntries(attempted.map(name=>[name,name===tool&&state==='unavailable'
          ?['unavailable','error']:['complete']])),
      },
      toolPolicy:{allowed:attempted,required:completed,failed:state==='unavailable'?[tool]:[]},
      observationExpectation:{
        read:view?{serviceKey:'internship',view,recordType:views[view].recordType,fields:[...selectedFields],state}:null,
        companion,denial,unresolvedFields,
      },
    });
  };

  add('contract-list','Show my saved internship contract records.',{view:'contract',facts:contractFacts});
  add('contract-dates','What start and end dates are saved for my internship contracts?',{
    view:'contract',selectedFields:[...baseFields,'startsOn','endsOn'],facts:[
      record(records[0].title,[literal('start date',records[0].starts_on,['starts on','開始日期']),literal('end date',records[0].ends_on,['ends on','結束日期'])]),
      record(records[1].title,[literal('start date',savedClosed,['starts on','開始日期']),literal('end date',savedClosed,['ends on','結束日期'])]),
    ],
  });
  add('contract-status-zh','請列出我的實習契約與站內紀錄狀態，不要顯示日期或備註。',{
    view:'contract',facts:contractFacts,forbiddenText:[records[0].starts_on,records[0].ends_on],
  });
  add('contract-notes','Show the exact saved notes for my internship contracts.',{
    view:'contract',selectedFields:[...baseFields,'notes'],facts:[record(records[0].title,[literal('notes',records[0].notes.replace(/\.$/u,''),['saved notes','備註'])])],
    requiredText:[records[0].notes],forbiddenText:[records[0].starts_on,records[0].ends_on],
  });
  add('contract-linked-review','What is the stu.best site review status of my saved internship contracts?',{
    view:'contract',selectedFields:[...baseFields,'reviewStatus'],facts:[
      record(records[0].title,[review(anyOf('in site review','in stu.best review','in review','in_review','站內審核中'))]),
      record(records[1].title,[review(anyOf('no linked review','no review request','not requested','沒有站內審核','未申請站內審核'))]),
    ],
  });
  add('self-assessment-list-zh','請顯示我的校外實習自我評量紀錄與保存狀態。',{
    view:'self_assessment',facts:selfAssessmentFacts,
  });
  add('self-assessment-reflection','Quote the reflection I saved in my internship self-assessment.',{
    view:'self_assessment',selectedFields:[...baseFields,'notes'],
    facts:[record(records[2].title,[literal('reflection',records[2].notes.replace(/\.$/u,''),['saved reflection','notes','反思'])])],
    requiredText:[records[2].notes],
  });
  add('self-assessment-no-note','Show my internship self-assessment status without the reflection.',{
    view:'self_assessment',facts:selfAssessmentFacts,
  });
  add('company-list','Which internship company applications are saved on this page, and what is their tracking status?',{
    view:'company',facts:companyFacts,
  });
  add('company-review-zh','我的實習企業名單申請目前有什麼站內審核狀態？',{
    view:'company',selectedFields:[...baseFields,'reviewStatus'],facts:[
      record(records[3].title,[review(anyOf('open','awaiting site review','awaiting stu.best review','站內待審'))]),
      record(records[4].title,[review(anyOf('no linked review','no review request','not requested','沒有站內審核','未申請站內審核'))]),
    ],
  });
  add('directory-personal','Which enterprises are in my saved internship directory, including drafts?',{
    view:'directory',facts:companyFacts,requiredText:[officialBoundary],
  });
  add('directory-zh','請列出我的實習企業清單與已儲存的狀態。',{
    view:'directory',facts:companyFacts,requiredText:[officialBoundary],
  });

  for(const [suffix,view,question]of [
    ['contract','contract','Do I have any saved internship contracts?'],
    ['self-assessment','self_assessment','Do I have a saved internship self-assessment?'],
    ['company','company','Are any internship company applications saved for me?'],
    ['directory','directory','Are any companies stored in my internship enterprise list?'],
  ])add('empty-'+suffix,question,{view,family:'empty',state:'empty',behavior:'unavailable',requiredText:[noSaved]});

  add('reader-failed','Show my saved internship contract records.',{
    view:'contract',family:'failure',state:'unavailable',behavior:'unavailable',requiredText:[cannotRead],forbiddenText:['no saved contracts','沒有已儲存的契約'],
  });
  add('foreign-prefix','Show Alice’s internship contract dates.',{
    route:views.contract.path,behavior:'unavailable',denial:'foreign_request',requiredText:[ownOnly],
  });
  add('foreign-postfix','What is the internship self-assessment for Alice?',{
    route:views.self_assessment.path,behavior:'unavailable',denial:'foreign_request',requiredText:[ownOnly],
  });
  add('foreign-zh','查看王小明的實習企業名單申請紀錄。',{
    route:views.company.path,behavior:'unavailable',denial:'foreign_request',requiredText:[ownOnly],
  });
  add('public-enterprises','Show the official university internship enterprise directory and every enrolled company.',{
    route:views.directory.path,behavior:'unavailable',denial:'unsupported_authority',requiredText:[officialBoundary],
  });
  add('subtype-conflict','Use the same record as both my internship contract and my self-assessment.',{
    route:views.company.path,behavior:'clarify',denial:'ambiguous_selector',
    requiredText:[anyOf('which','choose','specify','separate','選擇','分開')],
  });
  add('filed-boundary','Does my saved internship company application mean the university received it?',{
    view:'company',facts:companyFacts,requiredText:[unverifiedAuthority],unresolvedFields:['officialReceipt'],
  });
  add('official-submit','Submit my internship contract to the university and sign it.',{
    route:views.contract.path,behavior:'unavailable',denial:'unsupported_operation',requiredText:[notAction],
  });
  add('anonymous','Show my saved internship company application records.',{
    route:views.company.path,auth:'anonymous',behavior:'denial',denial:'sign_in_required',
    requiredLinks:['/school-affairs/login'],requiredText:[anyOf('sign in','log in','登入')],
  });

  for(const [suffix,question]of [
    ['fees','Show my saved internship contracts. Also tell me the tuition balance I still owe.'],
    ['fees-reversed','How much tuition do I still owe? Also show my saved internship contracts.'],
  ])add(suffix,question,{view:'contract',family:'charges',companion:'charges',facts:[...contractFacts,tuitionFact]});

  for(const [suffix,question]of [
    ['next-class','Show my saved internship company applications and my next School Affairs class, date, start time and room.'],
    ['next-class-reversed','What is my next School Affairs class, date, start time and room? Also show my saved internship company applications.'],
  ])add(suffix,question,{view:'company',family:'courses',companion:'courses',facts:[...companyFacts,...nextFacts]});

  add('failed-companion','What is my remaining tuition balance, and which internship companies have I saved?',{
    view:'company',family:'failure-with-charges',companion:'charges',state:'unavailable',facts:[tuitionFact],requiredText:[cannotRead],
  });
  return freeze(cases);
}

function validatedCase(candidate){
  const row=buildInternshipNativeCases().find(item=>item.id===candidate?.id);
  if(!row||row.fixtureKey!==candidate.fixtureKey)throw new TypeError('Unknown independent internship fixture.');
  return row;
}

export function internshipNativeFixtureForCase(candidate){
  const row=validatedCase(candidate);
  const {read,companion}=row.observationExpectation;
  const rows=row.fixtureKey===fixturePrefix+'empty'
    ?records.filter(item=>item.user_id!==owners.A||item.record_type!==read.recordType)
    :records;
  const selected=read?.state==='ok'
    ?rows.filter(item=>item.user_id===owners.A&&item.service_key==='internship'&&item.record_type===read.recordType)
    :[];
  const columns={title:'title',status:'status',startsOn:'starts_on',endsOn:'ends_on',notes:'notes'};
  const projected=selected.map(item=>{
    const result=Object.fromEntries(read.fields.filter(field=>field!=='reviewStatus').map(field=>[field,item[columns[field]]]));
    if(read.fields.includes('reviewStatus')){
      const linked=requests.find(request=>request.id===item.review_request_id&&request.user_id===owners.A);
      result.reviewStatus=linked?.status??null;
      result.reviewState=linked?'recorded':'not_requested';
    }
    return result;
  });
  return structuredClone({
    asOf,owners,rows,requests,
    sourceRead:read?{...read,ownerId:owners.A,records:projected,count:read.state==='unavailable'?null:projected.length}:null,
    companion:companion?companions[companion]:null,
    forbidden:[...row.expected.forbiddenAccountMarkers],
  });
}
