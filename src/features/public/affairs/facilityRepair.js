export const repairPaths={report:'/school-affairs/services/45-1',history:'/school-affairs/services/45-1/history',manage:'/school-affairs/admin/repairs'};
export const repairStatuses={submitted:['已送出','Submitted'],in_progress:['處理中','In progress'],resolved:['已完成','Resolved'],cancelled:['已取消','Cancelled']};
export const repairId=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);

export function repairQuestion(question){
  const subject=/\b(?:facility repair|facilities repair|online repair|facilities maintenance|maintenance request|repair report|repair ticket|repair request|report (?:a )?(?:broken|damaged) (?:light|lock|door|air conditioner))\b|報修|設備修繕/iu;
  if(!subject.test(question))return null;
  if(/\b(?:dorm|dormitory|residence hall)\b.{0,18}\b(?:wi-?fi|internet|network)\b|宿網|宿舍網路/iu.test(question))return 'network';
  if(/\b(?:my|our|status|history|track|did i|cancel)\b|我的|進度|紀錄|處理情形|取消/iu.test(question))return 'history';
  return 'report';
}
