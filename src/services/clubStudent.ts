import {
  clubFoundationStatuses,clubSearchViews,clubStudentGuide,clubStudentScope,validClubFoundationReceipt,validClubStudentWorkspace,
  type ClubFoundationAction,type ClubStudentView,
} from '../../server/clubStudentContract.js';
import { clubRequest } from './clubServices';
import type { AssistantResponse } from './researchAssistant';

export async function loadStudentClubs(userId:string,view:ClubStudentView,search:string,page:number,signal:AbortSignal) {
  const params=new URLSearchParams({scope:clubStudentScope,view,page:String(page)});
  if(search)params.set('q',search);
  const value=await clubRequest(userId,'/api/affairs-data?'+params,signal);
  if(!validClubStudentWorkspace(value,userId,view,page))throw new Error('無法確認社團資料。');
  return value;
}

export async function saveClubFoundation(userId:string,action:ClubFoundationAction,signal:AbortSignal) {
  const result=await clubRequest(userId,action.kind==='review_club_foundation'?'/api/affairs-manage':'/api/affairs-action',signal,action);
  const status=action.kind==='submit_club_foundation'?'submitted':action.kind==='withdraw_club_foundation'?'withdrawn':action.payload.status;
  if(!validClubFoundationReceipt(result)||result.status!==status||
    (action.kind!=='submit_club_foundation'&&result.id!==action.payload.id)) throw new Error('無法確認社團申請。');
  return result;
}

const safeLabel=(value:string)=>value.replace(/[\s\p{Cc}\p{Cf}]+/gu,' ').replace(/[\\`*_~{}[\]()<>#!|]/gu,'\\$&').trim();
export async function answerStudentClubs(userId:string,question:string,view:Exclude<ClubStudentView,'foundation/review'|'my-attendance'>,
  cancel?:AbortSignal):Promise<AssistantResponse> {
  const guide=clubStudentGuide(question,view,true);
  if(clubSearchViews.includes(view)||(view==='foundation'&&/^(?:how|where|如何|怎麼|在哪)/iu.test(question.trim())&&
    !/\b(?:status|approved|pending|withdrawn|declined)\b|審核|進度|狀態|核准/u.test(question.toLowerCase())))return guide;
  const zh=/[\u3400-\u9fff]/u.test(question);
  const workspace=await loadStudentClubs(userId,view,'',1,cancel??new AbortController().signal);
  const lines=workspace.view==='my-memberships'?workspace.rows.map(row=>safeLabel(row.name)+' · '+safeLabel(row.role_label)
    +(row.active?'':zh?'（已停用）':' (inactive)')):
    workspace.view==='foundation'?workspace.rows.map(row=>safeLabel(row.name)+' · '+(zh?clubFoundationStatuses[row.status]:row.status)):[];
  const items=lines.slice(0,8);
  const more=lines.length>items.length||workspace.hasMore;
  const summary=items.length?items.map(item=>'- '+item).join('\n'):
    zh?'您的帳戶目前沒有此類紀錄。':'Your account has no saved records for this view.';
  const link=guide.citations[0];
  return {...guide,answer:summary+(more?(zh?'\n\n完整清單請開啟下方頁面。':'\n\nOpen the page for the full list.'):'')+
    '\n\n['+link.title+']('+link.url+')',
    citations:[{...link,chunkId:'account:club-student:'+view,claim:zh?'您的校務系統紀錄':'Records saved for your School Affairs account'}],
    grounding:{source:'account',webSearched:false}};
}
