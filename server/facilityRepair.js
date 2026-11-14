import {AffairsWorkspaceError} from './affairsWorkspace.js';
import {readFeeRemissionJson} from './feeRemissionContract.js';
import {repairId,repairPaths,repairStatuses} from '../src/features/public/affairs/facilityRepair.js';

const invalid=()=>new AffairsWorkspaceError('請檢查報修資料。',400);
const statusKnown=value=>typeof value==='string'&&Object.hasOwn(repairStatuses,value);
const text=(value,max,allowEmpty=false)=>typeof value==='string'&&(allowEmpty||Boolean(value.trim()))&&[...value].length<=max;

async function rpc(account,operation,body){
  const remaining=Math.min(10000,(account.requestDeadline??Date.now()+10000)-Date.now());
  if(remaining<=0)throw new AffairsWorkspaceError('報修資料暫時無法載入。');
  const response=await fetch(account.url+'/rest/v1/rpc/'+operation,{method:'POST',redirect:'error',signal:AbortSignal.timeout(remaining),
    headers:{apikey:account.key,Authorization:'Bearer '+account.token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok){
    void response.body?.cancel().catch(()=>{});
    const status=response.status===401?403:[400,403,404,409].includes(response.status)?response.status:503;
    const messages={400:'請檢查報修資料。',403:'您的帳戶無法使用此操作。',404:'找不到報修紀錄。',409:'報修紀錄已更新。請重新載入。'};
    throw new AffairsWorkspaceError(messages[status]??'報修服務暫時無法使用。',status);
  }
  return readFeeRemissionJson(response);
}

export async function readFacilityRepairs(account,query){
  const {scope,view,id,page='0',status='',answer,...extra}=query;
  if(scope!=='facility-repairs'||!['mine','manage'].includes(view)||Object.keys(extra).length||
    (id!==undefined&&!repairId(id))||typeof page!=='string'||!/^\d{1,3}$/.test(page)||
    (status!==''&&!statusKnown(status))||(id&&(status||Number(page)))||
    (answer!==undefined&&(!['en','zh'].includes(answer)||view!=='mine'||status||Number(page))))throw invalid();
  const result=await rpc(account,'affairs_read_facility_repairs',{p_manage:view==='manage',p_id:id??null,p_page:Number(page),p_status:status});
  const owns=row=>repairId(row?.id)&&statusKnown(row.status)&&(view==='manage'||row.user_id===account.user.id);
  if(result?.userId!==account.user.id||(id?result.detail?.id!==id||!owns(result.detail)||!Array.isArray(result.events):
    !Array.isArray(result.rows)||result.rows.length>25||!result.rows.every(owns)||!Number.isSafeInteger(result.total)||
    result.total<0||result.page!==Number(page)||result.pageSize!==25))throw new AffairsWorkspaceError('無法確認報修紀錄。');
  if(answer===undefined)return result;
  const zh=answer==='zh';
  const rows=id?[result.detail]:result.rows.slice(0,10);
  const lines=rows.map(row=>{
    const date=new Intl.DateTimeFormat(zh?'zh-TW':'en-CA',{dateStyle:'medium',timeZone:'Asia/Taipei'}).format(new Date(row.created_at));
    return `- ${row.id.slice(0,8).toUpperCase()} · ${date} · ${repairStatuses[row.status][zh?0:1]} · [${zh?'查看報修':'View report'}](${repairPaths.history}/${row.id})`;
  });
  const summary=lines.length?(zh?'以下是您在 stu.best 的報修狀態。':'Here are your stu.best repair statuses.'):
    (zh?'您沒有已儲存的報修紀錄。':'You have no saved repair reports on stu.best.');
  const title=zh?'我的報修紀錄':'My repair reports';
  const url=id?repairPaths.history+'/'+id:repairPaths.history;
  return {status:'answered',answer:[summary,lines.join('\n'),`[${title}](${url})`].filter(Boolean).join('\n\n'),
    citations:[{chunkId:'account:facility-repairs',title,claim:summary,sourceName:'My stu.best records',url,locator:null,effectiveAt:null,reviewedAt:null}],
    suggestedQuestions:[],grounding:{source:'account',webSearched:false},
    activity:[{kind:'facility-repairs',label:'Checked your repair reports',detail:summary,status:'complete'}]};
}

export async function changeFacilityRepair(account,action,payload){
  const keys=action==='submit_facility_repair'?['request_id','building','location','item','description','confirmed']:
    action==='cancel_facility_repair'?['request_id','id','version']:
      action==='review_facility_repair'?['request_id','id','version','status','note']:[];
  if(!keys.length||!payload||typeof payload!=='object'||Array.isArray(payload)||
    Object.keys(payload).length!==keys.length||!keys.every(key=>Object.hasOwn(payload,key))||!repairId(payload.request_id))throw invalid();
  if(action==='submit_facility_repair'){
    if(payload.confirmed!==true||!text(payload.building,100)||!text(payload.location,120)||!text(payload.item,100)||!text(payload.description,1000))throw invalid();
  }else if(!repairId(payload.id)||!Number.isInteger(payload.version)||payload.version<1||payload.version>10000||
    (action==='review_facility_repair'&&(!['in_progress','resolved'].includes(payload.status)||!text(payload.note,600,true))))throw invalid();
  const result=await rpc(account,'affairs_change_facility_repair',{p_action:action,p_payload:payload});
  const expected=action==='submit_facility_repair'?'submitted':action==='cancel_facility_repair'?'cancelled':payload.status;
  if(!repairId(result?.id)||result.status!==expected||(action==='submit_facility_repair'?result.version!==1:
    result.id!==payload.id||result.version!==payload.version+1))throw new AffairsWorkspaceError('無法確認報修結果。');
  return result;
}

export function answerRepairGuide(question,view){
  const zh=/[\u3400-\u9fff]/u.test(question);
  const title=zh?'線上報修':'Facilities repair';
  const href=view==='history'?'/school-affairs/login?next='+encodeURIComponent(repairPaths.history):repairPaths.report;
  const answer=view==='history'?(zh?'登入以查詢自己的站內報修。':'Sign in to view your own stu.best repair reports.'):
    view==='network'?(zh?'校方宿網報修服務為上班日 08:00–17:00，請撥 07-615-8000 分機 2420。':'For university residence-network repairs, call 07-615-8000 ext. 2420 during office hours (08:00–17:00).'):
    (zh?'請填寫棟別、地點、項目和故障說明。送出後可查詢站內處理狀態。':'Enter the building, location, item, and problem. After submitting, you can track the stu.best report.');
  return {status:view==='history'?'handoff':'answered',answer:`${answer}\n\n[${title}](${href})`,
    citations:view==='network'?[{chunkId:'facility-repairs:network',title:zh?'校方修繕公告':'University repair noticeboard',
      sourceName:'STU Facilities',url:'https://info.stu.edu.tw/swd/all/Rpg/indexContent.asp',locator:null,effectiveAt:null,reviewedAt:null}]:[],
    suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}
