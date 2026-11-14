import { clubCategories,clubPath,clubUuid } from './clubServicesContract.js';

export const clubStudentScope='club-student';
export const clubStudentMenu=[
  ['directory','1-1社團查詢','社團查詢'],
  ['activities','1-2社團活動公告','社團活動公告'],
  ['activity-search','1-3社團活動查詢','社團活動查詢'],
  ['my-attendance','1-4活動參與紀錄','活動參與紀錄'],
  ['my-memberships','1-5社團參與紀錄','社團參與紀錄'],
  ['foundation','1-6成立新社團','成立新社團'],
];
export const clubStudentViews=['directory','activity-search','my-attendance','my-memberships','foundation','foundation/review'];
export const clubFoundationActions={
  submit_club_foundation:'submit',withdraw_club_foundation:'withdraw',review_club_foundation:'review',
};
export const clubFoundationStatuses={submitted:'待審核',approved:'已核准',declined:'未核准',withdrawn:'已撤回'};
export const clubSearchViews=['directory','activity-search'];

const text=value=>typeof value==='string';
const id=value=>text(value)&&clubUuid.test(value);
const instant=value=>text(value)&&Number.isFinite(Date.parse(value));
const period=row=>(row.academic_year===null||Number.isInteger(row.academic_year))&&(row.term===null||Number.isInteger(row.term));

export function isClubStudentView(value) {
  return clubStudentViews.includes(value);
}
export function validClubFoundationReceipt(row) {
  return Boolean(row&&id(row.id)&&Object.hasOwn(clubFoundationStatuses,row.status)&&
    row.version===(row.status==='submitted'?1:2));
}
export function validClubStudentWorkspace(value,userId,view,page) {
  if(!value||value.userId!==userId||value.view!==view||value.page!==page||
    typeof value.eligible!=='boolean'||typeof value.hasMore!=='boolean'||
    !Array.isArray(value.rows)||value.rows.length>25||(value.hasMore&&value.rows.length!==25))return false;
  return value.rows.every(row=>{
    if(!row||!id(row.id))return false;
    switch(view){
      case 'directory': return ['name','location','advisor'].every(key=>text(row[key]));
      case 'activity-search': return ['title','club_name','location','description'].every(key=>text(row[key]))&&
        instant(row.starts_at)&&instant(row.ends_at)&&Object.hasOwn(clubCategories,row.category);
      case 'my-attendance': return ['title','club_name','location'].every(key=>text(row[key]))&&
        instant(row.starts_at)&&instant(row.recorded_at)&&period(row);
      case 'my-memberships': return text(row.name)&&text(row.role_label)&&typeof row.active==='boolean'&&period(row);
      default: return validClubFoundationReceipt(row)&&['name','description','review_note'].every(key=>text(row[key]))&&
        instant(row.updated_at)&&(row.status==='approved'?id(row.club_id):row.club_id===null)&&
        (row.student_name===null||(view==='foundation/review'&&text(row.student_name)));
    }
  });
}

export function clubStudentQuestion(question) {
  if(/\b(?:start|found|register|create|form) (?:a |my )?(?:new |student )?club\b|\b(?:new club|club foundation) (?:application|proposal|status)\b|成立新社團|成立社團|創立社團|(?:新社團|社團成立).{0,8}(?:申請|審核)/iu.test(question))return 'foundation';
  if(/\b(?:club|student club) (?:attendance|participation)(?: history| records?)?\b|活動參與紀錄/iu.test(question))return 'my-attendance';
  if(/\b(?:my |student )?club memberships?\b|社團參與紀錄|我.{0,4}(?:參加|加入).{0,4}社團/iu.test(question))return 'my-memberships';
  if(/\b(?:search|find|look up) (?:past |published )?club (?:activities|events)\b|社團活動查詢/iu.test(question))return 'activity-search';
  if(/\b(?:club directory|club lookup|list (?:student )?clubs|find (?:a |student )?clubs?)\b|社團查詢/iu.test(question))return 'directory';
  return null;
}
const guidance={
  directory:['社團查詢','Club directory','搜尋已開放的社團。','Search active clubs.'],
  'activity-search':['社團活動查詢','Club activity search','依活動或社團名稱搜尋已發布的活動。','Search published activities by activity or club name.'],
  'my-attendance':['活動參與紀錄','My club activity attendance','登入後查看登記在您帳戶下的活動。','Sign in to see activities recorded for your account.'],
  'my-memberships':['社團參與紀錄','My club memberships','登入後查看您參加的社團與角色。','Sign in to see your club memberships and roles.'],
  foundation:['成立新社團','Start a new club','送出申請後，可在同一頁查看審核結果。','Submit a proposal and check its review status on the same page.'],
};
export function clubStudentGuide(question,view,signedIn=false) {
  const zh=/[\u3400-\u9fff]/u.test(question);
  const path=clubPath+'/'+view;
  const url=signedIn?path:'/school-affairs/login?next='+encodeURIComponent(path);
  const [titleZh,titleEn,claimZh,claimEn]=guidance[view];
  const title=zh?titleZh:titleEn;
  const claim=zh?claimZh:claimEn;
  return {status:signedIn?'answered':'handoff',answer:'['+title+']('+url+')\n\n'+claim,
    citations:[{chunkId:'directory:club-student:'+view,title,url,claim,sourceName:'School Affairs',locator:null,effectiveAt:null,reviewedAt:null}],
    suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}
