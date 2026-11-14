import { clubPath } from './clubServicesContract.js';
export const clubOfficerScope='club-officer';
export const clubOfficerMenu=[
  ['officer/applications','2-1活動申請','活動申請'],
  ['officer/profiles','2-2社團基本資料','社團基本資料'],
  ['officer/completion','2-3成果結案','活動申請-成果結案'],
  ['officer/members','2-4學生參與社團記錄','學生參與社團記錄'],
  ['officer/participation','2-5學生參與活動記錄','學生參與活動記錄'],
];
export const clubOfficerViews=['applications','completion','profiles','members','participation','review'];
export const clubOfficerActions={
  submit_club_application:'submit',edit_club_application:'edit',withdraw_club_application:'withdraw',
  complete_club_application:'complete',review_club_application:'review',
};
export const clubApplicationStatus={submitted:'待審核',approved:'已核准',declined:'未核准',withdrawn:'已撤回',completed:'已結案'};
export const clubApplicationChoices={
  natures:['service:服務活動','meeting:會議','competition:比賽','visit:校外研習與參訪','class:社課','election:選舉、幹訓與交接','other:其他活動'],
  audiences:['teachers:本校教師','students:本校學生','staff:本校職員','external:校外學生','beneficiaries:受服務者','other:其他'],
  sdgs:['消除貧窮','消除飢餓','健康與福祉','優質教育','性別平權','乾淨水及衛生','可負擔的潔淨能源','合適的工作及經濟成長',
    '工業化、創新及基礎建設','減少不平等','永續城鄉','責任消費及生產','氣候行動','保育海洋生態','保育陸域生態','和平、正義及健全制度','多元夥伴關係']
    .map((label,index)=>String(index+1)+':SDG'+(index+1)+'-'+label),
  education:['life:生活教育','lifeskills:生命教育','safety:安全教育','energy:能源教育','arts:藝術教育','civic:民主法治教育',
    'ip:智慧財產權保護理念','gender:性別平等教育','tobacco:菸害防治理念','swimming:提升學生游泳能力','other:其他'],
};
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;
const text=(value)=>typeof value==='string';
const id=(value)=>text(value)&&uuid.test(value);
const instant=(value)=>text(value)&&Number.isFinite(Date.parse(value));
const optionalText=value=>value===null||text(value);
const period=row=>[row.academic_year,row.term].every(value=>value===null||Number.isSafeInteger(value));
const detailsStringKeys=['advisor','advisor_phone','area','campus_location','club_id','co_organizer','coordinator','coordinator_phone',
  'education_other','ends_at','hours','location','offsite_location','organizer','starts_at','title'];
export function validClubApplicationReceipt(value) {
  return Boolean(value&&id(value.id)&&Number.isInteger(value.version)&&value.version>=1&&value.version<=1000000&&
    Object.hasOwn(clubApplicationStatus,value.status));
}
export function validClubOfficerWorkspace(value,userId,view) {
  if(value?.userId!==userId||value.view!==view||!Array.isArray(value.clubs)||value.clubs.length>100||
    !value.clubs.every(club=>club&&id(club.id)&&text(club.name))||!Array.isArray(value.rows)||value.rows.length>200)return false;
  if(view==='profiles')return value.rows.every(row=>row&&id(row.id)&&text(row.name)&&text(row.location)&&
    text(row.advisor)&&period(row)&&['lead_name','lead_email','lead_phone','lead_mobile','review_status','lending_status'].every(key=>optionalText(row[key]))&&Number.isSafeInteger(row.member_count)&&row.member_count>=0);
  if(view==='members'||view==='participation')return value.rows.every(row=>row&&id(row.id)&&
    ['student_number','student_name','club_name'].every(key=>text(row[key]))&&period(row)&&
    (view==='members'?text(row.role_label)&&typeof row.officer==='boolean'&&optionalText(row.contact_email)&&optionalText(row.contact_phone):text(row.title)&&instant(row.starts_at)));
  return value.rows.every(row=>row&&validClubApplicationReceipt(row)&&period(row)&&id(row.club_id)&&
    ['club_name','title','organizer','location','completion_note','review_note'].every(key=>text(row[key]))&&
    instant(row.starts_at)&&instant(row.ends_at)&&typeof row.can_edit==='boolean'&&
    typeof row.hours==='number'&&Number.isFinite(row.hours)&&row.details&&
    detailsStringKeys.every(key=>text(row.details[key]))&&
    Object.keys(clubApplicationChoices).every(key=>Array.isArray(row.details[key])&&row.details[key].every(text)));
}
export function clubOfficerQuestion(question) {
  if(/\bclub (?:event|activity) (?:applications?|proposals?)\b|社團活動申請|社團活動提案/iu.test(question))return 'applications';
  if(/\bclub (?:activity )?(?:closeout|completion)\b|社團.{0,8}成果結案/iu.test(question))return 'completion';
  return null;
}
export function clubOfficerGuide(question,view,signedIn=false) {
  const zh=/[\u3400-\u9fff]/u.test(question);
  const path=clubPath+'/officer/'+view;
  const url=signedIn?path:'/school-affairs/login?next='+encodeURIComponent(path);
  const title=view==='completion'?(zh?'成果結案':'Club activity completion'):(zh?'社團活動申請':'Club activity applications');
  const claim=view==='completion'
    ? (zh?'社團幹部可以在核准活動結束後登錄成果說明。':'Club officers can record a completion summary after an approved activity ends.')
    : (zh?'社團幹部可以在活動申請頁新增及查看自己社團的申請。':'Club officers can create applications and view records for the clubs they manage.');
  return {status:signedIn?'answered':'handoff',answer:'['+title+']('+url+')\n\n'+claim,
    citations:[{chunkId:'directory:club-officer:'+view,title,url,claim,sourceName:'School Affairs',locator:null,effectiveAt:null,reviewedAt:null}],
    suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}
