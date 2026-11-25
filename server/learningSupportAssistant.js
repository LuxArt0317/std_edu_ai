import {isDeepStrictEqual} from 'node:util';
import {runAnswerVerification} from './answerVerification.js';
import {readLearningSupport} from './learningSupport.js';
import {learningSupportPath as path} from '../src/features/public/affairs/studentServices.js';

const sourceId='account:learningSupport';
const statuses={submitted:['Submitted','待審查'],in_review:['In site review','站內審查中'],
  reviewed:['Site review complete','站內審查完成'],withdrawn:['Withdrawn','已撤回']};
const formatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const withheld={status:'abstained',answer:'',citations:[]};

export function learningSupportGuest(selection){
  const title=selection.zh?'登入後查看學習輔導申請':'Sign in to view your learning support requests';
  const url='/school-affairs/login?next='+encodeURIComponent(path);
  return {status:'handoff',answer:'['+title+']('+url+')',
    citations:[{chunkId:'directory:learning-support',title,url}],suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}

export async function answerLearningSupport({account,selection,question,deadline,onProgress}){
  const {kind,zh}=selection,t=(en,cn)=>zh?cn:en;
  const activity=[],emit=step=>{activity.push(step);onProgress?.(step);};
  const canonical=evidence=>{
    if(!evidence||evidence.id!==sourceId||evidence.url!==path)return null;
    const {total,latest,updatedAt}=JSON.parse(evidence.content);
    const count=t('Saved learning support requests','已儲存學習輔導申請筆數')+': '+total+'.';
    const result=kind==='count'?count:!total?t('You have no saved learning support requests.','您尚未儲存學習輔導申請。'):
      t('Most recently updated request','最近更新的申請')+': '+statuses[latest][Number(zh)]+' · '+formatter.format(new Date(updatedAt))+' '+t('(Taipei)','（台北）')+'.'
        +(total>1?' '+count:'');
    const title=t('Open learning support requests','開啟學習輔導申請');
    return {status:'answered',answer:result+'\n\n['+title+']('+path+')',
      citations:[{chunkId:sourceId,title,url:path,claim:t('Saved site request status','站內申請狀態'),sourceName:'School Affairs'}]};
  };
  const read=async attempt=>{
    const step={kind:'account-read:learningSupport:'+attempt,label:t('Checked learning support requests','核對學習輔導申請')};
    emit({...step,status:'running',detail:t('Reading your saved requests.','讀取本人的站內申請。')});
    const view=await readLearningSupport({...account,requestDeadline:deadline},{view:'mine',page:1}).catch(()=>null);
    emit({...step,status:view?'complete':'unavailable',detail:view
      ?t('Verified the same account and saved result.','已核對本人帳戶與儲存結果。')
      :t('The saved requests could not be checked.','暫時無法核對已儲存申請。')});
    if(!view)return [];
    const row=view.rows[0];
    return [{id:sourceId,url:path,content:JSON.stringify({total:view.total,...(row&&kind==='status'?{latest:row.status,updatedAt:row.updatedAt}:{})})}];
  };
  const first=await read(1);
  const result=await runAnswerVerification({question,deadline,onProgress:emit,initialAnswer:canonical(first[0])??withheld,
    loadEvidence:async({attempt})=>attempt===1?first:read(attempt),
    verify:async({candidate,evidence})=>{
      const current=evidence.length===1?canonical(evidence[0]):null;
      return current&&isDeepStrictEqual(current,candidate)?{ok:true}:{ok:false,reason:'evidence_unavailable'};
    },
    repair:async({evidence})=>(evidence.length===1?canonical(evidence[0]):null)??withheld,
  });
  return {...result,activity:[...new Map(activity.map(step=>[step.kind,step])).values()],suggestedQuestions:[],
    grounding:{source:'account',webSearched:false,degraded:result.verification?.status!=='verified'}};
}
