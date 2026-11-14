export const housingBedPath='/school-affairs/services/34-1';

const fieldNames={
  bedNumber:['Bed number','床號'],
  academicYear:['Academic year','學年度'],
  semester:['Semester','學期'],
  dormitory:['Dormitory','宿舍名稱'],
  bunk:['Bunk','上下舖'],
  accommodationFee:['Accommodation fee','住宿費'],
  deposit:['Deposit','保證金'],
  subsidyAmount:['Subsidy amount','補助金額'],
};
const unsupportedDetails={
  current_residence:['An assigned bed does not establish current residence.','已分配的床位無法確認目前入住狀態。'],
  payment_confirmation:['The recorded amounts do not prove payment or a refund.','紀錄金額無法確認已繳費或已退款。'],
  official_confirmation:['I can check your saved stu.best assignments. Official university records are unavailable here.','可查看 stu.best 已儲存的床位分配。此處無法查詢校方正式紀錄。'],
  tenancy_dates:['Move-in and move-out dates are unavailable in these saved assignments.','這些床位紀錄未提供入住或退宿日期。'],
};
const zhQuestion=question=>/\p{Script=Han}/u.test(question);

export function housingBedGuide(question,context,signedIn=false){
  const zh=zhQuestion(question),t=(en,tw)=>zh?tw:en;
  const reason=context.selection?.reason;
  const used=context.selection?.unsupported??[];
  const boundary=used.map(key=>unsupportedDetails[key]?.[Number(zh)]).filter(Boolean);
  const result={status:'handoff',answer:'',citations:[],suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
  if(context.foreign||reason==='foreign_request')
    return {...result,answer:t('I can help with dormitory records saved to your own stu.best account. I cannot access another student’s bed assignments.','可查詢你自己的 stu.best 宿舍紀錄。無法查看其他學生的床位分配，也無法存取他們的私人資料。')};
  if(context.excluded&&!context.selection?.fields.length)
    return {...result,status:'answered',answer:t('I skipped the dormitory bed records you asked me to leave out.','已略過你要求不要查詢的宿舍床位紀錄。')};
  const url=signedIn||context.navigation?housingBedPath:'/school-affairs/login?next='+encodeURIComponent(housingBedPath);
  const title=signedIn||context.navigation?t('Open accommodation bed records','開啟住宿床位查詢'):t('Sign in to check your accommodation bed records','登入後查看住宿床位');
  const guidance=reason==='ambiguous_selector'
    ?t('Which academic year and semester should I check? The saved assignments use numbered terms, such as academic year 115, semester 1.','住宿床位紀錄使用學年度與學期。請指定要查詢的學期，例如 115 學年度第 1 學期。')
    :reason==='invalid_route'
      ?t('Open the accommodation bed records page and ask again.','請開啟住宿床位查詢頁面後再詢問。')
      :reason==='unsupported_operation'
        ?boundary.length?'':t('I cannot change your bed here. Open School Affairs to manage accommodation.','此處可以查看已分配的床位和紀錄金額。住宿申請請在校務系統辦理。')
        :'';
  return {...result,status:context.navigation?'answered':reason==='ambiguous_selector'?'clarification':'handoff',
    answer:[guidance,...boundary,'['+title+']('+url+')'].filter(Boolean).join('\n\n'),
    citations:[{chunkId:'directory:accommodation-beds',title,url,claim:title,sourceName:'School Affairs'}]};
}

function displayValue(key,value,zh){
  if(value==null)return zh?'未記錄':'Not recorded';
  if(key==='bunk'&&zh)return value==='upper'?'上舖':value==='lower'?'下舖':String(value);
  return String(value);
}
const markdownText=value=>value.replace(/[\\`*_{}[\]()#+!<>|]/gu,'\\$&');

export function formatHousingBedAnswer(source,question,unsupported=[]){
  const data=JSON.parse(source.content);
  const zh=zhQuestion(question),t=(en,tw)=>zh?tw:en;
  const fields=(data.selection?.fields??[]).filter(key=>Object.hasOwn(fieldNames,key));
  const rows=data.records;
  const count=rows.length;
  const showRows=rows.slice(0,6);
  const term=data.selection?.term;
  const period=[term?.academicYear!=null?t('academic year '+term.academicYear,term.academicYear+' 學年度'):'',
    term?.semester!=null?t('semester '+term.semester,'第 '+term.semester+' 學期'):''].filter(Boolean).join(t(', ','，'));
  const countLabel=period?t(' for '+period,'（'+period+'）'):'';
  const intro=data.readState==='unavailable'
    ?t('Your saved stu.best accommodation assignments are unavailable because the housing records could not be read.','這次無法讀取你在 stu.best 儲存的住宿床位紀錄。')
    :count
      ?t('Here are your saved stu.best accommodation assignments'+countLabel+' (sample data).','以下是你在 stu.best 儲存的住宿床位'+countLabel+'（示範資料）。')
      :data.readState==='empty'
        ?t('I found no saved records for accommodation beds in the stu.best sample data'+countLabel+'.','沒有找到你在 stu.best 儲存的住宿床位紀錄'+countLabel+'。')
        :t('I couldn’t confirm a matching saved accommodation assignment'+countLabel+' from the available records.','現有資料無法確認是否有符合的住宿床位紀錄'+countLabel+'。');
  const lines=showRows.map(row=>'- **'+markdownText(displayValue('bedNumber',row.bedNumber,zh))+'**'
    +fields.filter(key=>key!=='bedNumber').map(key=>'\n  '+fieldNames[key][Number(zh)]+(zh?'：':' ') +markdownText(displayValue(key,row[key],zh))).join(''));
  const limited=data.readState==='partial'||data.excerpted||count>showRows.length;
  const coverage=limited&&count?t('Showing '+showRows.length+' saved rows. Other assignments or period metadata may be unavailable here.','目前顯示 '+showRows.length+' 筆已儲存紀錄。其他紀錄或學期資訊可能未能讀取。'):'';
  const missingPeriod=data.counts?.unresolvedPeriods>0
    ?t('Some period metadata is unavailable.','部分學期資料無法確認。'):'';
  const boundaries=unsupported.map(key=>unsupportedDetails[key]?.[Number(zh)]).filter(Boolean);
  const label=t('Open accommodation bed records','開啟住宿床位查詢');
  const answer=[intro,lines.join('\n'),coverage,missingPeriod,...boundaries,'['+label+']('+housingBedPath+')'].filter(Boolean).join('\n\n');
  const shown=rows.slice(0,12);
  const matched=data.counts?.matching;
  const note=limited
    ?t('Saved sample assignments. Showing '+shown.length+' returned rows. More assignments or period details may be unavailable.',
      '已儲存的示範紀錄。顯示 '+shown.length+' 筆，其他紀錄或學期資訊可能未能讀取。')
    :t('Saved sample assignments. Showing '+shown.length+' of '+matched+' rows.','已儲存的示範紀錄。顯示 '+shown.length+'／'+matched+' 筆。');
  const views=shown.length&&fields.length?[{id:'housing',title:label,url:housingBedPath,
    columns:fields.map(key=>fieldNames[key][Number(zh)]),
    rows:shown.map(row=>fields.map(key=>displayValue(key,row[key],zh))),
    total:Number.isSafeInteger(matched)?matched:shown.length,checkedAt:data.checkedAt,note}]:[];
  return {answer,views};
}
