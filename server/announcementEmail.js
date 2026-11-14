import {announcementDeliveryConfigured} from './announcementEmailDelivery.js';
import {AffairsWorkspaceError} from './affairsWorkspace.js';
import {readFeeRemissionJson} from './feeRemissionContract.js';
import {announcementEmailPath,announcementEmailScope,parseAnnouncementEmail,validAnnouncementEmailChange} from './announcementEmailContract.js';

async function rpc(account,method,body){
  const timeout=Math.min(8000,(account.requestDeadline??Date.now()+8000)-Date.now());
  if(timeout<=0)throw new AffairsWorkspaceError('校園公告設定暫時無法載入。');
  const response=await fetch(account.url+'/rest/v1/rpc/'+method,{method:'POST',redirect:'error',signal:AbortSignal.timeout(timeout),
    headers:{apikey:account.key,Authorization:'Bearer '+account.token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok){
    void response.body?.cancel().catch(()=>{});
    const status=[400,409].includes(response.status)?response.status:[401,403].includes(response.status)?403:503;
    throw new AffairsWorkspaceError(status===409?'設定已更新，請重新載入。':'無法處理公告郵件設定。',status);
  }
  return readFeeRemissionJson(response);
}

export async function readAnnouncementEmail(account,query){
  const {scope,answer,...extra}=query;
  if(scope!==announcementEmailScope||Object.keys(extra).length||(answer!==undefined&&!['en','zh'].includes(answer)))
    throw new AffairsWorkspaceError('請選擇公告郵件設定。',400);
  const record=parseAnnouncementEmail(await rpc(account,'affairs_read_announcement_email',{}),account.user.id);
  const deliveryConfigured=announcementDeliveryConfigured();
  if(!answer)return {...record,deliveryConfigured};
  const zh=answer==='zh',title=zh?'校園公告 E-MAIL 設定':'Announcement email settings';
  const summary=!record.enabled
    ?(zh?'您的校園公告郵件設定為關閉。':'Your announcement email preference is off.')
    :record.active?(zh?'您的校園公告郵件設定為開啟。':'Your announcement email preference is on.')
      :(zh?'您的校園公告郵件設定已儲存，將於隔日生效。':'Your announcement email preference is saved and becomes active the following day.');
  const availability=record.enabled&&!deliveryConfigured
    ?(zh?'此網站目前未設定公告郵件寄送。':'Announcement email delivery is currently unavailable.')
    :'';
  return {status:'answered',answer:[summary,availability].filter(Boolean).join(' ')+'\n\n'+`[${title}](${announcementEmailPath})`,
    citations:[{chunkId:'account:announcement-email',claim:summary,title,url:announcementEmailPath,sourceName:'My stu.best settings'}],
    suggestedQuestions:[],grounding:{source:'account',webSearched:false},
    activity:[{kind:'announcement-email',label:title,detail:summary,status:'complete'}]};
}

export async function saveAnnouncementEmail(account,payload){
  if(!validAnnouncementEmailChange(payload))throw new AffairsWorkspaceError('請檢查公告郵件設定。',400);
  return parseAnnouncementEmail(await rpc(account,'affairs_save_announcement_email',{
    p_enabled:payload.enabled,p_expected_version:payload.expected_version,p_request_id:payload.request_id,
  }),account.user.id,payload);
}

export function announcementEmailGuide(question,intent){
  const zh=/[\u3400-\u9fff]/u.test(question),title=zh?'校園公告 E-MAIL 設定':'Announcement email settings';
  const url=intent==='status'?'/school-affairs/login?next='+encodeURIComponent(announcementEmailPath):announcementEmailPath;
  const summary=intent==='status'?(zh?'請先登入以查看您的公告郵件設定。':'Sign in to check your announcement email preference.')
    :(zh?'開啟設定，勾選校園公告郵件後按確定。啟用設定隔日生效。'
      :'Open the settings, select the announcement email checkbox, and confirm. Enabling takes effect the following day.');
  return {status:intent==='status'?'handoff':'answered',answer:summary+'\n\n'+`[${title}](${url})`,
    citations:[{chunkId:'directory:announcement-email',claim:summary,title,url,sourceName:'School Affairs'}],
    suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}
