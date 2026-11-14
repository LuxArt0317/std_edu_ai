import {housingApplicationEvidencePath as path,housingApplicationEvidenceLimits as limits} from './accountHousingApplicationEvidence.js';
const zh=value=>/\p{Script=Han}/u.test(value);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const escape=value=>String(value).replace(/[\\`*_{}[\]()<>!|]/gu,'\\$&').replace(/[\r\n]+/gu,' ');
export function housingApplicationGuide(question,context,signedIn=false){
  const t=(en,tw)=>zh(question)?tw:en,reason=context.selection?.reason;
  if(context.foreign||reason==='foreign_request')return {status:'handoff',answer:t('I can check your own saved housing applications, but cannot access another person’s application or receipt.','可查詢你自己儲存的住宿申請，但無法查看他人的申請或收據。'),citations:[],suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
  const url=signedIn||context.navigation?path:'/school-affairs/login?next='+encodeURIComponent(path),title=t('Open housing applications','開啟住宿申請');
  const intro=context.excluded?t('I skipped the housing applications you asked me to leave out.','已略過你要求不要查詢的住宿申請。')
    :reason==='ambiguous_selector'?t('Specify the recorded academic year and semester, such as 115, semester 1.','請指定紀錄中的學年度與學期，例如115學年度第1學期。')
    :reason==='invalid_route'?t('Open the housing application page and ask again.','請開啟住宿申請頁面後再詢問。')
    :reason?t('I can read saved receipt numbers, submission times and referenced terms. This lookup cannot change an application, issue a document, confirm approval or payment, or reveal the private application form.','可查詢已儲存的收據號碼、提交時間及學期。本查詢無法更改申請、產生文件、確認核准或付款，或顯示私人申請表內容。')
    :signedIn?'':t('Sign in to check your saved housing application receipts.','登入後可查看你儲存的住宿申請收據。');
  return {status:reason==='ambiguous_selector'?'clarification':context.navigation||context.excluded?'answered':'handoff',answer:[intro,'['+title+']('+url+')'].filter(Boolean).join('\n\n'),citations:[{chunkId:'directory:housing-applications',title,url,claim:title,sourceName:'School Affairs'}],suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}
export function formatHousingApplicationAnswer(source,question){
  if(!plain(source)||source.id!=='account:housingApplications'||source.url!==path||!Array.isArray(source.urls)||source.urls.length!==1||source.urls[0]!==path||source.provenance!=='local_demo'
    ||typeof source.content!=='string'||Buffer.byteLength(source.content,'utf8')>limits.responseBytes)throw new TypeError('Invalid housing application evidence.');
  const data=JSON.parse(source.content),counts=data.counts;
  if(!plain(data)||data.collection!=='housingApplications'||!['ok','empty','partial','unavailable'].includes(data.readState)||!Array.isArray(data.records)
    ||data.records.length>limits.rows||!plain(counts)||counts.included!==data.records.length
    ||data.complete!==['ok','empty'].includes(data.readState)||data.capability?.write!==false||data.capability?.documents!==false||data.capability?.approval!==false
    ||data.provenance?.sourceMode!=='local_demo'||data.provenance.officialUniversityData!==false||data.provenance.synchronized!==false)throw new TypeError('Invalid housing application payload.');
  const expected=['academicYear','semester','receiptNumber','submittedAt'];
  for(const row of data.records)if(!plain(row)||Object.keys(row).length!==expected.length||!expected.every(key=>Object.hasOwn(row,key))
    ||typeof row.receiptNumber!=='string'||!row.receiptNumber.trim()||row.receiptNumber.length>200||/[\p{Cc}\p{Cs}]/u.test(row.receiptNumber)
    ||typeof row.submittedAt!=='string'||!Number.isFinite(Date.parse(row.submittedAt))
    ||row.academicYear!==null&&(!Number.isInteger(row.academicYear)||row.academicYear<1||row.academicYear>300)
    ||row.semester!==null&&![1,2].includes(row.semester)||(row.academicYear===null)!==(row.semester===null))throw new TypeError('Invalid housing application row.');
  if(data.readState==='unavailable'){
    if(data.records.length||data.selection!==null||['available','returned','matching','omitted','unread','unresolvedPeriods'].some(key=>counts[key]!==null))throw new TypeError('Invalid unavailable application state.');
  }else{
    if(!plain(data.selection)||Object.keys(data.selection).some(key=>key!=='term')||Object.values(counts).some(value=>!Number.isSafeInteger(value)||value<0)
      ||counts.available!==counts.returned+counts.unread||counts.matching!==counts.included+counts.omitted||counts.matching>counts.returned||counts.unresolvedPeriods>counts.returned
      ||data.readState==='empty'&&counts.matching!==0||data.readState==='ok'&&!data.records.length
      ||data.readState!=='partial'&&(counts.omitted||counts.unread||counts.unresolvedPeriods))throw new TypeError('Invalid application coverage.');
    const term=data.selection.term;
    if(term!==null&&(!plain(term)||Object.keys(term).length!==2||!Object.hasOwn(term,'academicYear')||!Object.hasOwn(term,'semester')
      ||term.academicYear!==null&&(!Number.isInteger(term.academicYear)||term.academicYear<1||term.academicYear>300)||term.semester!==null&&![1,2].includes(term.semester)))throw new TypeError('Invalid application term.');
    if(term&&data.records.some(row=>row.academicYear===null||row.semester===null||term.academicYear!==null&&row.academicYear!==term.academicYear||term.semester!==null&&row.semester!==term.semester))throw new TypeError('Application term mismatch.');
  }
  const t=(en,tw)=>zh(question)?tw:en,display=value=>value===null?t('Unavailable','無法確認'):escape(value);
  const title=t('Saved housing application receipts','已儲存的住宿申請收據');
  const intro=data.readState==='unavailable'?t('Your saved housing applications could not be read; this does not establish that no application exists.','這次無法讀取你儲存的住宿申請；不代表沒有申請紀錄。')
    :data.readState==='empty'?t('The complete lookup found no saved housing application matching this selection.','完整查詢未找到符合條件的住宿申請紀錄。')
    :t('Your saved stu.best housing application metadata (local demo records):','你在stu.best儲存的住宿申請資料（本地模擬紀錄）：');
  const footer=[t('A saved receipt is not university approval, a bed assignment, payment confirmation or an issued official document.','已儲存的收據不代表校方核准、床位分配、付款確認或已核發正式文件。'),'['+title+']('+path+')'].join('\n\n');
  const lines=[],shown=[];
  for(const row of data.records){
    const line='- '+t('Receipt','收據號碼')+': '+display(row.receiptNumber)+'\n  '+t('Academic year','學年度')+': '+display(row.academicYear)+'\n  '+t('Semester','學期')+': '+display(row.semester)+'\n  '+t('Submitted at','提交時間')+': '+display(row.submittedAt);
    if([intro,...lines,line,footer].join('\n\n').length>7000)break;
    lines.push(line);shown.push(row);
  }
  const partial=data.readState==='partial'||shown.length<data.records.length;
  const coverage=partial?t('Only the displayed, verified receipt metadata is included. Other applications or their period metadata remain unknown.','僅列出已核對並可顯示的收據資料；其他申請或其學期資料仍無法確認。'):'';
  return {answer:[intro,...lines,coverage,footer].filter(Boolean).join('\n\n'),views:shown.length?[{id:'housingApplications',title,url:path,
    columns:[t('Receipt','收據號碼'),t('Academic year','學年度'),t('Semester','學期'),t('Submitted at','提交時間')],
    rows:shown.slice(0,12).map(row=>[row.receiptNumber,row.academicYear===null?t('Unavailable','無法確認'):String(row.academicYear),row.semester===null?t('Unavailable','無法確認'):String(row.semester),row.submittedAt]),
    total:counts.matching,checkedAt:data.checkedAt,note:partial
      ?t('A partial view of saved application metadata. More receipts or period details may be unavailable.','這是已儲存申請資料的部分檢視。其他收據或學期資訊可能未能讀取。')
      :t('Showing '+Math.min(12,shown.length)+' of '+counts.matching+' matching saved applications.','顯示 '+Math.min(12,shown.length)+'／'+counts.matching+' 筆符合條件的已儲存申請。')}]:[]};
}
