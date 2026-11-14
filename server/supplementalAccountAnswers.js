/** Pure presentation of already validated, caller-scoped reader
 * envelopes. This is not an authorization boundary or a verification verdict.
 * Never pass raw RPC results, a workspace snapshot, or browser input here. */
import {aidPaymentsFields,aidPaymentsPaths} from './aidPaymentsContract.js';
export const supplementalAnswerLimits=Object.freeze({answerCharacters:8000,resultBytes:24000,views:3,viewRows:12});
const definitions={
  'account:dtmGradeReport':{title:['Local Moodle grade report','站內 Moodle 成績報告'],path:'/dtm/grades'},
  'account:aidPayments':{title:['Saved student aid and salary records','已儲存助學請款與薪資紀錄'],path:aidPaymentsPaths.claims},
  'account:courseCatalog':{title:['Published course catalog','公開課程目錄'],path:'/school-affairs/services/12-4'},
  'account:enrollmentCertificate':{title:['Enrollment-certificate assessment','在學證明評估'],path:'/school-affairs/services/17-1'},
  'account:dtmSubmissions':{title:['Saved assignment files and reviews','已儲存作業檔案與評閱'],path:'/dtm'},
  'account:studentConduct':{title:['Student conduct','學生個人獎懲'],path:'/school-affairs/services/38-1'},
  'account:studentLoan':{title:['Student loan','就學貸款'],path:'/school-affairs/services/21-1'},
  'account:tuition':{title:['Saved tuition statements and document availability','已儲存學費結算與文件功能'],path:'/school-affairs/services/49-1'},
};
const tuitionPaths={settlement:'/school-affairs/services/49-1',summer:'/school-affairs/services/48-1',extended:'/school-affairs/services/48-2',evening:'/school-affairs/services/48-3'};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const own=(value,key)=>Object.hasOwn(value,key);
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const detailRoute=new RegExp('^/dtm/course/'+uuid+'/assignment/'+uuid+'$','i');
const catalogRoute=new RegExp('^/school-affairs/services/12-4(?:\\?(?:course|syllabus)='+uuid+')?$','i');
const gradeRoute=new RegExp('^/dtm/course/('+uuid+')/grades$');
const gradeCells=['score','maximum','gradeText','rangeText','percentageText','weightText','weightNote','rankText','feedbackText','contributionText'];
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>own(value,key));
const gradeString=(value,max=12000)=>typeof value==='string'&&value.length<=max&&!value.includes('\0')&&!/[\ud800-\udfff]/u.test(value);
const gradeId=value=>typeof value==='string'&&new RegExp('^'+uuid+'$').test(value);
function validateGradeCells(value,item=false){
  if(!exact(value,item?['id','label','activityKind',...gradeCells]:gradeCells))invalid();
  for(const key of gradeCells){const cell=value[key];
    if(cell===null)continue;
    if(key==='score'||key==='maximum'){
      if(typeof cell!=='number'||!Number.isFinite(cell)||cell<0||cell>1000000||Number(cell.toFixed(2))!==cell||key==='maximum'&&cell===0)invalid();
    }else if(!gradeString(cell,key==='feedbackText'?4000:160))invalid();
  }
  if(value.score!==null&&value.maximum!==null&&value.score>value.maximum)invalid();
  if(item&&(!gradeId(value.id)||!gradeString(value.label,320)||!value.label.trim()||![null,'assignment'].includes(value.activityKind)))invalid();
}
function validateGradePayload(envelope,p,evidence){
  const base=['collection','sourceMode','readState','checkedAt','selection','provenance','counts','courseCoverage','courses','course','reportPresent','report','requiresClarification','complete','excerpted','capabilities','rules'];
  if(!exact(p,[...base,...(own(p,'unavailableReason')?['unavailableReason']:[]),...(own(p,'omittedCourseMetadata')?['omittedCourseMetadata']:[])])
    ||p.collection!=='dtmGradeReport'||p.sourceMode!=='local_demo'||evidence.provenance!=='local_demo'||p.readState!==envelope.readState
    ||!['ok','empty','unavailable'].includes(p.readState)||!object(p.selection)||!['overview','choose_course','report'].includes(p.selection.view)
    ||typeof p.requiresClarification!=='boolean'||typeof p.complete!=='boolean'||typeof p.excerpted!=='boolean'||typeof p.rules!=='string')invalid();
  if(!exact(p.provenance,['reportRows','courseMetadataSourceMode','officialUniversityData','synchronizationVerified'])||p.provenance.reportRows!=='local_demo'
    ||p.provenance.courseMetadataSourceMode!==null||p.provenance.officialUniversityData!==false||p.provenance.synchronizationVerified!==false)invalid();
  if(!exact(p.capabilities,['literalReport','officialSync','gradeCalculation','trackerData','submissionReview','write'])||p.capabilities.literalReport!==true
    ||['officialSync','gradeCalculation','trackerData','submissionReview','write'].some(key=>p.capabilities[key]!==false))invalid();
  const coverage=p.courseCoverage,counts=p.counts,reportView=p.selection.view==='report';
  if(!exact(coverage,['loaded','complete','moreAvailable'])||!integer(coverage.loaded)||coverage.loaded>500||typeof coverage.complete!=='boolean'
    ||!(coverage.moreAvailable===null||typeof coverage.moreAvailable==='boolean')||coverage.complete&&coverage.moreAvailable!==false
    ||!exact(counts,['available','matching','included','omitted'])||!integer(counts.included)
    ||['available','matching','omitted'].some(key=>counts[key]!==null&&!integer(counts[key]))||!Array.isArray(p.courses)||p.courses.length>500)invalid();
  const primary=reportView?'/dtm/course/'+p.selection.courseId+'/grades':'/dtm/grades';
  if(evidence.url!==primary||reportView&&!gradeId(p.selection.courseId))invalid();
  const course=(row,overview)=>{
    if(!exact(row,['courseId','title','code','term','url',...(overview?['gradeText']:[])])||!gradeId(row.courseId)
      ||!['title','code','term'].every(key=>gradeString(row[key]))||row.url!=='/dtm/course/'+row.courseId+'/grades'
      ||overview&&row.gradeText!==null&&!gradeString(row.gradeText,160))invalid();
  };
  for(const row of p.courses)course(row,p.selection.view==='overview');
  const urls=[...new Set([primary,...p.courses.map(row=>row.url)])];
  if(new Set(p.courses.map(row=>row.courseId)).size!==p.courses.length||!Array.isArray(evidence.urls)
    ||evidence.urls.length!==urls.length||evidence.urls.some((url,index)=>url!==urls[index]))invalid();
  if(p.course!==null){course(p.course,false);if(!reportView||p.course.courseId!==p.selection.courseId)invalid();}
  if(own(p,'omittedCourseMetadata')&&(typeof p.omittedCourseMetadata!=='boolean'||p.omittedCourseMetadata&&p.course!==null))invalid();
  if(envelope.readState==='unavailable'){
    if(!exact(p.selection,reportView?['view','courseId']:['view'])||p.reportPresent!==null||p.report!==null||p.course!==null||p.courses.length
      ||p.requiresClarification||p.complete||p.excerpted||counts.available!==null||counts.matching!==null||counts.included!==0||counts.omitted!==null
      ||coverage.loaded!==0||coverage.complete||coverage.moreAvailable!==null)invalid();return;
  }
  if(!reportView){
    if(!exact(p.selection,['view'])||p.reportPresent!==null||p.report!==null||p.course!==null||p.requiresClarification!==(p.selection.view==='choose_course')
      ||counts.included!==p.courses.length||coverage.moreAvailable!==!coverage.complete||counts.available!==(coverage.complete?coverage.loaded:null)||coverage.loaded<counts.included
      ||coverage.complete&&(counts.matching===null||counts.matching>counts.available||counts.omitted!==counts.matching-counts.included)
      ||!coverage.complete&&(counts.matching!==null||counts.omitted!==null)
      ||p.complete!==(coverage.complete&&counts.omitted===0)||p.excerpted!==(!p.complete)
      ||p.readState!==(p.courses.length||p.requiresClarification?'ok':coverage.complete?'empty':'ok'))invalid();return;
  }
  if(!exact(p.selection,['view','courseId','itemScope'])||!['all_saved_items','named_items'].includes(p.selection.itemScope)||p.courses.length||p.requiresClarification)invalid();
  if(p.reportPresent===false){
    if(p.readState!=='empty'||p.report!==null||Object.values(counts).some(value=>value!==0)||p.complete===p.excerpted||p.excerpted!==(p.omittedCourseMetadata===true))invalid();return;
  }
  const report=p.report;
  if(p.readState!=='ok'||p.reportPresent!==true||!exact(report,['sourceMode','version','updatedAt','items','total','totalPresent','totalIncluded'])
    ||report.sourceMode!=='local_demo'||!integer(report.version)||report.version<1||typeof report.updatedAt!=='string'||!Number.isFinite(Date.parse(report.updatedAt))
    ||!Array.isArray(report.items)||report.items.length>500||typeof report.totalPresent!=='boolean'||typeof report.totalIncluded!=='boolean'
    ||counts.included!==report.items.length||counts.available===null||counts.matching===null||counts.omitted!==counts.matching-counts.included
    ||counts.matching>counts.available||p.selection.itemScope==='all_saved_items'&&counts.matching!==counts.available
    ||p.complete!==(counts.omitted===0&&!(report.totalPresent&&!report.totalIncluded)&&p.omittedCourseMetadata!==true)||p.excerpted===p.complete)invalid();
  for(const item of report.items)validateGradeCells(item,true);
  if(new Set(report.items.map(item=>item.id)).size!==report.items.length)invalid();
  if(report.total!==null)validateGradeCells(report.total);
  if(report.totalIncluded?report.totalPresent!==(report.total!==null):report.total!==null)invalid();
}
const invalid=()=>{throw new TypeError('Use validated supplemental account evidence envelopes.');};
function allowedUrl(id,url){
  if(id==='account:dtmGradeReport')return url==='/dtm/grades'||typeof url==='string'&&gradeRoute.test(url);
  if(id==='account:aidPayments')return Object.values(aidPaymentsPaths).includes(url);
  if(id==='account:studentConduct')return url===definitions[id].path;
  if(id==='account:studentLoan')return ['', '/progress','/history','/document'].some(suffix=>url===definitions[id].path+suffix);
  return typeof url==='string'&&(id==='account:courseCatalog'?catalogRoute.test(url):id==='account:enrollmentCertificate'?url===definitions[id].path:id==='account:tuition'?Object.values(tuitionPaths).includes(url):url==='/dtm'||detailRoute.test(url));
}
function parse(envelope){
  if(!object(envelope)||!['ok','empty','partial','unavailable'].includes(envelope.readState)||!(envelope.reason===null||typeof envelope.reason==='string')||!object(envelope.evidence))invalid();
  const evidence=envelope.evidence,id=evidence.id;
  if(!own(definitions,id)||!allowedUrl(id,evidence.url)||typeof evidence.content!=='string'||new TextEncoder().encode(evidence.content).byteLength>24000)invalid();
  if(evidence.urls!==undefined&&(!Array.isArray(evidence.urls)||evidence.urls.some(url=>!allowedUrl(id,url))))invalid();
  let payload;try{payload=JSON.parse(evidence.content);}catch{invalid();}
  if(!object(payload)||typeof payload.checkedAt!=='string'||!Number.isFinite(Date.parse(payload.checkedAt)))invalid();
  if(id==='account:dtmGradeReport')validateGradePayload(envelope,payload,evidence);
  else if(id==='account:aidPayments'){
    if(evidence.provenance!=='saved_local'||payload.collection!=='aidPayments'||payload.readState!==envelope.readState
      ||payload.provenance?.source!=='saved_local'||payload.provenance.officialUniversityData!==false||payload.provenance.synchronizationVerified!==false||payload.provenance.currency!==null
      ||!object(payload.selection)||typeof payload.selection.summaryOnly!=='boolean'||!Array.isArray(payload.selection.views)||payload.selection.views.length>2
      ||new Set(payload.selection.views).size!==payload.selection.views.length||!Array.isArray(payload.views)||payload.views.length!==payload.selection.views.length
      ||!object(payload.counts)||typeof payload.complete!=='boolean'||typeof payload.recordsComplete!=='boolean')invalid();
    const summaryOnly=payload.selection.summaryOnly;
    for(const [index,source] of payload.views.entries()){
      if(!object(source)||!own(aidPaymentsPaths,source.view)||source.view!==payload.selection.views[index]||source.url!==aidPaymentsPaths[source.view]
        ||!evidence.urls?.includes(source.url)||!['ok','empty','partial','unavailable'].includes(source.readState)||source.summaryOnly!==summaryOnly
        ||!object(source.counts)||!Array.isArray(source.records)||source.records.length>25||source.counts.included!==source.records.length)invalid();
      if(source.readState==='unavailable'){
        if(source.records.length||source.counts.available!==null||source.counts.returned!==null||source.counts.omitted!==null)invalid();
        continue;
      }
      const counts=source.counts,fields=aidPaymentsFields[source.view].filter(([key])=>key!=='bank_last4').map(([key])=>key);
      if(![counts.available,counts.returned,counts.included,counts.omitted].every(integer)||counts.returned>Math.min(25,counts.available)
        ||counts.included>counts.returned||counts.omitted!==counts.available-counts.included||summaryOnly&&(counts.returned!==0||counts.included!==0)
        ||!summaryOnly&&counts.returned!==Math.min(25,counts.available)
        ||source.readState!==(!summaryOnly&&counts.omitted>0?'partial':counts.available===0?'empty':'ok'))invalid();
      for(const record of source.records){
        if(!object(record)||Object.keys(record).length!==fields.length||fields.some(key=>!own(record,key)))invalid();
        for(const [key,value] of Object.entries(record)){
          const isText=['reason','approval_result','approval_status','appointment_type','payment_period'].includes(key);
          if(value!==null&&(isText?typeof value!=='string'||value.length>600:typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>9999999999.99))invalid();
        }
        if(source.view==='claims'&&(typeof record.reason!=='string'||!record.reason.trim()||record.reason.length>320||record.amount!==null&&record.amount<0))invalid();
      }
    }
    const loaded=payload.views.filter(source=>source.readState!=='unavailable'),allKnown=loaded.length>0&&loaded.length===payload.views.length;
    const omitted=loaded.reduce((sum,source)=>sum+source.counts.omitted,0);
    const state=!loaded.length?'unavailable':!allKnown||!summaryOnly&&omitted?'partial':loaded.every(source=>source.counts.available===0)?'empty':'ok';
    if(state!==envelope.readState||payload.complete!==(allKnown&&(summaryOnly||omitted===0))||payload.recordsComplete!==(allKnown&&!summaryOnly&&omitted===0))invalid();
  }else if(id==='account:courseCatalog'){
    if(payload.collection!=='courseCatalog'||payload.readState!==envelope.readState||!object(payload.provenance)||payload.provenance.sourceMode!=='sample'||payload.provenance.officialUniversityData!==false||payload.provenance.enrollmentEvidence!==false||!Array.isArray(payload.rows)||!object(payload.counts)||!Array.isArray(payload.omittedFields))invalid();
  }else if(id==='account:enrollmentCertificate'){
    if(payload.collection!=='enrollmentCertificate'||payload.sourceMode!=='local_demo'||payload.readState!==envelope.readState||!['ok','empty','unavailable'].includes(envelope.readState)||!(payload.assessment===null||object(payload.assessment)))invalid();
    if(envelope.readState==='ok'&&payload.assessment?.sourceMode!=='local_demo'||envelope.readState!=='ok'&&payload.assessment!==null)invalid();
  }else if(id==='account:tuition'){
    if(payload.collection!=='tuition'||payload.sourceMode!=='local_demo'||payload.readState!==envelope.readState||!['ok','empty','unavailable'].includes(envelope.readState)||!object(payload.selection)||!Array.isArray(payload.selection.choices)||!Array.isArray(payload.selection.requestedViews)||!object(payload.records)||!Array.isArray(payload.records.periods)||!Array.isArray(payload.records.settlements)||!object(payload.counts)||typeof payload.complete!=='boolean'||!Array.isArray(payload.serviceAvailability)||payload.coverageScope!=='selected_settlement_records_and_periods_only')invalid();
    const expected=payload.selection.requestedViews;
    if(expected.length>4||new Set(expected).size!==expected.length||expected.length!==payload.serviceAvailability.length)invalid();
    for(const [index,service]of payload.serviceAvailability.entries())if(!object(service)||service.view!==expected[index]||!own(tuitionPaths,service.view)||service.url!==tuitionPaths[service.view]||service.capability!==(service.view==='settlement'?'literal_settlement_records':service.view==='extended'?'extended_records_unavailable':'verified_file_unavailable')||!evidence.urls?.includes(service.url))invalid();
  }else if(id==='account:studentConduct'||id==='account:studentLoan'){
    if(payload.collection!==id.slice(8)||payload.sourceMode!=='local_demo'||payload.readState!==envelope.readState
      ||!['ok','empty','unavailable'].includes(envelope.readState)||!object(payload.counts)||typeof payload.complete!=='boolean')invalid();
    const rows=id==='account:studentConduct'?payload.records:payload.record===null?[]:[payload.record];
    if(!Array.isArray(rows)||rows.length!==payload.counts.included||rows.some(row=>!object(row)||row.sourceMode!=='local_demo')
      ||envelope.readState!=='ok'&&rows.length)invalid();
  }else if(payload.officialUniversityData!==false||!Array.isArray(payload.records)||payload.records.length>5||!Array.isArray(payload.unavailable)||!object(payload.selection)||!Array.isArray(payload.selection.choices)||!object(payload.counts)||typeof payload.complete!=='boolean')invalid();
  return {envelope,evidence,id,payload};
}
function language(question,requested){
  if(requested!==undefined&&!['en','zh-TW'].includes(requested))invalid();
  if(requested)return requested==='zh-TW';
  if(/\b(?:answer|reply|respond|explain)\b.{0,25}\bin English\b|(?:用|以|請).{0,4}英文(?:回答|說明|回复|回覆)?/iu.test(question))return false;
  if(/\b(?:answer|reply|respond|explain)\b.{0,25}\bin (?:traditional )?(?:Chinese|Mandarin)\b|(?:用|以|請).{0,4}(?:中文|正體|繁體)(?:回答|說明|回复|回覆)?/iu.test(question))return true;
  // A quoted Chinese course/assignment title is not a language preference.
  if(/^\s*(?:what|which|when|where|who|how|show|list|explain|compare|can|do|does|did|is|are|was|were|please)\b/iu.test(question))return false;
  return /[\u3400-\u9fff]/u.test(question);
}
function sectionFor(parsed,question,zh){
  const {envelope,evidence,id,payload:p}=parsed,title=definitions[id].title[Number(zh)];
  const section={id,title,lead:[],items:[],shown:[],view:null,viewCandidates:[],complete:['ok','empty'].includes(envelope.readState),limited:false,usable:envelope.readState!=='unavailable',evidence,group:0,retainedGroups:new Set(),viewSelected:false};
  const t=(en,cn)=>zh?cn:en;
  const display=(value,limit=360)=>{
    if(value===null)return t('not recorded','未記錄');
    if(typeof value==='number'){if(!Number.isFinite(value))invalid();return String(value);}
    if(typeof value==='boolean')return String(value);
    if(typeof value!=='string'||value.includes('\0')||/[\ud800-\udfff]/u.test(value))invalid();
    if(value==='')return t('(blank)','（空白）');
    if(value.length<=limit)return value;
    section.limited=true;let prefix='';for(const point of value){if(prefix.length+point.length>limit-1)break;prefix+=point;}return prefix+'…';
  };
  // Literal record text must not create Markdown links, HTML, instructions or
  // citations. Code spans retain literal punctuation and make embedded URLs inert.
  const literal=value=>{
    // A blank line terminates a Markdown paragraph even inside apparent code
    // fences. Render newlines visibly instead of allowing record text to create
    // a new paragraph, link, HTML block, list or fake source citation.
    const valueText=display(value).replace(/\r\n|[\r\n\u0085\u2028\u2029]/gu,'\\n'),runs=valueText.match(/`+/g)||[],fence='`'.repeat(Math.max(0,...runs.map(run=>run.length))+1);
    return fence+' '+valueText+' '+fence;
  };
  const item=(label,value,header=false)=>section.items.push({text:`${label}: ${literal(value)}`,label,group:section.group,header});
  const group=(label,value)=>{section.group++;item(label,value,true);};
  const row=(...values)=>values.map(value=>display(value,160));
  const field=(record,key)=>own(record,key)?record[key]:t('not included in this lookup','本次查詢未納入');
  const view=(columns,total,note)=>{
    if(!integer(total))invalid();
    section.view={id:id.slice(8),title,url:evidence.url,columns,rows:[],total,checkedAt:p.checkedAt,note};
  };
  if(id==='account:dtmGradeReport'){
    section.lead.push(t('These are literal local_demo Moodle grade-report cells, not an official transcript, a live university sync, grade-tracker entries or file-review results. No grades, totals, percentages, weights, ranks or passing status are calculated.',
      '以下為 local_demo 站內 Moodle 成績報告原文，並非正式成績單、即時校方同步、個人成績追蹤或檔案評閱結果；不計算成績、總分、百分比、權重、排名或及格狀態。'));
    if(evidence.url==='/dtm/grades')section.lead.push(`[${t('Open saved grade-report overview','開啟已儲存成績報告綜覽')}](/dtm/grades)`);
    section.complete&&=p.complete&&!p.requiresClarification;section.limited=p.excerpted;
    if(envelope.readState==='unavailable'){
      section.lead.push(t('The selected native grade-report lookup could not be completed. Report contents and absence remain unknown; tracker marks cannot replace this read.',
        '無法完成所選原生成績報告查詢；內容與是否存在仍未知，不能以追蹤成績代替。'));return section;
    }
    const coverage=p.courseCoverage;
    section.lead.push(t(`Course lookup: ${coverage.loaded} saved courses read; ${coverage.complete?'the local course list is complete':'additional courses may remain unread'}. Course titles, codes and terms have no declared source mode; a term label does not establish current enrollment.`,
      `課程查詢：讀取 ${coverage.loaded} 筆站內課程；${coverage.complete?'站內課程清單已讀取完整':'可能尚有課程未讀取'}。課名、代碼與學期未提供來源模式；學期標籤不代表當期選課。`));
    if(p.selection.view!=='report'){
      section.lead.push(t(`Course rows displayed: ${p.counts.included}; ${p.counts.omitted===null?'the omitted count is unknown':p.counts.omitted+' omitted'}.`,
        `納入課程 ${p.counts.included} 筆；${p.counts.omitted===null?'略去筆數未知':'略去 '+p.counts.omitted+' 筆'}。`));
      if(p.requiresClarification)section.lead.push(p.courses.length
        ?t('Choose one saved course below to open its native grade report. No item feedback, weights or totals were read for these choices.',
          '請在下方選擇一筆已儲存課程以開啟原生成績報告；這些選項尚未讀取項目評語、權重或總分。')
        :t('No exact saved course was selected. Open the overview and specify its course code or title; no report was read.',
          '尚未選定符合的站內課程，請開啟綜覽並指定課程代碼或課名；尚未讀取報告。'));
      else section.lead.push(t('Overview marks are the saved total grade text only. A null mark does not establish that the course report, its items or its saved total is absent.',
        '綜覽分數僅為儲存的總成績文字；null 分數不能據此判定課程報告、項目或儲存總分不存在。'));
      if(envelope.readState==='empty')section.lead.push(t('The successful local course lookup returned no saved courses. This does not establish university enrollment or grade history.',
        '這次成功的站內課程查詢沒有已儲存課程，不代表校方選課或成績歷史。'));
      const choices=p.requiresClarification;
      view(choices?[t('Course','課程'),t('Code','代碼'),t('Literal term','學期原文')]
        :[t('Course','課程'),t('Code','代碼'),t('Literal term','學期原文'),t('Saved total grade text','儲存總成績文字')],p.courses.length,
        t('Included saved course metadata only; neither enrollment nor an official transcript is inferred.','僅顯示納入的站內課程資料，不推定選課或正式成績單。'));
      for(const course of p.courses){
        group(t('Saved course','已儲存課程'),course.title);item(t('Course code','課程代碼'),course.code);item(t('Literal term label','學期標籤原文'),course.term);
        if(!choices)item(t('Saved total grade text','儲存總成績文字'),course.gradeText);
        section.items.push({text:`[${t('Open this grade report','開啟此成績報告')}](${course.url})`,label:'Course report link',group:section.group,header:false});
        section.viewCandidates.push(choices?row(course.title,course.code,course.term):row(course.title,course.code,course.term,course.gradeText));
      }
      return section;
    }
    if(p.course){group(t('Selected saved course','選定站內課程'),p.course.title);item(t('Course code','課程代碼'),p.course.code);item(t('Literal term label','學期標籤原文'),p.course.term);}
    else section.lead.push(p.omittedCourseMetadata
      ?t('Course metadata was omitted by the evidence budget; its title and term are not shown.','課程資料因證據容量限制略去，未顯示課名與學期。')
      :t('This exact local report route has no included course metadata; no title or term is inferred.','這個確切站內報告路徑未納入課程資料，不推定課名或學期。'));
    if(p.reportPresent===false){
      section.lead.push(t('The successful lookup returned no saved native grade report for this selected course. This does not mean zero marks or a missing university transcript.',
        '這次成功查詢未回傳所選課程的站內原生成績報告，不代表成績為零或校方成績單不存在。'));return section;
    }
    const report=p.report;
    section.lead.push(t(`Report item scope: ${p.selection.itemScope==='named_items'?'named matching items':'all saved items'}; ${p.counts.included} included / ${p.counts.matching} selected, ${p.counts.omitted} omitted; ${p.counts.available} saved report items available.`,
      `報告項目範圍：${p.selection.itemScope==='named_items'?'符合名稱的項目':'全部已儲存項目'}；納入 ${p.counts.included}／選取 ${p.counts.matching} 筆，略去 ${p.counts.omitted} 筆，共有 ${p.counts.available} 個儲存項目。`));
    section.lead.push(t('Displayed text and numeric score/maximum metadata are independent saved cells. Null means not recorded; blank text and zero remain distinct. An assignment icon does not establish a submission or file link.',
      '顯示文字與數字分數／滿分中繼資料各自儲存；null 表示未記錄，空白與零不同。作業圖示不代表已繳交，也不提供檔案連結。'));
    if(p.counts.matching===0)section.lead.push(t('The saved report has no selected item rows; this is distinct from an absent report.','這份已儲存報告沒有選取的項目列，與報告不存在不同。'));
    if(!report.totalIncluded)section.lead.push(t('The saved total was not included in this bounded read. Its cells remain unknown here; no total is calculated from items.',
      '本次受限查詢未納入儲存總分，其欄位仍未知；不從項目計算總分。'));
    else if(!report.totalPresent)section.lead.push(t('No course-total object is saved in this report. Item marks are not substituted for a total.',
      '這份報告未儲存課程總分物件，不以項目分數代替總分。'));
    const total=report.totalIncluded&&report.totalPresent?report.total:null;
    view([t('Report item','報告項目'),t('Literal grade text','成績文字原文'),t('Literal weight','權重原文'),t('Literal feedback','評語原文')],report.items.length+Number(total!==null),
      t('Included report cells only, with the explicitly saved course total shown separately. No averages or percentages are derived.','僅顯示納入的報告欄位；另列明確儲存的課程總分，不推算平均或百分比。'));
    const labels={score:['Numeric score metadata','數字分數中繼資料'],maximum:['Numeric maximum metadata','數字滿分中繼資料'],gradeText:['Displayed grade text','顯示成績文字'],rangeText:['Displayed range text','顯示範圍文字'],
      percentageText:['Displayed percentage text','顯示百分比文字'],weightText:['Displayed weight text','顯示權重文字'],weightNote:['Saved weight note','儲存權重註記'],rankText:['Displayed rank text','顯示排名文字'],feedbackText:['Saved feedback text','儲存評語原文'],contributionText:['Displayed contribution text','顯示貢獻文字']};
    const addCells=(label,cells)=>{group(t('Report row','報告列'),label);for(const key of gradeCells)item(t(...labels[key]),cells[key]);section.viewCandidates.push(row(label,cells.gradeText,cells.weightText,cells.feedbackText));};
    // Keep the explicit total's whole record and table row ahead of ordinary
    // item detail when requested. Otherwise the display cap could hide a total
    // that the reader successfully retained. Never calculate one from items.
    const totalFirst=/\btotals?\b|總分|总分|總成績|总成绩/iu.test(question);
    if(total&&totalFirst)addCells(t('Explicitly saved course total','明確儲存的課程總分'),total);
    for(const record of report.items)addCells(record.label,record);
    if(total&&!totalFirst)addCells(t('Explicitly saved course total','明確儲存的課程總分'),total);
    return section;
  }
  if(id==='account:aidPayments'){
    section.lead.push(t('These are saved local aid and salary records, not verified university or bank records. Approval status, amounts, tax and net pay are independent saved fields; none establishes a bank transfer. No currency is declared.','以下為站內儲存的助學請款與薪資紀錄，並非已驗證的校方或銀行紀錄。簽核狀態、金額、稅額與淨額各自記錄，不能據此認定已匯款；資料未指定幣別。'));
    section.complete&&=p.complete;section.limited=p.excerpted===true;
    const summaryOnly=p.selection.summaryOnly,loaded=p.views.filter(source=>source.readState!=='unavailable');
    section.usable=loaded.length>0;
    for(const source of p.views){
      const label=source.view==='salary'?t('Student salary','學生薪資'):t('Student aid claims','助學請款');
      if(source.readState==='unavailable')section.lead.push(t(`${label}: this view could not be read; its record count and contents are unknown.`,`${label}：無法讀取；紀錄筆數與內容仍未知。`));
      else{
        section.lead.push(t(`${label}: ${source.counts.available} saved local records; ${source.counts.included} detail rows included, ${source.counts.omitted} not included.`,`${label}：站內已儲存 ${source.counts.available} 筆；納入 ${source.counts.included} 筆明細，未納入 ${source.counts.omitted} 筆。`));
        if(source.counts.available===0)section.lead.push(t(`The successful ${label.toLowerCase()} lookup returned zero saved local records; this does not establish an institutional or bank history.`,`${label}查詢成功，站內紀錄為零；不代表校方或銀行沒有歷史紀錄。`));
      }
      section.lead.push(`[${t('Open '+label,'開啟'+label)}](${source.url})`);
    }
    if(!loaded.length)return section;
    if(summaryOnly){
      section.lead.push(t('Only total counts were requested and read. Empty detail arrays do not mean no records; amounts, approval fields and salary breakdowns were not retrieved.','本次僅要求並讀取總筆數。明細陣列為空不代表沒有紀錄；未讀取金額、簽核欄位或薪資明細。'));
      view([t('Record view','紀錄類別'),t('Saved local records','站內儲存筆數')],loaded.length,t('Count-only lookup; no payroll amounts, approval result or payment confirmation is shown.','僅查詢筆數，未提供薪資金額、簽核結果或付款確認。'));
      for(const source of loaded)section.viewCandidates.push(row(source.view==='salary'?t('Student salary','學生薪資'):t('Student aid claims','助學請款'),source.counts.available));
      return section;
    }
    section.lead.push(t('Detail rows come from the first saved page of up to 25 per view, further limited by the evidence budget. A filtered count cannot be established from omitted rows. Null means not recorded; blank text and zero remain distinct. Payment-period labels do not designate a current term.','每種類別僅讀取首個已儲存頁面，最多 25 筆，並受證據容量限制。若略去紀錄，不能據此確立篩選後筆數。null 表示未記錄，空白與零不同；給付期間標籤不指定當期學期。'));
    const labels={reason:['Reason','請款事由'],amount:['Claim amount','請領金額'],approval_result:['Approval result','簽核結果'],approval_status:['Approval status','各單位簽核狀態'],
      appointment_type:['Appointment type','任用類別'],payment_period:['Payment-period label','給付起迄標籤'],rate:['Salary rate','單位薪資'],work_units:['Work units','工讀基數'],gross:['Gross pay','給付金額'],
      employer_labor:['Employer labor contribution','勞保（單）'],employer_health:['Employer health contribution','健保（單）'],employer_pension:['Employer pension contribution','退休金（單）'],employer_supplement:['Employer supplement','補充保費（單）'],
      subtotal:['Saved subtotal','小計'],student_labor:['Personal labor deduction','勞保（個）'],student_health:['Personal health deduction','健保（個）'],student_pension:['Personal pension deduction','退休金（個）'],student_supplement:['Personal supplement','補充保費（個）'],tax:['Tax','所得稅'],net:['Net pay','給付淨額']};
    view([t('Record view','紀錄類別'),t('Saved period or reason','儲存期間或事由'),t('Labelled saved fields','已儲存欄位')],loaded.reduce((sum,source)=>sum+source.records.length,0),
      t('Included saved rows only. Display positions do not establish chronology; no bank identifiers or verified payments are included.','僅顯示納入的已儲存紀錄。顯示順序不代表時間先後；不含銀行識別或已驗證付款。'));
    const maximum=Math.max(0,...loaded.map(source=>source.records.length));
    for(let index=0;index<maximum;index++)for(const source of loaded){
      const record=source.records[index];if(!record)continue;
      const label=source.view==='salary'?t('Student salary','學生薪資'):t('Student aid claims','助學請款');
      group(t('Saved record','已儲存紀錄'),`${label} ${index+1}`);
      for(const [key]of aidPaymentsFields[source.view])if(key!=='bank_last4')item(t(...labels[key]),record[key]);
      const summary=source.view==='salary'?`${t('Gross','給付金額')}: ${display(record.gross)}; ${t('Tax','所得稅')}: ${display(record.tax)}; ${t('Net','淨額')}: ${display(record.net)}`
        :`${t('Claim amount','請領金額')}: ${display(record.amount)}; ${t('Approval result','簽核結果')}: ${display(record.approval_result)}; ${t('Approval status','簽核狀態')}: ${display(record.approval_status)}`;
      section.viewCandidates.push(row(label,source.view==='salary'?record.payment_period:record.reason,summary));
    }
    return section;
  }
  if(id==='account:tuition'){
    const asksPaymentConfirmation=/\b(?:confirmed payment|payment (?:confirmed|confirmation)|confirm (?:a |my )?payment|prove (?:i paid|payment))\b|確認付款|付款確認|證明已繳/iu.test(question);
    section.lead.push(asksPaymentConfirmation
      ?t('A saved local_demo settlement statement cannot confirm a payment. This lookup has no payment ledger.','local_demo 站內結算文字無法確認是否付款。本次查詢不含付款流水。')
      :t('Stored local_demo statements only, not official university records or a payment ledger. Statement text is literal; it does not independently establish an amount owed, refund, waiver, eligibility or current term.','僅為 local_demo 站內結算紀錄，並非校方紀錄或付款流水。文字照錄，不能另行認定欠款、退款、減免、資格或當期學期。'));
    for(const service of p.serviceAvailability){
      if(service.view==='settlement')continue;
      const label=service.view==='summer'?t('Summer payment documents','暑修繳費文件'):service.view==='evening'?t('Evening payment documents','進修部繳費文件'):t('Extended-study records','延修繳費紀錄');
      section.lead.push(`${label}: ${service.view==='extended'?t('records unavailable','紀錄功能尚未提供'):t('no verified local file capability','尚無已驗證的站內檔案功能')}. [${t('Open service','開啟服務')}](${service.url})`);
    }
    if(envelope.readState==='unavailable'){
      if(p.selection.scope==='capability_only'){
        section.usable=true;section.lead.push(t('These are service capability limits, not proof that an official document does not exist or that no payment was made. No settlement records were read.','這些是服務功能限制，不代表校方沒有文件或未曾付款；本次未讀取結算紀錄。'));
      }else section.lead.push(t('The selected settlement records could not be read. Their contents and absence remain unknown; charges cannot substitute for them.','無法讀取所選結算紀錄，內容與是否存在仍未知，不能以收費項目代替。'));
      return section;
    }
    for(const key of ['available','matching','included','omitted'])if(!integer(p.counts[key]))invalid();
    section.complete&&=p.complete&&!p.selection.requiresClarification;section.limited=p.excerpted===true;
    section.lead.push(t(`Settlement coverage: ${p.counts.included} included / ${p.counts.matching} selected; ${p.counts.omitted} omitted, ${p.counts.available} saved periods available.`,`結算範圍：納入 ${p.counts.included}／選取 ${p.counts.matching} 筆；略去 ${p.counts.omitted} 筆，共有 ${p.counts.available} 個已儲存期間。`));
    if(p.selection.requiresClarification){
      const counts=p.selection.choiceCounts;if(!object(counts)||!integer(counts.available)||!integer(counts.included)||counts.included!==p.selection.choices.length)invalid();
      section.lead.push(t(`Choose an exact saved period; no current or latest period is inferred. Showing ${counts.included} of ${counts.available} choices.`,`請指定確切的已儲存期間，不會推定當期或最新期間；顯示 ${counts.included}／${counts.available} 個選項。`));
      for(const choice of p.selection.choices){if(!object(choice))invalid();item(t('Period choice / reference','期間選項／參考識別'),`${display(choice.label)} / ${display(choice.id)}`);}return section;
    }
    if(envelope.readState==='empty')section.lead.push(t('The successful owned lookup returned no matching saved period. This does not establish an unpaid balance or missing official statement.','成功的本人資料查詢未回傳符合的已儲存期間，不能據此判定欠款或校方結算單不存在。'));
    const periodsOnly=p.selection.periodsOnly===true,records=periodsOnly?p.records.periods:p.records.settlements;
    if(records.length!==p.counts.included)invalid();
    view(periodsOnly?[t('Saved period','已儲存期間')]:[t('Saved period','已儲存期間'),t('Literal statement','結算原文'),t('Stored update time','紀錄更新時間')],records.length,t('Included local demonstration records only; period labels and timestamps do not establish chronology or a current term.','僅為本次納入的站內示範紀錄；期間標籤及時間不代表學期先後或當期。'));
    for(const record of records){
      if(!object(record)||record.url!==tuitionPaths.settlement)invalid();
      const label=periodsOnly?record.label:record.periodLabel;group(t('Saved period','已儲存期間'),label);
      if(periodsOnly)section.viewCandidates.push(row(label));
      else{if(record.sourceMode!=='local_demo')invalid();item(t('Literal statement text','結算原文'),record.text);item(t('Stored statement updated at','結算紀錄更新時間'),record.updatedAt);section.viewCandidates.push(row(label,record.text,record.updatedAt));}
    }
    if(p.counts.omitted)section.lead.push(t('Some selected statement records were omitted by the evidence budget. Their text is unknown here, not absent.','部分所選結算紀錄因證據容量限制略去；其文字在本次結果中未知，並非不存在。'));
    return section;
  }
  if(envelope.readState==='unavailable'){
    section.lead.push(t('This lookup could not establish the requested record. It does not prove that the record is absent.','這次查詢無法確認所需紀錄，不能據此認定紀錄不存在。'));
    if(envelope.reason==='ambiguous_selection'||p.selection?.requiresClarification){
      section.lead.push(t('Choose a more specific course or assignment.','請指定更明確的課程或作業。'));
      if(id==='account:dtmSubmissions'){
        if(!integer(p.counts.selected))invalid();
        const choices=p.selection.choices.slice(0,5);
        section.lead.push(t(`Showing ${choices.length} of ${p.counts.selected} matching assignment choices.`,`顯示 ${choices.length}／${p.counts.selected} 筆符合作業選項。`));
        section.limited=choices.length<p.counts.selected;
        for(const choice of choices){
          if(!object(choice))invalid();item(t('Choice','可選項目'),`${display(choice.courseTitle)} — ${display(choice.assignmentTitle)}`);section.usable=true;
        }
      }
    }
    return section;
  }
  if(id==='account:studentConduct'||id==='account:studentLoan'){
    const conduct=id==='account:studentConduct';
    section.lead.push(conduct
      ?t('These are saved local_demo conduct records. Only the stored fields are shown.','以下為 local_demo 站內獎懲紀錄，僅顯示已儲存欄位。')
      :t('These are saved local_demo loan fields. Approval, disbursement and payment require separate evidence.','以下為 local_demo 站內貸款欄位。核准、撥款和付款須另有證據。'));
    section.complete&&=p.complete;
    const asksOfficialDocument=/\b(?:download|print|issu(?:e|ance)|official (?:record|document)|pdf|proof of payment)\b|下載|列印|核發|官方紀錄|繳款證明/iu.test(question);
    if(asksOfficialDocument)section.lead.push(t('An official document or download is unavailable through this lookup.','本次查詢無法核發或下載官方文件。'));
    if(envelope.readState==='empty'){
      section.lead.push(t('No matching local record was saved in this account lookup.','本次帳戶查詢未找到站內紀錄。'));
      return section;
    }
    const fields=conduct
      ?[['occurredOnText','Recorded date','紀錄日期'],['academicYearText','Academic year','學年'],['semesterText','Semester','學期'],
        ['yearLevelText','Year level','年級'],['reasonText','Reason','事由'],['conductCode','Code','代碼'],['conductName','Conduct','獎懲'],
        ['quantityText','Recorded quantity','紀錄數量'],['voidStatusText','Void status','註銷狀態'],['studentNumber','Student number','學號'],['studentName','Student name','姓名']]
      :[['currentTermLabel','Recorded term','紀錄學期'],['currentApplicationState','Application state','申請狀態'],
        ['currentApplicationText','Application text','申請文字'],['progressText','Recorded progress','紀錄進度'],['historyCount','Recorded history count','紀錄歷史筆數'],['historyText','History text','歷史文字']];
    const records=conduct?p.records:p.record?[p.record]:[];
    if(!p.complete)section.lead.push(t('Some saved fields or rows were outside the evidence limit.','部分已儲存欄位或紀錄超出證據上限。'));
    view(conduct?[t('Date','日期'),t('Conduct','獎懲'),t('Quantity','數量'),t('Void status','註銷狀態')]
      :[t('Term','學期'),t('Application state','申請狀態'),t('Progress','進度'),t('Recorded history count','紀錄歷史筆數')],records.length,
      t('This table shows the included local_demo evidence.','此表顯示本次納入的 local_demo 站內證據。'));
    for(const record of records){
      group(t('Saved record','已保存紀錄'),conduct?record.conductName:record.currentTermLabel);
      for(const [key,en,cn] of fields)if(own(record,key))item(t(en,cn),record[key]);
      section.viewCandidates.push(conduct?row(record.occurredOnText,record.conductName,record.quantityText,record.voidStatusText)
        :row(record.currentTermLabel,record.currentApplicationState,record.progressText,record.historyCount));
    }
    return section;
  }
  if(id==='account:enrollmentCertificate'){
    section.lead.push(t('Stored local_demo assessment only. Pending-fee flag and assessment status are independent; this is not university verification or document issuance.','僅為 local_demo 站內評估；待繳費旗標與評估狀態各自記錄，並非校方驗證或文件核發。'));
    if(envelope.readState==='empty'){
      section.lead.push(t('No local assessment was returned by this successful lookup. This does not establish your university enrollment status.','這次成功查詢未回傳站內評估，不能據此判定校方學籍狀態。'));return section;
    }
    const a=p.assessment;
    for(const [key,en,cn]of [['academicYear','Recorded academic year','紀錄學年'],['semester','Recorded semester','紀錄學期'],['hasPendingFees','Pending-fee flag (Y/N/null)','待繳費旗標（Y/N/null）'],['status','Recorded assessment status','紀錄評估狀態'],['resultText','Recorded result','紀錄結果'],['assessedAt','Assessment time','評估時間']])item(t(en,cn),a[key]);
    if(a.identity!==undefined){
      if(!object(a.identity))invalid();
      for(const [key,en,cn]of [['studentNumber','Student number','學號'],['studentName','Name','姓名'],['departmentName','Department','系所'],['yearText','Year level','年級'],['classLabel','Class','班級']])if(own(a.identity,key))item(t(en,cn),a.identity[key]);
    }
    section.lead.push(t('Issuance and download capabilities are unavailable.','目前無核發或下載功能。'));
    view([t('Year / semester','學年／學期'),t('Pending-fee flag','待繳費旗標'),t('Status','狀態'),t('Result','結果')],1,t('Local assessment only; this lookup does not establish document issuance.','僅為站內評估，本次查詢不代表已核發文件。'));
    section.viewCandidates.push(row(`${display(a.academicYear)}/${display(a.semester)}`,a.hasPendingFees,a.status,a.resultText));
  }else if(id==='account:courseCatalog'){
    section.lead.push(t('Published sample offerings and syllabus plans; these do not establish enrollment, completed teaching or personal grades.','公開 sample 示範開課資料與課綱計畫，不代表已選課、已完成教學或個人成績。'));
    const counts=p.counts;
    for(const key of ['includedRows','returnedRows'])if(!integer(counts[key]))invalid();
    if(!(counts.total===null||integer(counts.total))||p.rows.length!==counts.includedRows)invalid();
    section.complete&&=counts.complete===true;
    section.lead.push(t(`Lookup coverage: ${counts.includedRows} included / ${counts.returnedRows} returned; matching total ${counts.total===null?'unknown':counts.total}.`,`查詢範圍：納入 ${counts.includedRows}／回傳 ${counts.returnedRows} 筆；符合條件總數 ${counts.total===null?'未知':counts.total}。`));
    if(envelope.readState==='empty')section.lead.push(t('No published offering matched this lookup. This is not an enrollment result.','這次查詢沒有符合的公開開課資料；這不是選課結果。'));
    if(envelope.reason==='ambiguous_selection')section.lead.push(t('Several offerings match; select one before treating any syllabus as the answer.','有多筆符合的開課資料，請先指定一筆，才能確認所需課綱。'));
    if(p.omittedFields.length)section.lead.push(t('Some source fields were omitted by the evidence budget; missing values cannot establish absence.','部分來源欄位因證據容量限制未納入，不能據此判定資料不存在。'));
    view([t('Code','代碼'),t('Course','課程'),t('Teacher','教師'),t('Year / semester','學年／學期')],p.rows.length,t('Included published sample rows only; matching total may be larger. Not student enrollment.','僅為本次納入的公開示範資料，符合總數可能較多，並非學生選課。'));
    for(const course of p.rows){
      if(!object(course))invalid();
      group(t('Offering','開課資料'),`${display(course.course_code)} — ${display(course.course_name)}`);
      const facts=[['instructor','Teacher','教師'],['term_label','Recorded term','紀錄學期'],['academicYearText','Recorded academic year','紀錄學年'],['semesterText','Recorded semester','紀錄學期'],['credits','Credits','學分'],['prerequisite','Prerequisite text','先修說明'],
        ['department_name','Department','系所'],['admission_name','Admission program','入學學制'],['instructor2','Second teacher','第二位教師'],['room1','Room','教室'],['room2','Second room','第二間教室'],['capacity','Capacity','容額'],['enrolled_count','Recorded enrollment count','紀錄修課人數'],['selected_count','Recorded selection count','紀錄選課人數'],['audit_capacity','Audit capacity','旁聽容額'],['audit_count','Audit count','旁聽人數'],['lecture_hours','Lecture hours','講授時數'],['practice_hours','Practice hours','實習時數'],['summer_weeks','Summer weeks','暑修週數'],
        ['required','Required flag','必修旗標'],['grade','Year level','年級'],['open_grades','Open year levels','開放年級'],['course_nature','Course nature','課程性質'],['reserved_departments','Reserved departments','保留系所'],['description','Description','說明'],['english_name','English course name','英文課程名稱'],['module','Module','模組'],['shared_teaching','Shared-teaching flag','合班旗標'],['open_other_departments','Other-department flag','跨系旗標'],['cross_admission','Cross-program flag','跨學制旗標'],['e_course','Digital-course flag','數位課程旗標'],['english_taught','English-taught flag','英語授課旗標'],['foreign_language','Foreign-language flag','外語旗標'],['immersion','Immersion flag','沉浸旗標'],['graduating_course','Graduating-course flag','畢業班課程旗標']];
      for(const [key,en,cn]of facts)if(own(course,key))item(t(en,cn),course[key]);
      if(Array.isArray(course.meetings))for(const meeting of course.meetings){if(!object(meeting)||!Array.isArray(meeting.periods))invalid();item(t('Planned weekday / period codes','計畫星期／節次代碼'),`${display(meeting.weekday)} / ${meeting.periods.map(period=>display(period)).join(', ')}`);}
      if(Array.isArray(course.program_codes))item(t('Program codes','學程代碼'),course.program_codes.map(code=>display(code)).join(', '));
      section.viewCandidates.push(row(course.course_code,course.course_name,field(course,'instructor'),own(course,'term_label')?course.term_label:`${display(field(course,'academicYearText'))}/${display(field(course,'semesterText'))}`));
      if(object(course.syllabus)){
        const syllabus=course.syllabus;
        const keys=[['objectives','Objectives','教學目標'],['materials','Materials','教材'],['references','References','參考資料'],['language','Teaching language','授課語言'],['teaching_mode','Teaching mode','教學型態'],['office_hours','Office hours','諮商時間'],['advice','Recorded advice','紀錄建議'],['certifications','Certification guidance','證照輔導'],['level','Syllabus level','課綱層級']];
        for(const [key,en,cn]of keys)if(own(syllabus,key))item(t(en,cn),syllabus[key]);
        if(Array.isArray(syllabus.grading))for(const [index,grade]of syllabus.grading.entries()){
          if(!object(grade)||!Array.isArray(grade.methods))invalid();item(t(`Grading row ${index+1}: weight / method codes`,`評分第 ${index+1} 項：比重／方法代碼`),`${display(grade.weight)} / ${grade.methods.map(method=>display(method)).join(', ')}`);
        }
        if(Array.isArray(syllabus.weeks)&&/week|schedule|progress|syllabus|outline|週|進度|課綱|大綱/iu.test(question))for(const [index,week]of syllabus.weeks.entries()){
          if(!object(week))invalid();if(week.date||week.content||week.notes)item(t(`Planned week ${index+1}`,`計畫第 ${index+1} 週`),`${display(week.date)} · ${display(week.content)} · ${display(week.notes)}`);
        }
        for(const [key,en,cn]of [['capabilities','Capability weights (recorded order)','能力比重（紀錄順序）'],['meanings','Theme codes','主題代碼'],['sdgs','SDG codes','SDG 代碼']])if(Array.isArray(syllabus[key]))item(t(en,cn),syllabus[key].map(value=>display(value)).join(', '));
      }
    }
  }else{
    section.lead.push(t('Saved local file metadata only; no file content was read and no submission action occurred. Tracker status and gradebook marks are separate.','僅為已儲存的站內檔案中繼資料；未讀取檔案內容，也未執行繳交。追蹤狀態與成績簿分開記錄。'));
    const counts=p.counts;
    for(const key of ['selected','loaded','included','omitted','unavailable'])if(!integer(counts[key]))invalid();
    if(counts.included!==p.records.length)invalid();section.complete&&=p.complete;
    section.lead.push(t(`Lookup coverage: ${counts.included} included / ${counts.selected} selected; ${counts.omitted} omitted, ${counts.unavailable} unavailable.`,`查詢範圍：納入 ${counts.included}／選取 ${counts.selected} 筆；略去 ${counts.omitted} 筆、無法讀取 ${counts.unavailable} 筆。`));
    if(envelope.readState==='empty')section.lead.push(t('No owned assignment was selected by this lookup; this does not prove that no submissions exist elsewhere.','這次查詢未選到所屬作業，不能據此認定其他作業沒有繳交。'));
    view([t('Course / assignment','課程／作業'),t('Committed file','已提交檔案'),t('Current review','目前版本評閱'),t('Current grade','目前版本評分')],p.records.length,t('Included assignments only. Current-file reviews, pending reservations and retained older reviews are separate.','僅為本次納入的作業；目前檔案評閱、保留中的上傳與較舊版本評閱分開處理。'));
    for(const record of p.records){
      if(!object(record)||!['sample','personal'].includes(record.assignmentSourceMode)||!detailRoute.test(record.url))invalid();
      const submission=record.submission,current=submission?.currentReview;
      group(t('Assignment / course / provenance','作業／課程／來源'),`${display(record.assignmentTitle)} / ${display(record.courseTitle)} / ${record.assignmentSourceMode}`);
      item(t('Current recorded due time','目前紀錄截止時間'),record.dueAt);
      if(submission===null)item(t('Committed file','已提交檔案'),t('No committed file is recorded for this selected assignment.','這筆選定作業未記錄已提交檔案。'));
      else{
        if(!object(submission)||submission.sourceMode!=='local_submission'||!object(submission.currentFile))invalid();
        item(t('Committed filename / bytes','已提交檔名／位元組'),`${display(submission.currentFile.filename)} / ${display(submission.currentFile.sizeBytes)}`);
        item(t('Current-file media type','目前檔案媒體類型'),submission.currentFile.contentType);
        item(t('Current-file committed at','目前檔案提交時間'),submission.currentFile.committedAt);
        item(t('Saved submission version','已儲存繳交版本'),submission.version);
        item(t('Submitted at','提交時間'),submission.submittedAt);item(t('Due time recorded at submission','提交時記錄的截止時間'),submission.dueAtAtSubmission);
        item(t('Content modified at','內容修改時間'),submission.contentModifiedAt);
        if(current===null)item(t('Current-file review','目前檔案評閱'),t('No review is recorded for the current file.','目前檔案未記錄評閱。'));
        else{if(!object(current))invalid();item(t('Current-file review status','目前檔案評閱狀態'),current.status);item(t('Current-file grade','目前檔案評分'),current.gradeText);item(t('Current-file feedback','目前檔案評語'),current.feedback);item(t('Current-file reviewed at','目前檔案評閱時間'),current.reviewedAt);}
      }
      if(record.pendingReservation!==null){
        if(!object(record.pendingReservation)||record.pendingReservation.state!=='reserved_not_committed')invalid();
        item(t('Pending reservation, not a committed upload','上傳保留，並非已提交檔案'),record.pendingReservation.filename);
        item(t('Reservation expires at','上傳保留到期時間'),record.pendingReservation.expiresAt);
      }
      if(!object(record.reviewHistory)||!Array.isArray(record.reviewedRetiredFiles))invalid();
      item(t('Retained older reviews included / available','已納入／可用的較舊評閱'),`${display(record.reviewHistory.included)} / ${display(record.reviewHistory.available)}`);
      if(/older|previous|retired|histor|revision|replace|old file|\ball\b|舊|先前|歷史|版本|替換|全部|所有|完整/iu.test(question))for(const retired of record.reviewedRetiredFiles){
        if(!object(retired)||!object(retired.file)||!object(retired.review))invalid();
        item(t('Older file / its review status / its grade','較舊檔案／該版本評閱狀態／該版本評分'),`${display(retired.file.filename)} / ${display(retired.review.status)} / ${display(retired.review.gradeText)}`);
        item(t('Older-file feedback','較舊檔案評語'),retired.review.feedback);
        item(t('Older-file reviewed at','較舊檔案評閱時間'),retired.review.reviewedAt);
      }
      section.viewCandidates.push(row(`${display(record.courseTitle)} / ${display(record.assignmentTitle)}`,submission===null?t('No committed file recorded','未記錄已提交檔案'):submission.currentFile.filename,
        current?.status??t('No current-file review recorded','未記錄目前檔案評閱'),current?.gradeText??null));
    }
    section.lead.push(t('Retained reviews are not a complete upload history. A changed current due date does not establish lateness at submission.','保留的評閱不是完整上傳歷史；目前截止日期有變動時，不能據此判定當時是否遲交。'));
  }
  return section;
}

/** No network, mutations, model calls or verification status. The caller must
 * supply these same source IDs/content to independent answer verification. */
export function formatSupplementalAccountAnswers(results,{question='',language:requestedLanguage}={}){
  if(!Array.isArray(results)||results.length>Object.keys(definitions).length||typeof question!=='string'||question.length>12000)invalid();
  const parsed=results.map(parse);if(new Set(parsed.map(item=>item.id)).size!==parsed.length)invalid();
  const zh=language(question,requestedLanguage),sections=parsed.map(item=>sectionFor(item,question,zh));
  const interests=[/objectiv|goal|目標/iu,/feedback|comment|評語|評閱/iu,/grad(?:e|ing)|score|評分|成績|比重/iu,/weight|權重|权重/iu,/percentage|百分比/iu,/rank|排名/iu,/range|範圍|范围/iu,/contribution|貢獻|贡献/iu,/maximum|滿分|满分/iu,/material|textbook|教材/iu,/reference|參考/iu,/room|classroom|教室/iu,/prerequisite|先修/iu,/office hours|諮商時間/iu,/statement|text|原文|內容/iu,/week|週/iu,/net|tax|gross|salary|amount|approval|淨額|所得稅|薪資|金額|簽核/iu];
  const preferred=label=>interests.some(pattern=>pattern.test(question)&&pattern.test(label))?0:1;
  // Prioritize requested fields within each record, never move a child's facts
  // under another record. A rejected heading also rejects all its child fields.
  for(const section of sections){
    const groups=new Map();for(const item of section.items){if(!groups.has(item.group))groups.set(item.group,[]);groups.get(item.group).push(item);}
    section.items=[...groups.values()].flatMap(items=>items.sort((a,b)=>Number(b.header)-Number(a.header)||preferred(a.label)-preferred(b.label)));
  }
  const topics={'account:dtmGradeReport':/moodle|dtm|grade report|gradebook|成績報告|成绩报告/iu,'account:aidPayments':/student aid|financial aid|salary|payroll|助學|薪資|工讀/iu,'account:studentConduct':/conduct|disciplin|獎懲/iu,'account:studentLoan':/loan|貸款|學貸/iu,'account:courseCatalog':/catalog|syllabus|offering|課綱|大綱|開課/iu,'account:enrollmentCertificate':/certificate|enrolment|enrollment|在學|在籍|學籍證明/iu,'account:dtmSubmissions':/file|upload|submission|assignment|feedback|作業|檔案|評語|上傳/iu,'account:tuition':/tuition|settlement|statement|summer|evening|學費|結算|暑修|進修部|延修/iu};
  const rankedViews=sections.filter(section=>section.view).map((section,index)=>({section,index,match:question.search(topics[section.id])})).sort((a,b)=>Number(b.match>=0)-Number(a.match>=0)||Number(b.section.viewCandidates.length>0)-Number(a.section.viewCandidates.length>0)||(a.match>=0&&b.match>=0?a.match-b.match:0)||a.index-b.index);
  const selectedSet=new Set(rankedViews.slice(0,supplementalAnswerLimits.views).map(value=>value.section));
  const selectedViews=sections.filter(section=>selectedSet.has(section));
  for(const section of selectedViews)section.viewSelected=true;
  const omittedViews=rankedViews.length-selectedViews.length;
  let omittedItems=sections.reduce((total,section)=>total+section.items.length,0),omittedViewRows=sections.reduce((total,section)=>total+section.viewCandidates.length,0);
  const result=()=>({status:sections.some(section=>section.usable)?'answered':'abstained',answer:sections.map(section=>[
    section.title,...section.lead,...section.shown.map(item=>(section.id==='account:dtmGradeReport'&&item.group&&!item.header?'  - ':'- ')+item.text),
    (section.limited||section.shown.length<section.items.length||section.viewCandidates.length>(section.view?.rows.length??0))
      ?(zh?'顯示內容已節錄，省略部分不代表沒有紀錄。':'Display excerpt: omitted fields or rows do not establish absence.'):null,
    section.view&&!section.viewSelected?(zh?'此來源表格因三張表格的顯示上限省略，文字結果與來源連結仍保留。':'This source table is omitted by the three-table display limit; its text result and source link remain available.'):null,
    `[${zh?'開啟站內紀錄':'Open local records'}](${section.evidence.url})`,
  ].filter(Boolean).join('\n')).join('\n\n')||(zh?'沒有可用的補充查詢結果。':'No supplemental lookup result is available.'),
    citations:sections.map(section=>({chunkId:section.id,claim:'Supporting local read result',title:section.title,sourceName:section.title,url:section.evidence.url,locator:null,effectiveAt:null,reviewedAt:null})),
    views:selectedViews.map(section=>({...section.view,note:section.view.note+((section.limited||section.view.rows.length<section.viewCandidates.length)?(zh?' 顯示已節錄。':' Display excerpted.'):'')})),sourceIds:sections.map(section=>section.id),
    complete:sections.length>0&&omittedViews===0&&sections.every(section=>section.complete&&!section.limited&&section.shown.length===section.items.length&&section.viewCandidates.length===(section.view?.rows.length??0)),
    formatting:{limited:sections.some(section=>section.limited)||omittedItems>0||omittedViewRows>0||omittedViews>0,omittedItems,omittedViewRows,omittedViews}});
  const fits=()=>{const value=result();return value.answer.length<=supplementalAnswerLimits.answerCharacters&&bytes(value)<=supplementalAnswerLimits.resultBytes;};
  if(!fits())throw new RangeError('Supplemental answer metadata exceeds its budget.');
  // Round-robin whole display items so one large syllabus cannot hide another
  // source's assessment or file result. No record or JSON string is cut in half.
  const maximum=Math.max(0,...sections.map(section=>section.items.length));
  for(let index=0;index<maximum;index++)for(const section of sections)if(index<section.items.length){
    const item=section.items[index];if(item.group&&!item.header&&!section.retainedGroups.has(item.group))continue;
    section.shown.push(item);omittedItems--;if(!fits()){section.shown.pop();omittedItems++;}else if(item.header)section.retainedGroups.add(item.group);
  }
  for(const section of selectedViews)for(const values of section.viewCandidates){
    if(section.view.rows.length>=supplementalAnswerLimits.viewRows)continue;
    section.view.rows.push(values);omittedViewRows--;if(!fits()){section.view.rows.pop();omittedViewRows++;}
  }
  const output=result();if(!fits())throw new RangeError('Supplemental answer exceeds its budget.');return output;
}
