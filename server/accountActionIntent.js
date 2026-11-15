import {counselingDate} from './counselingContract.js';

// Every proposed change starts with a direct request in the current turn.
// Saved messages, tool output and model-selected values cannot supply consent.
const lead = /^(?:(?:please|could you(?: please)?|can you(?: please)?|would you(?: please)?)\s+)+/iu;
const unrelatedClause = /[;；\r\n]|[?？]|(?:[.!。！]\s+[^\s])|\b(?:and|then|also|but)\s+(?:(?:please|don['’]t|do not|never)\s+)?(?:add|create|delete|cancel|complete|finish|mark|update|edit|rename|change|submit|post|publish|tell|show|check|what|when|where|how|why)\b|(?:，|、|然後|並且|也請|但是)(?:請)?(?:新增|建立|刪除|取消|修改|提交|完成|查詢|顯示)/iu;
const laterRequest = /(?:[.;；!?。！？]\s+|\b(?:and|then|also|but)\s+)(?:(?:please|could you|can you)\s+)*(?:add|create|delete|cancel|complete|mark|update|edit|rename|change|submit|post|publish|tell me|show me|check my|what|when|where|how|why)\b|[。；！？](?:請|幫我)?(?:新增|建立|刪除|取消|修改|提交|完成|查詢|顯示)/iu;
const escapedPattern = /^"([^"\r\n]*)"$|^“([^”\r\n]*)”$|^「([^」\r\n]*)」$|^『([^』\r\n]*)』$/u;
const quotedText = /"[^"\r\n]*"|“[^”\r\n]*”|「[^」\r\n]*」|『[^』\r\n]*』/gu;
const holdClause = /(?:^|[;；,.，。!?！？\n]\s*|\b(?:and|but|then|however)\s+)(?:(?:please|actually)\s+)*(?:do not|don['’]t|never|wait|hold off|cancel (?:it|that)|(?:請|先)?(?:不要|別|取消|稍等))(?:\b|(?=[\p{Script=Han}\s]|$))|\b(?:only if|unless|only after)\b|\bif\s+(?:i|we)\s+(?:approve|confirm|agree|say yes)\b|(?:等|待)我(?:同意|確認)|經我確認/iu;
const badText = /[\p{Cs}\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const learningSupportTopic=/\blearning[- ]support (?:applications?|requests?)\b|(?:學習輔導|学习辅导|完善就學)(?:獎勵學習輔導)?(?:申請|申请|請求)/iu;
const learningSupportWithdrawalLead=/^(?:(?:do not|don['’]t|never|wait to|hold off on)\s+)?(?:withdraw(?:ing)?|cancel(?:l?ing)?)\b|^(?:幫我)?(?:先)?(?:不要|別|暫勿)?(?:先)?(?:撤回|撤銷|取消)/iu;
const ownLearningSupportWithdrawal=/^(?:withdraw|cancel) my (?:(latest|most recent|active) )?(?:stu\.best )?learning[- ]support (?:application|request)\b([\s\S]*)$/iu;
const ownLearningSupportWithdrawalZh=/^(?:幫我)?(?:撤回|撤銷|取消)\s*(?:我(?:的)?|本人(?:的)?)\s*(?:(最新|最近|進行中)(?:的)?)?\s*(?:學習輔導|学习辅导|完善就學(?:獎勵學習輔導)?)(?:申請|申请|請求)([\s\S]*)$/u;
const learningSupportSelector=/^(?:(?:with\s+)?(?:id|reference)|編號|编号|#)?\s*[:：]?\s*([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/iu;
const repairCancellationLead = /^(?:(?:(?:do not|don['’]t|never|wait to|hold off on)\s+)?cancel(?:l?ing)?\b|(?:幫我)?(?:先)?(?:不要|別|暫勿)?(?:先)?取消)/iu;
const repairTopic = /\b(?:repairs?|maintenance)\b|報修|报修|設備修繕/iu;
const cancelOwnedRepair = /^cancel (?:my|this|that|the) (?:(?:stu\.best|local) )?(?:(?:facility|facilities|online) )?(?:repair(?: (?:report|request|ticket))?|maintenance (?:request|report|ticket))([\s\S]*)$/iu;
const cancelOwnedRepairZh = /^(?:幫我)?取消\s*(?:我的|這筆|這個|該筆|本筆)\s*(?:設施|設備|線上)?(?:報修|报修)(?:單|申請|申请|紀錄|记录)?([\s\S]*)$/u;
const repairSelector = /^(?:(?:(?:(?:with\s+)?(?:id|reference)|編號|编号|#)\s*[：:]?\s*)?([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}))?$/iu;

function field(value, {body=false} = {}) {
  const text = (value ?? '').trim();
  if (badText.test(text)) return null;
  const quote = escapedPattern.exec(text);
  if (quote) return quote.slice(1).find(part => part !== undefined).trim();
  if ((body ? laterRequest : unrelatedClause).test(text)) return null;
  return text;
}

export function parseExplicitAccountAction(question) {
  if (typeof question !== 'string' || question.length > 3000 || badText.test(question)) return null;
  const rawCommand = question.trim().replace(lead,'').replace(/^請\s*/u,'');
  const command = rawCommand.replace(/[.!?。！？]+$/u,'').trim();
  const held=holdClause.test(rawCommand.replace(quotedText,'〈text〉'));
  const checked=result=>({...result,ambiguous:held||result.ambiguous});
  const equipment = /^(?:(?:cancel my (?:club equipment (?:borrowing )?request|request to borrow club equipment))|(?:(?:幫我)?取消我的社團器材借用申請))([\s\S]*)$/iu.exec(command);
  if (equipment) {
    const suffix = equipment[1];
    const selector = /^(?:\s+(?:for\s+)("[^"\r\n]+"|“[^”\r\n]+”)|\s*(?:器材|社團)[：:]?\s*(「[^」\r\n]+」|『[^』\r\n]+』))?(?:(?:\s+on\s+|\s*(?:領取日期|於)\s*)(\d{4}-\d{2}-\d{2}))?$/iu.exec(suffix);
    const target = field(selector?.[1] ?? selector?.[2]);
    return {kind:'cancel_club_equipment',target:target ?? '',pickup:selector?.[3] ?? '',
      ambiguous:!selector || target===null || holdClause.test(suffix.replace(quotedText,'〈text〉'))};
  }
  const cancellation = /^(?:(?:cancel my (counsel(?:l)?ing|psychological (?:assessment|test(?:ing)?)) (?:appointment|booking))|(?:幫我)?取消我的(?:心理)?(諮商|測驗)預約)([\s\S]*)$/iu.exec(command);
  if(cancellation){
    const suffix=cancellation[3].replace(/(?:\s+now|\s*現在)$/iu,'');
    const selector=/^(?:(?:\s+(?:for|on)\s+|\s*(?:於|日期[：:]?)\s*)(\d{4}-\d{2}-\d{2})|\s*(?:(?:with\s+)?ID[：:]?\s+|編號[：:]?\s*)([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}))?$/iu.exec(suffix);
    return checked({kind:'counseling_cancel',appointmentKind:cancellation[2]==='測驗'||/^psychological/iu.test(cancellation[1]??'')?'assessment':'counseling',
      date:selector?.[1]??'',id:selector?.[2]?.toLowerCase()??'',ambiguous:!selector||Boolean(selector[1]&&!counselingDate(selector[1]))});
  }
  if(learningSupportWithdrawalLead.test(command)&&learningSupportTopic.test(command)){
    const own=ownLearningSupportWithdrawal.exec(command)??ownLearningSupportWithdrawalZh.exec(command);
    const qualifier=own?.[1]?.toLowerCase()??'';
    const suffix=own?.[2]?.trim()??'';
    const id=learningSupportSelector.exec(suffix)?.[1].toLowerCase()??'';
    const latest=['latest','most recent','最新','最近'].includes(qualifier);
    return {kind:'withdraw_learning_support',id,mode:id?'exact':latest?'latest':'unique',
      ambiguous:!own||Boolean(suffix&&!id||qualifier&&id)};
  }
  if(repairCancellationLead.test(command)&&repairTopic.test(command)){
    const ownRepair=cancelOwnedRepair.exec(command)??cancelOwnedRepairZh.exec(command);
    const suffix=ownRepair?.[1].replace(/(?:\s+now|\s*現在)$/iu,'').trim();
    const selector=suffix===undefined?null:repairSelector.exec(suffix);
    return {kind:'cancel_facility_repair',id:selector?.[1]?.toLowerCase()??'',ambiguous:!selector};
  }
  const ownName = /^(?:(?:change|set|update|rename) (?:my |the )?(?:stu\.best )?(?:display name|nickname)(?: to\s+([\s\S]+))?|call me\s+("[^"\r\n]+"|“[^”\r\n]+”)|(?:幫我)?(?:把)?(?:我的)?(?:顯示名稱|暱稱)(?:改成|改為|設為)([\s\S]*))$/iu.exec(command);
  if (ownName) {
    const title = field(ownName[1] ?? ownName[2] ?? ownName[3]);
    return checked({kind:'update_display_name',title:title ?? '',ambiguous:title===null});
  }

  const task = /^(?:(?:add|create) (?:a )?(?:personal )?task(?:\s+(?:titled|called|named|to|with (?:the )?title))?(?:\s*[:：])?(?:\s+([\s\S]+))?|(?:remind me to|help me remember to)\s+([\s\S]+)|(?:幫我)?(?:新增|建立)(?:待辦|任務)\s*[:：]?\s*([\s\S]*))$/iu.exec(command);
  if (task) {
    const title = field(task[1] ?? task[2] ?? task[3]);
    return checked({kind:'create_task',title:title ?? '',ambiguous:title===null});
  }

  const tracker = /^(?:(?:mark|set) (?:my )?(?:personal )?(?:(?:DTM|Moodle) )?assignment(?: tracker)?\s+([\s\S]+?)\s+(?:as|to)\s+(open|submitted)|(?:將|把)(?:我的)?(?:個人)?作業(?:追蹤)?\s*([\s\S]+?)\s*(?:標記為|設為)(未完成|已繳交))$/iu.exec(command);
  if (tracker) {
    const target = field(tracker[1] ?? tracker[3]);
    const status = tracker[2]?.toLowerCase() ?? (tracker[4]==='未完成'?'open':'submitted');
    return checked({kind:'set_assignment_status',target:target ?? '',status,ambiguous:target===null});
  }

  const complete = /^(?:(?:complete|finish|mark done) (?:my |the )?(?:task(?:\s+([\s\S]+))?)|(?:幫我)?(?:完成|標記完成)(?:我的)?(?:待辦|任務)\s*[:：]?\s*([\s\S]*))$/iu.exec(command)
    ?? /^(?:complete|finish|mark done) (["“][^"”\r\n]+["”])$/iu.exec(command);
  if (complete && !/\b(?:assignment|coursework|exam|payment|registration)\b|作業|繳費/iu.test(complete[1]??complete[2]??'')) {
    const target = field(complete[1] ?? complete[2]);
    return checked({kind:'complete_task',target:target ?? '',ambiguous:target===null});
  }

  const request = /^(?:create|submit) (?:a |my )?(?:(records|registration|general) )?(?:stu\.best )?service request(?: (?:titled|called|named) ([\s\S]+?))?(?: with (?:details|description)\s*[:：]?\s+([\s\S]+))?[.!。！]?$/iu.exec(rawCommand);
  if (request) {
    const title = field(request[2]), details = field(request[3],{body:true});
    return checked({kind:'create_service_request',title:title ?? '',details:details ?? '',requestType:request[1]?.toLowerCase() ?? '',ambiguous:title===null||details===null});
  }

  const announcement = /^(?:post|publish) (?:a |an )?(?:stu\.best )?announcement(?: (?:titled|called|named) ([\s\S]+?))?(?: with (?:body|text)\s*[:：]?\s+([\s\S]+))?[.!。！]?$/iu.exec(rawCommand);
  if (announcement) {
    const title=field(announcement[1]),details=field(announcement[2],{body:true});
    return checked({kind:'publish_announcement',title:title ?? '',details:details ?? '',ambiguous:title===null||details===null});
  }
  return null;
}
