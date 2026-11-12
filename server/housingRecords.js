/** Source-shaped local housing records; never accepts university credentials or retrieves university records. */
export function mapHousingRecords(periods,applications,assignments) {
  const periodById=new Map(periods.map(row=>[row.id,row]));
  return {
    periods:periods.map(row=>({id:row.id,termLabel:row.term_label,academicYear:row.academic_year,semester:row.semester,
      opensAt:row.opens_at,closesAt:row.closes_at,published:row.published,instructions:row.instructions,
      agreementText:row.agreement_text,sourceMode:row.source_mode,version:row.version})),
    applications:applications.map(row=>({id:row.id,userId:row.user_id,periodId:row.period_id,receiptNumber:row.receipt_number,
      fullName:row.full_name,studentNumber:row.student_number,gender:row.gender,department:row.department,birthDate:row.birth_date,
      homePhone:row.home_phone,mobilePhone:row.mobile_phone,email:row.email,address:row.address,postalCode:row.postal_code,
      category:row.category,healthNotes:row.health_notes,agreementVersion:row.agreement_version,agreementText:row.agreement_text,
      submittedAt:row.submitted_at,version:row.version})),
    assignments:assignments.map(row=>({id:row.id,userId:row.user_id,periodId:row.period_id,
      academicYear:periodById.get(row.period_id)?.academic_year??null,semester:periodById.get(row.period_id)?.semester??null,
      bedNumber:row.bed_number,dormitory:row.dormitory,bunk:row.bunk,
      accommodationFee:row.accommodation_fee==null?null:Number(row.accommodation_fee),deposit:row.deposit==null?null:Number(row.deposit),subsidyAmount:row.subsidy_amount==null?null:Number(row.subsidy_amount),version:row.version}))
      .sort((a,b)=>(b.academicYear??0)-(a.academicYear??0)||(b.semester??0)-(a.semester??0)||a.id.localeCompare(b.id)),
  };
}

export function isHousingRecordQuestion(question,route='',history=[]) {
  const topic=/housing|dormitor(?:y|ies)|\bdorms?\b|bed (?:assignment|allocation|history|number)|住宿|宿舍|床位/i;
  const context=/application|status|history|receipt|period|deadline|apply|room|bed|deposit|subsidy|fee|cost|when|how much|申請|紀錄|單號|期間|截止|床|房|保證金|補助|費|何時|多少/i;
  const other=/scholarships?|student aid|leave|internships?|assignments?|homework|dtm|moodle|grades?|scores?|tuition|courses?|classes|attendance|student (?:id|number)|獎助學金|獎學金|助學|請假|實習|作業|功課|教材|成績|學費|課程|課表|出席|學號/i;
  if(!topic.test(question)&&other.test(question))return false;
  if(topic.test(question)&&/\b(?:my|our|me|i)\b|我|application|status|history|receipt|period|deadline|apply|bed|申請|紀錄|單號|期間|截止|床位/i.test(question))return true;
  return context.test(question)&&(['/school-affairs/services/26-1','/school-affairs/services/34-1'].includes(route)
    ||topic.test(history.filter(item=>item.role==='user').slice(-1)[0]?.content||''));
}

export function answerHousingRecords(question,snapshot,route='',history=[]) {
  if(!isHousingRecordQuestion(question,route,history))return null;
  const records=snapshot.housing||{periods:[],applications:[],assignments:[]};
  const chinese=/[\u3400-\u9fff]/.test(question);
  const periods=new Map(records.periods.map(period=>[period.id,period]));
  const now=Date.parse(snapshot.checkedAt);
  const date=value=>new Intl.DateTimeFormat(chinese?'zh-TW':'en-US',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
  const lines=records.applications.map(row=>`${periods.get(row.periodId)?.termLabel||(chinese?'學期未載入':'Term unavailable')}: ${chinese?'已儲存申請；單號':'application saved; receipt'} ${row.receiptNumber} (${date(row.submittedAt)})`);
  const windows=records.periods.filter(row=>row.published).map(row=>`${row.termLabel}: ${date(row.opensAt)} – ${date(row.closesAt)} (${now<Date.parse(row.opensAt)?(chinese?'尚未開始':'upcoming'):now<Date.parse(row.closesAt)?(chinese?'申請中':'open'):(chinese?'已截止':'closed')})`);
  const beds=records.assignments.map(row=>`${row.academicYear??'—'}-${row.semester??'—'}: ${row.dormitory} ${row.bedNumber}${row.bunk?' · '+(row.bunk==='upper'?(chinese?'上舖':'upper bunk'):(chinese?'下舖':'lower bunk')):''}; ${chinese?'住宿費':'accommodation fee'} ${row.accommodationFee==null?'—':'NT$'+row.accommodationFee}; ${chinese?'保證金':'deposit'} ${row.deposit==null?'—':'NT$'+row.deposit}; ${chinese?'補助金額':'subsidy'} ${row.subsidyAmount==null?'—':'NT$'+row.subsidyAmount}`);
  // Intentionally exclude all application form details, including health notes and contact/identity fields.
  const answer=chinese
    ? `您的 stu.best 住宿紀錄（站內紀錄，非校方住宿申請或配床結果）：\n${lines.length?lines.join('\n'):'尚無申請紀錄。'}\n${windows.length?'申請期間（臺北時間）：\n'+windows.join('\n'):'管理員尚未公布站內申請期間。'}\n${beds.length?'已記錄床位：\n'+beds.join('\n'):'尚無床位紀錄。'}\n可在住宿頁面閱讀同意書、確認申請或補印申請單；已送出的申請不能重複送出。床位與費用由站內管理員維護；此頁不辦理校方繳費、抽籤或包房。`
    : `Your stu.best housing records (local records, not university applications or bed allocations):\n${lines.length?lines.join('\n'):'No application history.'}\n${windows.length?'Application windows (Taipei time):\n'+windows.join('\n'):'No local application period has been published.'}\n${beds.length?'Recorded beds:\n'+beds.join('\n'):'No bed assignments recorded.'}\nRead the agreement, confirm an application or reprint its receipt on the housing page. A submitted application cannot be submitted again. Local administrators maintain beds and fees; this page does not process university payments, lotteries or group room bookings.`;
  const bedView=route==='/school-affairs/services/34-1'||/bed|room|deposit|subsidy|fee|床位|房|保證金|補助|住宿費/i.test(question);
  return {answer,title:chinese?'我的住宿紀錄':'My housing records',url:bedView?'/school-affairs/services/34-1':'/school-affairs/services/26-1'};
}
