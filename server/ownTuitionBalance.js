import {loadOwnAffairsCharges} from './affairsWorkspace.js';
import {accountEvidence} from './answerVerificationAccount.js';
import {formatSelectedChargeEvidence} from './selectedChargeEvidenceAnswer.js';

const categories=new Set(['tuition','tuition fee','tuition fees','school tuition','tuition and miscellaneous fees',
  'tuition & miscellaneous fees','學費','学费','學雜費','学杂费']);

function isTuitionCharge(row){
  const category=row.category?.normalize('NFKC').trim().toLowerCase();
  if(category)return categories.has(category);
  // Original sample charges predate category metadata. They have one known
  // format. An arbitrary uncategorized label does not establish a tuition fee.
  return row.sourceMode==='sample'&&/^Sample (?:Fall|Spring) \d{4} tuition$/iu.test(row.label);
}

export async function readOwnTuitionBalance(account,deadline,observeRead){
  const saved=await loadOwnAffairsCharges(account,{deadline,requireExactProjection:true,observeRead});
  const charges=saved.charges.filter(isTuitionCharge);
  const source=accountEvidence({...saved,charges},['charges'],{
    route:'/school-affairs/services/39-1',scopedReadOnly:true,
  }).find(item=>item.id==='account:charges');
  if(!source)throw new Error('The saved tuition charge source is unavailable.');
  const payload=JSON.parse(source.content);
  if(!Array.isArray(payload.records)||payload.records.length!==charges.length||payload.excerpted!==false||payload.unavailableReason)
    throw new Error('The saved tuition charges could not be verified within the answer scope.');
  formatSelectedChargeEvidence(source,{exactBalance:true,balanceOnly:true});
  return source;
}

export function formatOwnTuitionBalance(source,zh){
  const reply=formatSelectedChargeEvidence(source,{language:zh?'zh-TW':'en',exactBalance:true,balanceOnly:true});
  const {records,studentRecordFound}=JSON.parse(source.content);
  const heading=zh?'已儲存的學費餘額':'Saved tuition balance';
  const empty=zh?'已讀取此帳戶的費用紀錄，但其中沒有符合的學費項目。':'I checked your saved fee records and found no matching tuition charges.';
  const footer=zh?'[開啟已儲存的費用紀錄](/school-affairs/services/39-1)':'[Open saved fee records](/school-affairs/services/39-1)';
  const answer=studentRecordFound&&!records.length?empty+'\n\n'+footer:reply.answer;
  return {...reply,answer:'**'+heading+'**\n\n'+answer};
}
