import {randomUUID} from 'node:crypto';
import {readClubEquipmentCancellationContext} from './accountClubEquipmentAnswer.js';
import {readFacilityRepairCancellationContext} from './accountFacilityRepairEvidence.js';
import {repairId,repairPaths} from '../src/features/public/affairs/facilityRepair.js';
import {readCounselingCancellationContext} from './accountCounselingEvidence.js';
import {counselingPath,counselingAppointmentsPath} from './counselingContract.js';
import {loadOwnAffairsActionContext,loadOwnLearningSupportWithdrawalContext} from './affairsWorkspace.js';
import {learningSupportPath} from '../src/features/public/affairs/studentServices.js';
import {clubEquipmentPath} from './clubEquipmentIntent.js';
import {clubUuid} from './clubServicesContract.js';
import {prepareAccountAction} from './accountAssistantActions.js';
import {runAnswerVerification} from './answerVerification.js';

export async function answerRequestedAffairsAction({account,question,selection,route,deadline,onProgress}){
  const requestId=randomUUID();
  const zh=/[\u3400-\u9fff]/u.test(question);
  const say=(en,cn)=>zh?cn:en;
  const submitLearningSupport=selection.kind==='submit_learning_support';
  const citations=submitLearningSupport?[{chunkId:'directory:learning-support',
    title:say('Learning support requests','學習輔導申請'),url:learningSupportPath,sourceName:'School Affairs'}]:[];
  const base={citations,suggestedQuestions:[],grounding:{source:'account',webSearched:false}};
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
  if(selection.kind==='counseling_cancel'){
    const page=new URL(route,'https://stu.best');
    const path=page.pathname.replace(/\/$/u,'');
    const counselingRoute=path===counselingPath||path.startsWith(counselingPath+'/');
    if(counselingRoute&&([counselingPath,counselingAppointmentsPath,counselingPath+'/consent'].every(candidate=>candidate!==path)||page.search)){
      return {...base,status:'clarification',answer:say('Open [My appointments]('+counselingAppointmentsPath+') to cancel a saved appointment.',
        '請從[我的預約紀錄]('+counselingAppointmentsPath+')選擇要取消的預約。')};
    }
  }
  let repairReportId;
  if(selection.kind==='cancel_facility_repair'&&!selection.ambiguous){
    const page=new URL(route,'https://stu.best'),path=page.pathname.replace(/\/$/u,'');
    const historyDetail=path.startsWith(repairPaths.history+'/');
    const routeId=historyDetail?path.slice(repairPaths.history.length+1):'';
    const onRepairRoute=path===repairPaths.report||path.startsWith(repairPaths.report+'/');
    const invalidRoute=page.origin!=='https://stu.best'||path===repairPaths.manage||path.startsWith(repairPaths.manage+'/')
      ||onRepairRoute&&Boolean(page.search)||historyDetail&&!repairId(routeId);
    if(!invalidRoute&&!(selection.id&&routeId&&selection.id!==routeId))
      repairReportId=selection.id||routeId;
    if(!repairId(repairReportId))return {...base,status:'clarification',answer:say(
      'Open the exact report in [My repair reports]('+repairPaths.history+') or provide its full report ID.',
      '請從[我的報修紀錄]('+repairPaths.history+')開啟該筆報修，或提供完整報修編號。')};
  }
  if((submitLearningSupport||selection.kind==='withdraw_learning_support')&&!selection.ambiguous){
    const page=new URL(route,'https://stu.best'),path=page.pathname.replace(/\/$/u,'');
    if(path.startsWith(learningSupportPath+'/')||path===learningSupportPath&&page.search)return {
      ...base,status:'clarification',answer:submitLearningSupport?say(
        'Open [My learning support requests]('+learningSupportPath+') to submit a request for yourself.',
        '請從[我的學習輔導申請]('+learningSupportPath+')送出自己的申請。'):say(
        'Open [My learning support requests]('+learningSupportPath+') to withdraw a saved request.',
        '請從[我的學習輔導申請]('+learningSupportPath+')撤回已儲存的申請。'),
    };
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
    const pending=submitLearningSupport
      ?say('Review the topic and details below. Confirm to submit your request for review on stu.best.','請檢查下方的主題與輔導需求，確認後即可送交 stu.best 站內審查。')
      :selection.kind==='cancel_club_equipment'
      ?say('Review the club equipment request below. Confirm to cancel it.','請檢查下方的社團器材借用申請，確認後即可取消。')
      :selection.kind==='counseling_cancel'
      ?say('Review the saved appointment below. Confirm to cancel it.','請檢查下方已儲存的預約，確認後即可取消。')
      :selection.kind==='cancel_facility_repair'
      ?say('Review your saved repair report below. Confirm to cancel it.','請檢查下方的已儲存報修。確認後即可取消。')
      :selection.kind==='withdraw_learning_support'
      ?say('Review the saved learning support request below. Confirm to withdraw it.','請檢查下方已儲存的學習輔導申請，確認後即可撤回。')
      :selection.kind==='set_assignment_status'
      ?say('Confirm to update your stu.best personal tracker. You can submit coursework separately on its assignment page.','確認後會更新你的 stu.best 個人作業追蹤。若要繳交作業，請至作業頁面。')
      :say('Review the proposed change below. I’ll apply it to your stu.best account after you confirm.','請確認下方的變更。確認後才會套用至你的 stu.best 帳戶。');
    return {...base,status:'answered',answer:pending,proposedAction:prepared.action};
  };
  if(selection.ambiguous)return {...base,status:'clarification',answer:prepareAccountAction(question,{}).clarification,activity};
  const readLabels={profile:'School Affairs account',tasks:'Open task',assignments:'Personal assignment tracker',dtm:'Personal Moodle course',clubEquipment:'Club equipment request',counselingAppointments:'Saved appointment',facilityRepairs:'Saved repair report',learningSupport:'Saved learning support request'};
  const read=async attempt=>{
    const kind='action-context:'+attempt;
    if(submitLearningSupport){
      progress({kind,label:say('Checked your submission details','已核對申請內容'),
        detail:say('Used the topic and details in this message.','使用這則訊息中的主題和輔導需求。'),status:'complete'});
      return [{id:'request:learning-support-submission',content:JSON.stringify({topic:selection.title,details:selection.details})}];
    }
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
      }else if(selection.kind==='counseling_cancel'){
        onRead('counselingAppointments','running');
        const counseling=await readCounselingCancellationContext(account,selection,deadline).catch(error=>{
          onRead('counselingAppointments','unavailable');
          throw error;
        });
        onRead('counselingAppointments','complete');
        context={counseling};
      }else if(selection.kind==='cancel_facility_repair'){
        onRead('facilityRepairs','running');
        const facilityRepair=await readFacilityRepairCancellationContext(account,repairReportId,deadline).catch(error=>{
          onRead('facilityRepairs','unavailable');
          throw error;
        });
        onRead('facilityRepairs','complete');
        context={facilityRepair};
      }else if(selection.kind==='withdraw_learning_support'){
        onRead('learningSupport','running');
        const learningSupport=await loadOwnLearningSupportWithdrawalContext(account,selection,deadline).catch(error=>{
          onRead('learningSupport','unavailable');
          throw error;
        });
        onRead('learningSupport','complete');
        context={learningSupport};
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
      const matchesInput=!submitLearningSupport||!candidate.proposedAction||
        JSON.stringify(candidate.proposedAction.payload)===evidence[0].content;
      return {ok:matchesInput&&candidate.status===expected.status&&candidate.answer===expected.answer
        &&JSON.stringify(candidate.proposedAction)===JSON.stringify(expected.proposedAction)};
    },
    repair:async ({evidence})=>evidence.length?format(evidence):initial,
  });
  return {...result,activity,...(result.status==='abstained'?{
    answer:submitLearningSupport?say('I couldn’t check the submitted topic and details. Please try again.','目前無法查核申請主題和輔導需求，請稍後重試。')
      :say('I couldn’t verify the saved record for this change. Please try again before confirming it.','目前無法查核此變更所需的已儲存紀錄，請稍後重試。'),
  }:{})};
}
