// A submission report is independent of the personal assignment tracker.
// No field here is inferred from tracker status, row timestamps or grade labels.
export type DtmAssignmentSubmittedFile={id?:string;filename:string;href?:string|null};
export type DtmAssignmentDetailReport={
  id:string;userId:string;courseId:string;title:string;
  submissionStatusText:string|null;gradingStatusText:string|null;
  gradingAppearance:'ungraded'|null;
  dueAt:string|null;timingText:string|null;timingAppearance:'late'|null;
  modifiedAt:string|null;submittedFiles:readonly DtmAssignmentSubmittedFile[]|null;
  excellentWorkText?:string|null;canEditSubmission:boolean|null;
  editLabel?:string;editDescription?:string|null;
};
export const dtmAssignmentDetailLabels=['繳交狀態','評分狀態','規定繳交時間','剩餘時間','最後修改','提交檔案','優秀作品'] as const;
export const dtmAssignmentPdfIcon='/school-assets/6f345b4f0cef28e7086d.png';

export function ownDtmAssignmentDetail(report:DtmAssignmentDetailReport|null|undefined,userId:string,courseId?:string):DtmAssignmentDetailReport|null {
  return typeof userId==='string'&&userId.trim()&&report&&Object.hasOwn(report,'userId')&&report.userId===userId
    &&(courseId===undefined||report.courseId===courseId)?report:null;
}

// The host must approve exact authenticated download paths. This does not
// authorize a file: the eventual endpoint must still enforce ownership itself.
// Default-deny, no endpoint invention, external URLs, URL credentials or tokens.
export function dtmPrivateFileHref(href:unknown,approvedPrivateFileHrefs:readonly string[]=[]):string|null {
  if(typeof href!=='string'||!/^\/[A-Za-z0-9/_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(href)
    ||href.startsWith('//')||href.includes('//')||href.split('/').some(segment=>segment==='.'||segment==='..')
    ||!approvedPrivateFileHrefs.includes(href))return null;
  return href;
}

export function dtmAssignmentTimestamp(value:string|null|undefined):string {
  if(typeof value!=='string')return '—';
  const match=value.match(/^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d)$/);
  if(!match)return '—';
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  if(year===0||month<1||month>12||day<1||day>days[month-1])return '—';
  const date=new Date(value);if(Number.isNaN(date.getTime()))return '—';
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(part=>[part.type,part.value]));
  return `${parts.year}年 ${parts.month}月 ${parts.day}日(${parts.weekday}) ${parts.hour}:${parts.minute}`;
}
