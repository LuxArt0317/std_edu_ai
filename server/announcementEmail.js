import {announcementDeliveryConfigured} from './announcementEmailDelivery.js';
import {AffairsWorkspaceError} from './affairsWorkspace.js';
import {readFeeRemissionJson} from './feeRemissionContract.js';
import {announcementEmailForeignAnswer,announcementEmailInboxLimit,announcementEmailPath,announcementEmailScope,parseAnnouncementEmail,validAnnouncementEmailChange} from './announcementEmailContract.js';

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
  const {scope,answer,inbox_receipt,...extra}=query;
  if(scope!==announcementEmailScope||Object.keys(extra).length||(answer!==undefined&&!['en','zh'].includes(answer))
    ||(inbox_receipt!==undefined&&(inbox_receipt!=='requested'||answer===undefined)))
    throw new AffairsWorkspaceError('請選擇公告郵件設定。',400);
  const record=parseAnnouncementEmail(await rpc(account,'affairs_read_announcement_email',{}),account.user.id);
  const deliveryConfigured=announcementDeliveryConfigured();
  if(!answer)return {...record,deliveryConfigured};
  const zh=answer==='zh',title=zh?'校園公告 E-MAIL 設定':'Announcement email settings';
  const summary=record.version===0
    ?(zh?'此帳戶尚未儲存校園公告郵件設定，預設為關閉。':'This account has no saved announcement email preference. Email is off by default.')
    :!record.enabled
    ?(zh?'您的校園公告郵件設定為關閉。':'Your announcement email preference is off.')
    :record.active?(zh?'您的校園公告郵件設定為開啟。':'Your announcement email preference is on.')
      :(zh?'您的校園公告郵件設定已開啟，尚未生效。':'Your announcement email preference is enabled and scheduled to activate.');
  const availability=record.enabled&&!deliveryConfigured
    ?(zh?'此網站目前未設定公告郵件寄送。':'Announcement email delivery is currently unavailable.')
    :'';
  const inbox=inbox_receipt==='requested'?(zh?'無法確認公告是否已寄達您的信箱。此設定只顯示已儲存的公告郵件偏好。':announcementEmailInboxLimit):null;
  const activity=[{kind:'announcement-email',label:title,detail:summary,status:'complete'}];
  if(inbox)activity.push({kind:'announcement-email-inbox-receipt',label:zh?'信箱寄達確認':'Inbox delivery confirmation',detail:inbox,status:'unavailable'});
  const activation=record.enabled?(zh?'已儲存的生效時間：':'Saved activation time: ')+record.effectiveAt:null;
  return {status:'answered',answer:[[summary,availability].filter(Boolean).join(' '),activation,inbox,`[${title}](${announcementEmailPath})`].filter(Boolean).join('\n\n'),
    citations:[{chunkId:'account:announcement-email',claim:summary,title,url:announcementEmailPath,sourceName:'My stu.best settings'}],
    suggestedQuestions:[],grounding:{source:'account',webSearched:false},
    activity};
}

export async function saveAnnouncementEmail(account,payload){
  if(!validAnnouncementEmailChange(payload))throw new AffairsWorkspaceError('請檢查公告郵件設定。',400);
  return parseAnnouncementEmail(await rpc(account,'affairs_save_announcement_email',{
    p_enabled:payload.enabled,p_expected_version:payload.expected_version,p_request_id:payload.request_id,
  }),account.user.id,payload);
}

export function announcementEmailGuide(question,intent){
  if(intent==='foreign')return announcementEmailForeignAnswer(question);
  const zh=/[\u3400-\u9fff]/u.test(question),title=zh?'校園公告 E-MAIL 設定':'Announcement email settings';
  const url=intent==='status'?'/school-affairs/login?next='+encodeURIComponent(announcementEmailPath):announcementEmailPath;
  const summary=intent==='status'?(zh?'請先登入以查看您的公告郵件設定。':'Sign in to check your announcement email preference.')
    :(zh?'開啟設定，勾選校園公告郵件後按確定。啟用設定隔日生效。'
      :'Open the settings, select the announcement email checkbox, and confirm. Enabling takes effect the following day.');
  return {status:intent==='status'?'handoff':'answered',answer:summary+'\n\n'+`[${title}](${url})`,
    citations:[{chunkId:'directory:announcement-email',claim:summary,title,url,sourceName:'School Affairs'}],
    suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}
