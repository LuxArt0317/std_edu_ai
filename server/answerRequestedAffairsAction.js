import {randomUUID} from 'node:crypto';
import {readClubEquipmentCancellationContext} from './accountClubEquipmentAnswer.js';
import {loadOwnAffairsActionContext} from './affairsWorkspace.js';
import {clubEquipmentPath} from './clubEquipmentIntent.js';
import {clubUuid} from './clubServicesContract.js';
import {prepareAccountAction} from './accountAssistantActions.js';
import {runAnswerVerification} from './answerVerification.js';

export async function answerRequestedAffairsAction({account,question,selection,route,deadline,onProgress}){
  const requestId=randomUUID();
  const zh=/[\u3400-\u9fff]/u.test(question);
  const say=(en,cn)=>zh?cn:en;
  const base={citations:[],suggestedQuestions:[],grounding:{source:'account',webSearched:false}};
  let equipmentId;
  if(selection.kind==='cancel_club_equipment'){
    const page=new URL(route,'https://stu.best');
    const path=page.pathname.replace(/\/$/u,'');
    const edit=page.searchParams.getAll('edit');
    const form=path===clubEquipmentPath+'/new';
    const invalidSelection=(path===clubEquipmentPath||form)
      &&([...page.searchParams.keys()].some(key=>key!=='edit')||edit.length>1
        ||edit.length===1&&(!form||!clubUuid.test(edit[0])));
    if(path===clubEquipmentPath+'/review'||invalidSelection){
      return {...base,status:'clarification',answer:say('Open the request from My club equipment records before asking to cancel it.',
        '請先從我的社團器材借用紀錄開啟要取消的申請。')};
    }
    if(form)equipmentId=edit[0]?.toLowerCase();
  }
  const activity=[];
  const progress=step=>{
    const index=activity.findIndex(item=>item.kind===step.kind);
    if(index<0)activity.push(step);
    else activity[index]=step;
    try{onProgress?.(step);}catch{/* Streaming can be disconnected. */}
  };
  const format=evidence=>{
    const context=JSON.parse(evidence[0].content);
    if(context.profileFound===false)return {...base,status:'clarification',
      answer:say('Open School Affairs to finish setting up your account, then ask again.','請先在校務系統完成帳戶設定後再試。')};
    const prepared=prepareAccountAction(question,context,{requestId});
    if(!prepared.action)return {...base,status:'clarification',answer:prepared.clarification};
    const pending=selection.kind==='cancel_club_equipment'
      ?say('Review the club equipment request below. Confirm to cancel it.','請檢查下方的社團器材借用申請，確認後即可取消。')
      :selection.kind==='set_assignment_status'
      ?say('Confirm to update your stu.best personal tracker. You can submit coursework separately on its assignment page.','確認後會更新你的 stu.best 個人作業追蹤。若要繳交作業，請至作業頁面。')
      :say('Review the proposed change below. I’ll apply it to your stu.best account after you confirm.','請確認下方的變更。確認後才會套用至你的 stu.best 帳戶。');
    return {...base,status:'answered',answer:pending,proposedAction:prepared.action};
  };
  if(selection.ambiguous)return {...base,status:'clarification',answer:prepareAccountAction(question,{}).clarification,activity};
  const readLabels={profile:'School Affairs account',tasks:'Open task',assignments:'Personal assignment tracker',dtm:'Personal Moodle course',clubEquipment:'Club equipment request'};
  const read=async attempt=>{
    const kind='action-context:'+attempt;
    try{
      const onRead=(tool,status)=>progress({
        kind:`account-read:${tool}:${attempt}`,label:readLabels[tool],status,
        detail:status==='running'?'Looking up the requested action context.':status==='complete'?'The selected lookup returned a response.':'The selected lookup failed.',
      });
      let context;
      if(selection.kind==='cancel_club_equipment'){
        onRead('clubEquipment','running');
        const clubEquipment=await readClubEquipmentCancellationContext(account,deadline).catch(error=>{
          onRead('clubEquipment','unavailable');
          throw error;
        });
        onRead('clubEquipment','complete');
        if(equipmentId)clubEquipment.rows=clubEquipment.rows.filter(row=>row.id===equipmentId);
        context={clubEquipment};
      }else{
        context=await loadOwnAffairsActionContext(account,selection,{deadline,onRead});
      }
      progress({kind,label:'Checked the requested action',detail:'Checked the signed-in account and any required saved target.',status:'complete'});
      return [{id:'account:action-context',content:JSON.stringify(context)}];
    }catch{
      progress({kind,label:'Action details unavailable',detail:'The requested change could not be checked.',status:'unavailable'});
      return [];
    }
  };
  const first=await read(1);
  const initial=first.length?format(first):{...base,status:'abstained',answer:''};
  const result=await runAnswerVerification({
    question,initialAnswer:initial,deadline,onProgress:progress,
    loadEvidence:async ({attempt})=>attempt===1?first:read(attempt),
    verify:async ({candidate,evidence})=>{
      if(!evidence.length)return {ok:false,reason:'evidence_unavailable'};
      const expected=format(evidence);
      return {ok:candidate.status===expected.status&&candidate.answer===expected.answer
        &&JSON.stringify(candidate.proposedAction)===JSON.stringify(expected.proposedAction)};
    },
    repair:async ({evidence})=>evidence.length?format(evidence):initial,
  });
  return {...result,activity,...(result.status==='abstained'?{
    answer:say('I couldn’t verify the saved record for this change. Please try again before confirming it.','目前無法查核此變更所需的已儲存紀錄，請稍後重試。'),
  }:{})};
}
