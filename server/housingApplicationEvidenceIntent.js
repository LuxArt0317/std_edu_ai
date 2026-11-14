// Browser-safe 26-1 metadata scope. Bed ownership/term validation is shared;
// application field selection and navigation remain separate from 34-1.
import {housingBedLookupContext} from './housingBedEvidenceIntent.js';
const topic=/\b(?:housing|dormitory|dorm|accommodation)\s+(?:applications?|receipts?)\b|住宿申請|住宿申请|住宿收據|住宿收据/iu;
const negative=/^(?:please\s+)?(?:do not|don['’]t|never)\s+(?:read|show|tell(?: me)?|include|check)|^(?:not|without|skip|excluding|except)\b|^(?:請|请)?不要|^排除|^不含/iu;
const clean=value=>value.replace(/^(?:(?:also|then|but)\s+)+/iu,'').replace(/[,，]\s*$/u,'').trim();
const leadingTerm=/^(?:for\s+)?((?:academic|school)\s+year\s+\d{1,3}(?:\s+semester\s+\d{1,2})?|(?:term\s+)?\d{1,3}-\d{1,2}|\d{1,3}\s*學年(?:度)?(?:\s*第\s*\d{1,2}\s*學期)?)[,，]\s*(?=.+)/iu;
const requestedBed=/^(?:(?:my|the)\s+)?(?:(?:assigned|saved)\s+)?(?:(?:dormitory|housing|dorm)\s+)?(?:bed|bed assignment)(?:\s+(?:number|records?))?$/iu;
const split=value=>value.split(/[;；。!?！？\n]|\.(?:\s+|$)|(?:以及|並且|并且|及|和|與|与)(?=(?:我的|我)?(?:住宿(?:床位|申請|申请|收據|收据)|床位|學費|学费|下一堂))|[,，]\s*(?=(?:show|what|when|where|my|do not|don['’]t|never|not|without)\b)|\s+(?:and|also|but)\s+(?=(?:my|show|what|when|where|do not|don['’]t|never|tuition|next class|[\p{L}\p{N}][\p{L}\p{N}_’-]*['’]s)\b)/iu).map(clean).filter(Boolean);
const follow=/^(?:what (?:is|was|about)|when (?:did i|was it)|did i|show(?: me)?|and)\s+(?:(?:my|the|its|saved|recorded)\s+)*(?:receipt|submission|submitted|application|academic year|semester)|^(?:我|我的|它的|請|请|顯示|显示)*(?:收據|收据|申請時間|申请时间|提交時間|提交时间)/iu;
const independent=/\b(?:tuition|balance|next class|courses?|grades?|assignments?|homework|salary|bed|conduct|health|counseling|leave)\b|床位|床號|床号|學費|学费|獎懲|奖惩|課程|课程|請假|请假/iu;
const unsupported=/\b(?:name|student number|address|phone|email|health|birth|gender|department|agreement|approval|approved|eligible|lottery|paid|payment|bank|official|university|download|pdf|file|window|deadline|open|close)\b|姓名|學號|学号|地址|電話|电话|健康|生日|性別|性别|同意書|同意书|核准|審核|审核|繳費|缴费|正式|下載|下载|期限|截止/iu;
const navigation=/^(?:where (?:can|do) i (?:find|see|check|view|open)|(?:give|show) me (?:the |a )?link|open\b|哪裡|哪里|去哪|(?:請|请)?(?:提供|給我|给我).*(?:連結|链接))/iu;
const transform=value=>value.replace(new RegExp(topic.source,'giu'),match=>/\p{Script=Han}/u.test(match)?'宿舍床號':'dormitory bed')
  .replace(/\b(?:submitted|filed|recorded)\s+by\s+/giu,'for ');
function latest(history){
  if(!Array.isArray(history))return '';
  for(const row of history.slice(-12).reverse()){
    if(!row||typeof row!=='object')continue;
    const role=Object.getOwnPropertyDescriptor(row,'role'),content=Object.getOwnPropertyDescriptor(row,'content');
    if(role?.value==='user'&&typeof content?.value==='string')return content.value.slice(0,12000);
  }
  return '';
}
export function housingApplicationLookupContext(question,route='',history=[]){
  const q=typeof question==='string'&&question.length<=12000&&!/[\p{Cs}]/u.test(question)?question.normalize('NFKC').trim():'';
  const empty={selection:null,question:'',otherQuestion:q,navigation:false,foreign:false,excluded:false};if(!q)return empty;
  const coordinated=q.replace(/(^|[;；。!?！？\n]|\.\s+)(\s*(?:(?:please\s+)?(?:do not|don['’]t|never)\s+(?:read|show|tell(?: me)?|include|check))\s+[^;；。!?！？\n.]+?\b(?:housing|dormitory|dorm|accommodation)\s+(?:application|receipt)[^;；。!?！？\n.]*?)\s+(?:and|nor)\s+([^;；。!?！？\n.]+)(?=$|[;；。!?！？\n.]|\.\s)/giu,
    (match,boundary,application,companion)=>requestedBed.test(companion.trim())?boundary+application+'. Do not show '+companion:match);
  const term=leadingTerm.exec(coordinated);
  const remainder=term?coordinated.slice(term[0].length):coordinated;
  const parts=split(remainder);
  if(term){
    if(topic.test(parts[0]??''))parts[0]+=' for '+term[1];
    else parts.unshift(term[0].replace(/[,，]\s*$/u,''));
  }
  const previous=latest(history),explicit=parts.some(part=>topic.test(part));
  const prior=previous&&topic.test(previous)&&!independent.test(previous)?previous:'';
  const implicit=!explicit&&follow.test(q)&&!independent.test(q)&&(previous?Boolean(prior):route==='/school-affairs/services/26-1');
  const own=[],other=[];let excluded=false;
  const field=part=>/\b(?:receipt(?: number)?|submission(?: time)?|submitted[ -]at(?: time)?|application|academic year|semester)\b|收據|收据|提交時間|提交时间/iu.test(part)&&!independent.test(part);
  for(const part of parts){
    const continuedField=own.length>0&&field(part);
    if(!topic.test(part)&&!implicit&&!continuedField){other.push(part);continue;}
    if(negative.test(part)){own.length=0;excluded=true;continue;}
    excluded=false;own.push(part);
  }
  const selected=own.join('. ');let otherQuestion=other.join('. ');if(!selected)return {...empty,otherQuestion,excluded};
  const scope=housingBedLookupContext(transform(implicit?selected+'. '+(prior||'my housing application'):selected),
    route==='/school-affairs/services/26-1'?'/school-affairs/services/34-1':route,[]);
  const foreign=scope.foreign||scope.selection?.reason==='foreign_request';
  if(!foreign&&/(?:\bmy\b|我的)/iu.test(selected)&&otherQuestion==='床位')otherQuestion='我的住宿床位';
  const reason=foreign?'foreign_request':scope.selection?.reason??null;
  const nav=own.every(part=>navigation.test(part))&&!reason&&!/\b(?:number|when|status|submitted|amount)\b|單號|单号|何時|何时|狀態|状态/iu.test(selected);
  const metadata=/\b(?:receipt|submitted|submission|submit|status|saved|recorded|history|academic year|semester)\b|收據|收据|單號|单号|提交|紀錄|记录|狀態|状态|學年|学年|學期|学期/iu.test(selected);
  const limitation=unsupported.test(selected);
  return {selection:nav?null:{from:explicit?'question':prior?'history':'route',term:scope.selection?.term??{academicYear:null,semester:null},
    reason:reason??(limitation&&!metadata?'outside_scope':null),unavailableDetails:limitation},
    question:selected,otherQuestion,navigation:nav,foreign,excluded:false};
}
export const isHousingApplicationScopeQuestion=(question,route='',history=[])=>{const value=housingApplicationLookupContext(question,route,history);return Boolean(value.selection||value.navigation||value.foreign||value.excluded);};
