/** Pure presentation of already validated, caller-scoped reader
 * envelopes. This is not an authorization boundary or a verification verdict.
 * Never pass raw RPC results, a workspace snapshot, or browser input here. */
export const supplementalAnswerLimits=Object.freeze({answerCharacters:8000,resultBytes:24000,views:3,viewRows:12});
const definitions={
  'account:courseCatalog':{title:['Published course catalog','公開課程目錄'],path:'/school-affairs/services/12-4'},
  'account:enrollmentCertificate':{title:['Enrollment-certificate assessment','在學證明評估'],path:'/school-affairs/services/17-1'},
  'account:dtmSubmissions':{title:['Saved assignment files and reviews','已儲存作業檔案與評閱'],path:'/dtm'},
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
const invalid=()=>{throw new TypeError('Use validated supplemental account evidence envelopes.');};
function allowedUrl(id,url){
  return typeof url==='string'&&(id==='account:courseCatalog'?catalogRoute.test(url):id==='account:enrollmentCertificate'?url===definitions[id].path:id==='account:tuition'?Object.values(tuitionPaths).includes(url):url==='/dtm'||detailRoute.test(url));
}
function parse(envelope){
  if(!object(envelope)||!['ok','empty','partial','unavailable'].includes(envelope.readState)||!(envelope.reason===null||typeof envelope.reason==='string')||!object(envelope.evidence))invalid();
  const evidence=envelope.evidence,id=evidence.id;
  if(!own(definitions,id)||!allowedUrl(id,evidence.url)||typeof evidence.content!=='string'||new TextEncoder().encode(evidence.content).byteLength>24000)invalid();
  if(evidence.urls!==undefined&&(!Array.isArray(evidence.urls)||evidence.urls.some(url=>!allowedUrl(id,url))))invalid();
  let payload;try{payload=JSON.parse(evidence.content);}catch{invalid();}
  if(!object(payload)||typeof payload.checkedAt!=='string'||!Number.isFinite(Date.parse(payload.checkedAt)))invalid();
  if(id==='account:courseCatalog'){
    if(payload.collection!=='courseCatalog'||payload.readState!==envelope.readState||!object(payload.provenance)||payload.provenance.sourceMode!=='sample'||payload.provenance.officialUniversityData!==false||payload.provenance.enrollmentEvidence!==false||!Array.isArray(payload.rows)||!object(payload.counts)||!Array.isArray(payload.omittedFields))invalid();
  }else if(id==='account:enrollmentCertificate'){
    if(payload.collection!=='enrollmentCertificate'||payload.sourceMode!=='local_demo'||payload.readState!==envelope.readState||!['ok','empty','unavailable'].includes(envelope.readState)||!(payload.assessment===null||object(payload.assessment)))invalid();
    if(envelope.readState==='ok'&&payload.assessment?.sourceMode!=='local_demo'||envelope.readState!=='ok'&&payload.assessment!==null)invalid();
  }else if(id==='account:tuition'){
    if(payload.collection!=='tuition'||payload.sourceMode!=='local_demo'||payload.readState!==envelope.readState||!['ok','empty','unavailable'].includes(envelope.readState)||!object(payload.selection)||!Array.isArray(payload.selection.choices)||!Array.isArray(payload.selection.requestedViews)||!object(payload.records)||!Array.isArray(payload.records.periods)||!Array.isArray(payload.records.settlements)||!object(payload.counts)||typeof payload.complete!=='boolean'||!Array.isArray(payload.serviceAvailability)||payload.coverageScope!=='selected_settlement_records_and_periods_only')invalid();
    const expected=payload.selection.requestedViews;
    if(expected.length>4||new Set(expected).size!==expected.length||expected.length!==payload.serviceAvailability.length)invalid();
    for(const [index,service]of payload.serviceAvailability.entries())if(!object(service)||service.view!==expected[index]||!own(tuitionPaths,service.view)||service.url!==tuitionPaths[service.view]||service.capability!==(service.view==='settlement'?'literal_settlement_records':service.view==='extended'?'extended_records_unavailable':'verified_file_unavailable')||!evidence.urls?.includes(service.url))invalid();
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
  if(id==='account:tuition'){
    section.lead.push(t('Stored local_demo statements only, not official university records or a payment ledger. Statement text is literal; it does not independently establish an amount owed, refund, waiver, eligibility or current term.','僅為 local_demo 站內結算紀錄，並非校方紀錄或付款流水。文字照錄，不能另行認定欠款、退款、減免、資格或當期學期。'));
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
  if(!Array.isArray(results)||results.length>4||typeof question!=='string'||question.length>12000)invalid();
  const parsed=results.map(parse);if(new Set(parsed.map(item=>item.id)).size!==parsed.length)invalid();
  const zh=language(question,requestedLanguage),sections=parsed.map(item=>sectionFor(item,question,zh));
  const interests=[/objectiv|goal|目標/iu,/feedback|comment|評語|評閱/iu,/grad(?:e|ing)|score|評分|成績|比重/iu,/material|textbook|教材/iu,/reference|參考/iu,/room|classroom|教室/iu,/prerequisite|先修/iu,/office hours|諮商時間/iu,/statement|text|原文|內容/iu,/week|週/iu];
  const preferred=label=>interests.some(pattern=>pattern.test(question)&&pattern.test(label))?0:1;
  // Prioritize requested fields within each record, never move a child's facts
  // under another record. A rejected heading also rejects all its child fields.
  for(const section of sections){
    const groups=new Map();for(const item of section.items){if(!groups.has(item.group))groups.set(item.group,[]);groups.get(item.group).push(item);}
    section.items=[...groups.values()].flatMap(items=>items.sort((a,b)=>Number(b.header)-Number(a.header)||preferred(a.label)-preferred(b.label)));
  }
  const topics={'account:courseCatalog':/catalog|syllabus|offering|課綱|大綱|開課/iu,'account:enrollmentCertificate':/certificate|enrolment|enrollment|在學|在籍|學籍證明/iu,'account:dtmSubmissions':/file|upload|submission|assignment|feedback|作業|檔案|評語|上傳/iu,'account:tuition':/tuition|settlement|statement|summer|evening|學費|結算|暑修|進修部|延修/iu};
  const rankedViews=sections.filter(section=>section.view).map((section,index)=>({section,index,match:question.search(topics[section.id])})).sort((a,b)=>Number(b.match>=0)-Number(a.match>=0)||Number(b.section.viewCandidates.length>0)-Number(a.section.viewCandidates.length>0)||(a.match>=0&&b.match>=0?a.match-b.match:0)||a.index-b.index);
  const selectedSet=new Set(rankedViews.slice(0,supplementalAnswerLimits.views).map(value=>value.section));
  const selectedViews=sections.filter(section=>selectedSet.has(section));
  for(const section of selectedViews)section.viewSelected=true;
  const omittedViews=rankedViews.length-selectedViews.length;
  let omittedItems=sections.reduce((total,section)=>total+section.items.length,0),omittedViewRows=sections.reduce((total,section)=>total+section.viewCandidates.length,0);
  const result=()=>({status:sections.some(section=>section.usable)?'answered':'abstained',answer:sections.map(section=>[
    section.title,...section.lead,...section.shown.map(item=>'- '+item.text),
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
