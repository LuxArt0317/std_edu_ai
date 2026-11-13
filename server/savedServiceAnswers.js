import {schoolServiceEntries,studentServiceByKey} from '../src/features/public/affairs/studentServices.js';
import {selectServiceRecords} from './accountEvidenceSelection.js';

export const SAVED_SERVICE_ANSWER_LIMIT = 12000;
const ROW_LIMIT = 12;
const services = new Map(schoolServiceEntries.map(entry=>[entry.id,entry]));
for(const key of ['leave','internship'])services.set(key,studentServiceByKey(key));
// These routes have dedicated readers. A general “my records/status” request
// must reach those readers rather than being answered from unrelated notes.
const dedicatedServices = new Set(['6-1','6-2','6-3','6-4','7-2','7-3','3-1','3-2','4-1','4-2','4-4','4-5','9-1','11-1','11-2','11-3','12-4','13-1','14-1','15-1','15-2','17-1','22-1','26-1','34-1','39-1']);
const structuredServices = new Set(['leave','internship','20-1','33-1','53-1']);
const noteIntent = question=>/\bnotes?\b|\b(?:personal|private|local|saved)\s+(?:tracking|tracker)\b|\b(?:tracking|tracker)\s+(?:records?|status)\b|備註|筆記|(?:私人|站內|本地|已儲存).{0,4}追蹤/i.test(question);
const trackerIntent = question=>/\b(?:personal|private|local|saved)\s+(?:service\s+)?(?:notes?|tracking|tracker)\b|\b(?:tracking|tracker)\s+(?:notes?|records?|status)\b|(?:私人|站內|本地|儲存).{0,6}(?:備註|筆記|追蹤)/i.test(question);
const nativeIntent = question=>/\b(?:tuition|fees?|payments?|grades?|transcript|attendance|absences?|timetable|subjects?|courses?|classes?|scholarship|student.aid|housing|dormitory bed|graduation|credit.overload|credit.underload|library access request)\b|成績|課表|學費|欠費|付款|出缺勤|缺課|獎學金|助學金|床位|畢業審查|超修|減修/i.test(question);
const recordIntent = question=>/\b(?:my|saved|records?|notes?|reference|status|tracking)\b|我的|儲存|紀錄|記錄|備註|狀態|編號/i.test(question);
const mutationIntent = question=>/^(?:(?:please|can you|could you|would you)\s+)*(?:submit|file|send|create|update|edit|delete|cancel|withdraw|approve|pay|apply)\b|^(?:請|幫我|請幫我)?(?:提交|送出|送件|新增|修改|刪除|取消|撤回|批准|支付|繳費|申請)/i.test(question.trim());

/** Render stored text as one inert Markdown text span, never HTML or a link. */
const plain = value=>String(value??'')
  .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,' ')
  .replace(/\s+/g,' ').trim()
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/[\\`*_[\]()~#!|]/g,'\\$&')
  .replace(/https?:\/\//gi,scheme=>scheme.replace(':','&#58;'));
const notePath = service=>['6-1','6-2','6-3','6-4','7-3','12-8'].includes(service.id)?service.localUrl+'/notes':service.localUrl;
const link = (key,zh)=>{
  const service=services.get(key);
  return `[${plain(service?.title||(zh?'開啟紀錄':'Open records'))}](${notePath(service)})`;
};
const citation = key=>({chunkId:'account:serviceRecords',claim:'Owned saved service tracking notes',title:services.get(key).title,
  sourceName:'My stu.best records',url:notePath(services.get(key)),locator:null,effectiveAt:null,reviewedAt:null});

/** Answer owned saved-note queries without equating a tracker with a school workflow. */
export function answerSavedServiceRecords(question,snapshot,route='',history=[]){
  if(typeof question!=='string'||!snapshot?.profile?.userId||!recordIntent(question)||mutationIntent(question))return null;
  if(nativeIntent(question)&&!trackerIntent(question))return null;
  const selected=selectServiceRecords(snapshot,{question,route,history}),selection=selected.selection;
  if(!selection.serviceKeys.length&&!selection.explicitAll&&!selection.requestedReference&&!noteIntent(question))return null;
  // “My course notes” on Moodle means teaching material, not service trackers.
  if(/^\/dtm(?:\/|$)/.test(route)&&!selection.serviceKeys.length&&!selection.explicitAll&&!selection.requestedReference)return null;
  const keys=[...new Set(selection.serviceKeys.length?selection.serviceKeys:selection.resolvedServiceKeys||[])].filter(key=>services.has(key));
  // Leave/internship have structured drafts/contracts and their own answerer.
  if(keys.some(key=>structuredServices.has(key)))return null;
  if(keys.some(key=>dedicatedServices.has(key))&&!trackerIntent(question))return null;
  if(!keys.length&&!selection.explicitAll&&!selection.requestedReference)return null;

  const zh=/[\u3400-\u9fff]/.test(question);
  const scope=keys.length>4?(zh?`${keys.length}項服務`:`${keys.length} services`):keys.map(key=>plain(services.get(key).title)).join(' / ');
  const prefix=zh?`${scope||'所有服務'}的站內私人追蹤備註：`:`Your saved local tracking notes for ${scope||'all services'}:`;
  const boundary=zh?'這些是您儲存的備註與站內追蹤狀態，不代表校方核准、付款或正式送件。':'These are your saved notes and local tracking statuses, not university approval, payment or official submission.';
  const missing=selection.requestedReference
    ?(zh?'找不到符合指定編號的已儲存站內備註；未以其他紀錄替代。':'No saved local note matches the requested reference; unrelated records have not been substituted.')
    :(zh?'此範圍目前沒有已儲存的站內備註。':'No saved local records were found in this scope.');
  const absence=zh?'這不代表校方系統沒有紀錄。':'This does not establish whether the university holds other records.';
  // The selector already restricts ownership. Keep note records separate from
  // structured leave/contracts even when callers supply a mixed snapshot.
  const rows=selected.records.filter(row=>services.has(row.serviceKey)&&(!row.recordType||row.recordType==='note'));
  const footerFor=linkKeys=>{
    const links=linkKeys.length?linkKeys.map(key=>link(key,zh)).join(' · '):`[${zh?'開啟我的紀錄':'Open my records'}](/school-affairs/records)`;
    const linkOmissions=keys.length>linkKeys.length?(zh?`另有${keys.length-linkKeys.length}項服務連結未列出；請指定服務查看。`:`${keys.length-linkKeys.length} additional service links are not displayed; name a service to open it.`):'';
    return [boundary,links,linkOmissions].filter(Boolean).join('\n\n');
  };
  // Reserve the longest possible link list, then cite the services actually
  // displayed (which may follow oversized earlier records in the selection).
  const longestLinkKeys=keys.toSorted((a,b)=>link(b,zh).length-link(a,zh).length).slice(0,ROW_LIMIT);
  // Reserve room for an omission/absence explanation. Only whole rows fit;
  // an oversized first row must not prevent later short matching rows showing.
  let remaining=SAVED_SERVICE_ANSWER_LIMIT-prefix.length-footerFor(longestLinkKeys).length-600;
  const details=[],displayedKeys=[];
  for(const row of rows){
    if(details.length===ROW_LIMIT)break;
    const state=[row.status,row.reviewStatus].filter(Boolean).map(plain).join(' / ')||(zh?'未記錄狀態':'Status not recorded');
    const dates=[row.startsOn,row.endsOn].filter(Boolean).map(plain).join(' – ');
    const item=`- **${plain(row.title)||(zh?'未命名備註':'Untitled note')}**: ${state}${dates?' · '+dates:''}\n  ${link(row.serviceKey,zh)}${row.notes?'\n  '+(zh?'備註：':'Notes: ')+plain(row.notes):''}`;
    if(item.length+2>remaining)continue;
    details.push(item);displayedKeys.push(row.serviceKey);remaining-=item.length+2;
  }
  const omitted=rows.length-details.length;
  const omissions=omitted?(zh?`顯示${rows.length}筆符合備註中的${details.length}筆；${omitted}筆因顯示上限未列出。沒有截短任何備註；請指定名稱或編號縮小範圍。`:`Showing ${details.length} of ${rows.length} matching saved notes; ${omitted} omitted because of the display limit. No note was shortened; specify a title or reference to narrow the list.`):'';
  const content=rows.length?details.join('\n\n'):[missing,absence].join(' ');
  const linkKeys=[...new Set([...displayedKeys,...keys])].slice(0,ROW_LIMIT);
  return {status:'answered',answer:[prefix,content,omissions,footerFor(linkKeys)].filter(Boolean).join('\n\n'),
    citations:linkKeys.map(citation),suggestedQuestions:[],
    grounding:{source:'account',checkedAt:snapshot.checkedAt,webSearched:false}};
}
