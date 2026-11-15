import {isDeepStrictEqual} from 'node:util';
import {loadOwnAffairsCharges,requestAffairsRpc} from './affairsWorkspace.js';
import {runAnswerVerification} from './answerVerification.js';
import {accountEvidence} from './answerVerificationAccount.js';
import {clubEquipmentPath,clubEquipmentPlan} from './clubEquipmentIntent.js';
import {clubDate,clubUuid,validClubWorkspace} from './clubServicesContract.js';
import {readFeeRemissionJson} from './feeRemissionContract.js';
import {formatSelectedChargeEvidence,selectedChargeAnswerLimits} from './selectedChargeEvidenceAnswer.js';

const sourceId='account:clubEquipment';
const sourceLimit=100;
const visibleLimit=8;
const maxTransportBytes=768*1024;
const labels={submitted:['Awaiting review','待審核'],approved:['Approved','已核准'],declined:['Declined','未核准'],
  cancelled:['Cancelled','已取消'],returned:['Returned','已歸還']};
const unavailable=()=>new Error('Club equipment evidence is unavailable.');
const displayLabel=value=>value.replace(/[\s\p{Cc}\p{Cf}]+/gu,' ').trim();
const workspaceKeys=['userId','view','manager','today','student','clubs','equipment','rows'];
const rowKeys=['id','club_id','club_name','phone','student_number','student_name','pickup_on','return_on','status',
  'version','purpose','other_purpose','collateral','updated_at','items'];
const exact=(value,keys)=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const shorten=(value,limit)=>{const chars=[...value];return chars.length<=limit?value:chars.slice(0,limit-1).join('')+'…';};
const markdown=value=>value.replace(/[\\`*_~{}[\]()<>#!|]/gu,'\\$&');

function actualDate(value){
  if(!clubDate.test(value))return false;
  const day=new Date(value+'T00:00:00Z');
  return Number.isFinite(day.getTime())&&day.toISOString().slice(0,10)===value;
}

function timestamp(value){
  const match=/^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.(\d{1,6}))?(?:Z|[+-]\d\d:\d\d)$/u.exec(value);
  const parsed=Date.parse(value);
  if(!match||!Number.isFinite(parsed)||!actualDate(match[1]))throw unavailable();
  return BigInt(parsed)*1000n+BigInt((match[2]??'').padEnd(6,'0').slice(3));
}

async function readEquipment(account,selection,deadline){
  if(!clubUuid.test(account.user.id)||!Number.isFinite(deadline))throw unavailable();
  const response=await requestAffairsRpc({...account,requestDeadline:Math.min(deadline,Date.now()+6500)},'affairs_read_club_services',
    {p_view:'equipment',p_month:null},{readJson:incoming=>readFeeRemissionJson(incoming,maxTransportBytes),errorMessages:{}});
  if(Date.now()>=deadline||!validClubWorkspace(response,account.user.id,'equipment')||!exact(response,workspaceKeys))throw unavailable();
  const seen=new Set();
  let previous;
  for(const row of response.rows){
    const updated=timestamp(row.updated_at);
    if(!exact(row,rowKeys)||seen.has(row.id)||!actualDate(row.pickup_on)||!actualDate(row.return_on)||row.pickup_on>row.return_on
      ||!displayLabel(row.club_name)||[...row.club_name].length>120||!row.items.length
      ||new Set(row.items.map(item=>item.id)).size!==row.items.length
      ||row.items.some(item=>!exact(item,['id','label'])||!displayLabel(item.label)||[...item.label].length>160)
      ||previous&&(updated>previous.updated||updated===previous.updated&&row.id<=previous.id))throw unavailable();
    seen.add(row.id);
    previous={id:row.id,updated};
  }
  const matching=response.rows.filter(row=>(!selection.id||row.id===selection.id)&&(!selection.status||row.status===selection.status));
  const fields=new Set(selection.fields);
  const rows=selection.countOnly?[]:matching.slice(0,selection.latest?1:visibleLimit).map(row=>({club:displayLabel(row.club_name),
    ...(fields.has('status')?{status:row.status}:{}),...(fields.has('pickup')?{pickup:row.pickup_on}:{}),
    ...(fields.has('return')?{return:row.return_on}:{}),...(fields.has('items')?{items:row.items.map(item=>displayLabel(item.label)).join(' / ')}:{})}));
  return {id:sourceId,url:clubEquipmentPath,content:JSON.stringify({rows,matched:matching.length,capped:response.rows.length===sourceLimit,checkedAt:new Date().toISOString()})};
}

function equipmentReply(question,selection,evidence){
  if(evidence.id!==sourceId||evidence.url!==clubEquipmentPath)throw unavailable();
  const {rows,matched,capped,checkedAt}=JSON.parse(evidence.content);
  const zh=/\p{Script=Han}/u.test(question),say=(en,cn)=>zh?cn:en;
  const title=say('My club equipment requests','我的社團器材借用紀錄');
  const fieldLabels={status:say('Saved status','簽核狀態'),pickup:say('Pickup date','領取日期'),
    return:say('Scheduled return date','預計歸還日期'),items:say('Equipment','借用器材')};
  const columns=[say('Club','社團名稱'),...selection.fields.map(field=>fieldLabels[field])];
  const cells=rows.map(row=>[row.club,...selection.fields.map(field=>field==='status'?labels[row.status][zh?1:0]:row[field])]);
  const lines=[matched?say(`Matching saved club equipment requests: ${matched}.`,`相符的社團器材借用紀錄共 ${matched} 筆。`)
    :say('No saved club equipment requests matched this lookup.','沒有相符的社團器材借用紀錄。')];
  if(cells.length===1)lines.push(cells[0].map((value,index)=>columns[index]+': '+markdown(value)).join(' · '));
  if(cells.length>1){
    const preview=cells.slice(0,3).map(row=>'- '+row.map((value,index)=>columns[index]+': '+markdown(shorten(value,160))).join(' · '));
    lines.push(preview.join('\n'));
  }
  if(selection.latest&&cells.length)lines.push(say('Showing the most recently updated saved request.','依最後更新時間顯示最新一筆紀錄。'));
  else if(!selection.countOnly&&cells.length<matched)lines.push(say(`Showing ${cells.length} of ${matched} matching requests.`,`顯示 ${matched} 筆中的 ${cells.length} 筆。`));
  if(capped)lines.push(say('This lookup covers your 100 most recently updated requests.','此次查詢範圍為最後更新的 100 筆紀錄。'));
  lines.push('['+title+']('+clubEquipmentPath+')');
  return {status:'answered',answer:lines.join('\n\n'),citations:[{chunkId:sourceId,title,url:clubEquipmentPath,claim:say('Saved records for the signed-in account','登入帳戶的器材借用紀錄'),
    sourceName:'School Affairs',locator:null,effectiveAt:null,reviewedAt:checkedAt}],suggestedQuestions:[],grounding:{source:'account',webSearched:false,checkedAt},
    ...(cells.length>1?{views:[{id:'club-equipment',title,url:clubEquipmentPath,columns,rows:cells.map(row=>row.map(value=>shorten(value,198))),total:matched,checkedAt}]}:{})};
}

function compose(question,plan,evidence){
  const zh=/\p{Script=Han}/u.test(question);
  const equipmentSource=evidence.find(item=>item.id===sourceId);
  const equipment=equipmentSource?equipmentReply(question,plan.selection,equipmentSource):null;
  if(!plan.feeQuestion)return equipment;
  const feeSource=evidence.find(item=>item.id==='account:charges');
  const fees=feeSource?formatSelectedChargeEvidence(feeSource,{language:zh?'zh-TW':'en'}):null;
  if(!equipment&&!fees)return null;
  const equipmentSection=[equipment,zh?'目前無法查核你的社團器材借用紀錄。':'I couldn’t verify your saved club equipment requests.'];
  const feeSection=[fees,zh?'目前無法查核你的待繳費用。':'I couldn’t verify your saved fee balance.'];
  const sections=plan.feeFirst?[feeSection,equipmentSection]:[equipmentSection,feeSection];
  const answer=sections.map(([reply,missing])=>reply?.answer??missing).join('\n\n');
  const feeLink=zh?'[查看待繳費用](/school-affairs/services/39-1)':'[Open my fee balance](/school-affairs/services/39-1)';
  return {status:'answered',answer:answer.length<=selectedChargeAnswerLimits.answerCharacters?answer:sections.map(([reply,missing])=>fees&&reply===fees?feeLink:reply?.answer??missing).join('\n\n'),
    citations:sections.flatMap(([reply])=>reply?.citations??[]),suggestedQuestions:[],views:sections.flatMap(([reply])=>reply?.views??[]),
    grounding:{source:'account',webSearched:false,checkedAt:equipment?.grounding.checkedAt??JSON.parse(feeSource.content).checkedAt,...(!equipment||!fees?{degraded:true}:{})}};
}

export async function answerClubEquipment({account,question,route,history,plan,deadline,onProgress}){
  const expected=clubEquipmentPlan(question,route,history);
  if(!expected||expected.selection.reason||!isDeepStrictEqual(expected,plan))throw unavailable();
  const activity=[];
  const progress=step=>{
    const previous=activity.findIndex(item=>item.kind===step.kind);
    if(previous<0)activity.push(step);else activity[previous]=step;
    try{onProgress?.(step);}catch{/* A disconnected stream cannot affect verification. */}
  };
  const sources=new Map();
  async function load(attempt,tool,label,read){
    if(sources.has(tool))return;
    const found=await read().catch(()=>null);
    if(found)sources.set(tool,found);
    progress({kind:`account-read:${tool}:${attempt}`,label,status:found?'complete':'unavailable',detail:found
      ?'Checked the selected records for this signed-in account.':'The selected records could not be read.'});
  }
  async function feeEvidence(){
    const snapshot=await loadOwnAffairsCharges(account,{deadline});
    const source=accountEvidence(snapshot,['charges'],{question:expected.feeQuestion,route:'/school-affairs/services/39-1',scopedReadOnly:true})
      .find(item=>item.id==='account:charges');
    formatSelectedChargeEvidence(source);
    return source;
  }
  const read=async attempt=>{
    await Promise.all([load(attempt,'clubEquipment','Checked saved club equipment requests',()=>readEquipment(account,expected.selection,deadline)),
      ...(expected.feeQuestion?[load(attempt,'charges','Checked saved fee balance',feeEvidence)]:[])]);
    return [...sources.values()];
  };
  const missing={status:'abstained',answer:'',citations:[],grounding:{source:'account',webSearched:false}};
  const first=await read(1),format=evidence=>compose(question,expected,evidence);
  let attempt=1;
  const targetCount=expected.feeQuestion?2:1;
  const result=await runAnswerVerification({question,initialAnswer:format(first)??missing,deadline,onProgress:progress,
    loadEvidence:async({attempt:next})=>{attempt=next;return next===1?first:read(next);},
    verify:async({candidate,evidence})=>!evidence.length||attempt===1&&evidence.length<targetCount?{ok:false,reason:'evidence_unavailable'}
      :{ok:isDeepStrictEqual(candidate,format(evidence))},repair:async({evidence})=>format(evidence)??missing});
  if(result.verification?.status==='verified'&&sources.size<targetCount){
    return {...result,activity,verification:{status:'unverified',attempts:result.verification.attempts,
      reason:sources.has('clubEquipment')?'fee_evidence_unavailable':'club_equipment_evidence_unavailable'}};
  }
  return {...result,activity};
}
