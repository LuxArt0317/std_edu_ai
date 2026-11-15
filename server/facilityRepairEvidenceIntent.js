import {repairPaths} from '../src/features/public/affairs/facilityRepair.js';

// Pure shared intent only. No credentials, transport, global state or mutations.
const uuid='[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const topic=/\b(?:(?:facility|facilities|online) repairs?|facilities maintenance|maintenance requests?|repair (?:reports?|tickets?|requests?))\b|\b(?:my|our)\s+repairs?(?=\s*(?:[.!?;,]|$|\b(?:and|also|status|history|progress|notes?|records?)\b|['’]s\s+(?:status|history|progress|notes?|records?)\b))|\brepair\s*(?:[#:]|\bid\b)|報修|报修|設備修繕|设备修缮/giu;
const personal=/\b(?:my|our|mine|saved|recorded|status|history|track|details?)\b|我的|本人|已儲存|已保存|狀態|状态|進度|进度|紀錄|记录|處理情形/iu;
const followup=/\b(?:it|this|that|its|status|progress|notes?|comments?|resolved|done|completed|location|problem|description)\b|這|这|狀態|状态|進度|进度|處理|備註|备注|留言|地點|地点/iu;
const unrelated=/\b(?:salary|tuition|grades?|courses?|class(?:es)?|assignments?|scholarship|loan|leave|enrollment|certificate|club|teachers?|instructors?|lectures?)\b|薪資|学费|學費|成績|成绩|課程|课程|作業|作业|請假|请假|社團|老師|老师|下一堂課|下一堂课/iu;
const foreign=/\b(?:another|other|different)\s+(?:student|account|person|user)|\b(?:their|his|her)\s+(?:repair|maintenance)|\bmy\s+(?:friend|classmate|mother|father|parent|sister|brother|roommate|partner)['’]?s?\b|別人|别人|他人|其他(?:學生|学生)|同學的|同学的|(?:他|她|他們|她们|我的朋友|我的家人)的/iu;
const namedOwner=/\b(?!(?:repair|report|request|ticket|technician|student|school|university|account|user|caller|system)['’]s\b)[\p{L}][\p{L}’-]*['’]s\s+(?:(?:saved|recorded|local|facility|facilities|online)\s+){0,4}(?:repairs?|maintenance)\b/iu;
const unquoted=value=>value.replace(/["“「][^"”」]*["”」]/gu,'');
function recordTarget(value){
  const pattern=/(?=\b(?:repairs?|maintenance|records?|reports?|tickets?|requests?|status|notes?|comments?)\s+(?:(?:for|of|belonging to)|(?:reported|submitted|filed|owned|created)\s+by)\s+([^.!?;,\n]+))/giu;
  let ambiguous=false;
  for(const match of unquoted(value).matchAll(pattern)){
    const target=match[1].split(/\s+(?:and|also|but|plus)\s+/iu)[0].trim();
    if(/^(?:me|my|mine|myself|our|us|ourselves|this|that|the|a|an|all|every|each|current|previous|last|next|today|yesterday)\b/iu.test(target)
      ||/\b(?:lab|laboratory|equipment|device|computer|printer|chair|desk|light|building|room|floor|door|window|facility|facilities|air conditioner|water|electrical|plumbing)\b/iu.test(target))continue;
    if(/^[\p{Lu}][\p{L}’-]*(?:\s+[\p{Lu}][\p{L}’-]*){0,3}$/u.test(target))return 'foreign';
    if(target)ambiguous=true;
  }
  return ambiguous?'ambiguous':null;
}
function chineseNamedOwner(value){
  return unquoted(value).split(/[，。！？\n]/u).some(part=>{
    const clause=part.trim().replace(/^(?:(?:請|请|顯示|显示|查看|查詢|查询|我想看|我想查|告訴我|告诉我)\s*)+/u,'');
    const match=/^([\p{Script=Han}]{2,4}|[A-Z][A-Za-z’-]{1,30})的(?:已(?:儲存|保存)的?)?(?:報修|报修)/u.exec(clause);
    return Boolean(match&&!/^(?:我們|我们|本人|自己|學校|学校|校園|校园|設備|设备|處理中|处理中)$/u.test(match[1]));
  });
}
// A quoted complaint or note may name somebody without requesting their
// records. Only the surrounding ownership request controls the access gate.
const foreignRequest=value=>{const outer=unquoted(value);return foreign.test(outer)||namedOwner.test(outer)||recordTarget(outer)==='foreign'||chineseNamedOwner(outer);};
const network=/\b(?:dorm|dormitory|residence hall)\b.{0,20}\b(?:wi-?fi|internet|network)\b|宿網|宿舍網路/iu;
const data=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))
  &&Reflect.ownKeys(value).every(key=>typeof key==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
// Reject malformed/untrusted text before using it as a selector.
// eslint-disable-next-line no-control-regex
const text=value=>typeof value==='string'&&value.length<=12000&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ud800-\udfff]/u.test(value)?value.normalize('NFKC').trim():'';
function excluded(question,index){
  const prefix=question.slice(0,index).split(/[.;!?。；！？]|\b(?:but|instead)\b|但是|而是|但|[,，](?=\s*(?:show|list|include|read|check)\b)/iu).at(-1).replace(/\bnot only\b/giu,'');
  return /\b(?:do not|don't|never)\s+(?:show|list|include|read|check)\b|\b(?:without|exclude|excluding|omit)\b|\bnot\s+(?:(?:my|the|any|saved)\s*)?$|不要|不顯示|不显示|排除/iu.test(prefix);
}
function parseRoute(route){
  if(route===undefined||route==='')return {id:null,page:0,status:'',native:false};
  if(typeof route!=='string'||route.length>3100||/\\|\s|%(?:2f|5c|2e)|\/(?:\.|\.\.)(?:\/|$|\?)/iu.test(route))return null;
  try{
    const url=new URL(route,'https://stu.best');
    if(url.origin!=='https://stu.best'||url.username||url.password||url.hash||url.pathname.includes('/../'))return null;
    const path=url.pathname.replace(/\/$/u,''),match=new RegExp('^'+repairPaths.history+'/('+uuid+')$','iu').exec(path);
    if(path.startsWith(repairPaths.history+'/')&&!match)return null;
    const native=path===repairPaths.history||Boolean(match),keys=[...url.searchParams.keys()];
    if(new Set(keys).size!==keys.length||keys.some(key=>/^(?:user|owner|student|account|token|authorization)/iu.test(key)))return null;
    if(native&&(match&&keys.length||keys.some(key=>!['page','status'].includes(key))))return null;
    const page=native?url.searchParams.get('page')??'0':'0',status=native?url.searchParams.get('status')??'':'';
    if(!/^\d{1,3}$/u.test(page)||!['','submitted','in_progress','resolved','cancelled'].includes(status))return null;
    return {id:match?.[1].toLowerCase()??null,page:Number(page),status,native};
  }catch{return null;}
}
function previous(history){
  if(!Array.isArray(history))return '';
  for(let i=history.length-1;i>=Math.max(0,history.length-24);i--){
    const descriptor=Object.getOwnPropertyDescriptor(history,String(i)),row=descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:null;
    if(data(row)&&row.role==='user')return text(row.content);
  }
  return '';
}
const mentions=question=>[...question.matchAll(topic)];
function requestedFieldsText(question){
  return question.split(/[.;!?。；！？,，\n]|\b(?:and|also|alongside|plus|with|but)\b|以及|還有|还有|並且|并且|而且|和|與|与/iu)
    .filter(clause=>!unrelated.test(clause)&&!foreign.test(clause)&&!/^\s*not(?!\s+only)\b/iu.test(clause)&&!excluded(clause,clause.length)).join(' ');
}
const requests=(question,pattern)=>[...question.matchAll(new RegExp(pattern.source,pattern.flags+'g'))].some(match=>!excluded(question,match.index));
function references(question){
  const marked=[/\b(?:repair|maintenance)(?:\s+(?:report|ticket|request))?\s*(?:id\b\s*[:#]?|[:#])\s*([a-z0-9][a-z0-9-]{0,63})\b/giu,
    /(?:報修|报修)(?:單|单|紀錄|记录)?\s*(?:編號|编号|[:：#])\s*[:：#]?\s*([a-z0-9][a-z0-9-]{0,63})/giu];
  const bare=[/\b(?:repair|maintenance)(?:\s+(?:report|ticket|request))?\s+([a-z0-9][a-z0-9-]{0,63})\b/giu,
    /(?:報修|报修)(?:單|单|紀錄|记录)?\s*([a-z0-9][a-z0-9-]{0,63})/giu];
  const collect=patterns=>patterns.flatMap(pattern=>[...question.matchAll(pattern)].map(match=>match[1].toLowerCase()));
  return [...new Set([...collect(marked),...collect(bare).filter(value=>/\d/u.test(value))])];
}
export function isForeignFacilityRepairQuestion(question){
  const value=text(question);return Boolean(value&&(mentions(value).length||/\brepairs?\s+(?:for|of|reported|submitted|filed|owned|created)\b/iu.test(value))&&foreignRequest(value));
}
export function selectFacilityRepairEvidence(question,route='',history=[]){
  try{
    const current=text(question),page=parseRoute(route);if(!current||!page||foreignRequest(current)||network.test(current))return null;
    if(/\b(?:where|how)\b.{0,40}\b(?:file|submit|create|make)\b|如何.{0,8}(?:報修|报修)|哪裡.{0,8}(?:報修|报修)/iu.test(current)
      &&! /\b(?:status|history|recorded|saved|progress|notes?|comments?)\b|紀錄|记录|狀態|状态|進度|进度|備註|备注/iu.test(current))return null;
    const explicit=mentions(current),positive=explicit.some(match=>!excluded(current,match.index));
    let context=current,idSource='question';
    if(explicit.length){if(!positive||!personal.test(current)&&!page.native)return null;}
    else{
      if(unrelated.test(current)||!followup.test(current)||excluded(current,current.length))return null;
      const prior=previous(history),priorMentions=mentions(prior);
      if(!page.native&&(!priorMentions.some(match=>!excluded(prior,match.index))||!personal.test(prior)||foreignRequest(prior)||network.test(prior)))return null;
      context=page.native?current:prior;idSource=page.native?'route':'previous_user';
    }
    const all=/\b(?:all|every)\s+(?:(?:of|my|the|saved|facility)\s+){0,4}(?:repair|maintenance)\b|(?:全部|所有).{0,8}(?:報修|报修)/iu.test(current);
    const ids=references(context),ambiguous=recordTarget(current)==='ambiguous'||ids.length>1||all&&ids.length>0||ids.some(value=>!new RegExp('^'+uuid+'$','u').test(value));
    const id=ids.length===1?ids[0]:all?null:page.id;
    if(!ids.length)idSource=id?'route':'none';
    const requested=requestedFieldsText(current);
    const latestNote=requests(requested,/\b(?:notes?|comments?|handling update|review remarks?)\b|\btechnician\b.{0,15}\b(?:said|says|wrote)\b|處理註記|处理备注|備註|备注|留言|處理紀錄|处理记录/iu);
    const noteHistory=latestNote&&requests(requested,/\b(?:all|every|history of)\b.{0,30}\b(?:notes?|comments?)\b|(?:全部|所有).{0,8}(?:備註|备注|留言)/iu);
    return {id:ambiguous?null:id,idSource:ambiguous?'ambiguous':idSource,page:id?0:all?0:page.page,status:id||all?'':page.status,
      latestNoteRequested:latestNote,noteHistoryRequested:noteHistory,
      fields:{location:requests(requested,/\b(?:location|where|building|room)\b|地點|地点|位置|樓|楼|房間|房间/iu),
        item:requests(requested,/\b(?:equipment|item|device)\b|設備|设备|物品/iu),
        description:requests(requested,/\b(?:description|problem|damage|broken|reported)\b|故障|損壞|损坏|描述|問題|问题/iu)},
      requiresClarification:ambiguous,reason:ambiguous?'ambiguous_selection':null};
  }catch{return null;}
}
export function isFacilityRepairEvidenceQuestion(question,route='',history=[]){return selectFacilityRepairEvidence(question,route,history)!==null;}

/** A technician message is outside the checked cancellation action. */
export function requestsFacilityRepairTechnicianMessage(question){
  const value=unquoted(text(question));
  return /\b(?:and|then|also)\s+(?:(?:please|also)\s+)*(?:tell|notify|message)\s+(?:the\s+)?(?:(?:school|university)\s+)?(?:technician|maintenance (?:staff|team)|repair team)\b|(?:並|以及|然後|然后|同時|同时)(?:通知|傳訊給|传讯给)(?:校方)?(?:技師|技师|維修人員|维修人员)/iu.test(value);
}
