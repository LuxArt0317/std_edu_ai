const id='[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
export const dtmAssignmentListRoute=new RegExp('^/dtm/(?:course/('+id+')/)?assignments/?$','u');
const topic=/\b(?:assignments?|homework)\b|作業|作业/iu;
const request=/\b(?:which|what|list|show|find|read|how many|count|do i have|are there|due|deadline|unfinished|completed)\b|哪些|什麼|什么|多少|幾|几|顯示|显示|列出|查詢|查询|截止|未完成|已完成/iu;
const foreign=/\b(?:another|other|all) (?:students?|people|users?|accounts?)\b|\b(?:his|her|their|my (?:friend|classmate|roommate))\s+(?:saved |moodle |dtm )*(?:assignments?|homework)\b|\b(?!course['’]s\b|today['’]s\b|tomorrow['’]s\b)[\p{L}\p{N}_-]+['’]s (?:saved |moodle |dtm )*(?:assignments?|homework)\b|\b(?:assignments?|homework)\s+(?:for|owned by|belonging to)\s+(?!(?:me|my|this|the|today|tomorrow|review|practice)\b)[\p{L}][\p{L}\d_-]*\b|別人|别人|他人|其他學生|其他学生|同學的|同学的|(?:他|她)的|[\p{Script=Han}]{2,6}(?:同學|同学)的/iu;
const negative=/^(?:(?:please|also)\s+)*(?:do not|don['’]t|never|exclude|skip|without|not(?! only))\b|^(?:請|请)?(?:不要|排除|略過|略过)/iu;
const operation=/^(?:(?:please|also|can you|help me)\s+)*(?:delete|edit|change|remove|rename|mark|complete|upload|submit|create|save|add|update|grade|send|turn in)(?:\s|$)|^(?:請|请|幫我|帮我)?(?:刪除|删除|修改|編輯|编辑|上傳|上传|提交|送出|新增|標記|标记)/iu;
const excludedFields=/\b(?:without|do not (?:show|read|disclose)|excluding|exclude)\b|不要(?:顯示|显示|讀取|读取)|排除/iu;
const file=/\b(?:files? (?:i |were |was |have |has been )?(?:submitted|uploaded|attached)|(?:submitted|uploaded|attached) files?|actual (?:submission|upload)|submission (?:files?|proof|receipts?)|upload history|assignment submissions?)\b|作業繳交檔案|繳交檔案|已上傳檔案|上傳紀錄|提交文件|提交凭证/iu;
const grade=/\b(?:scores?|feedback|grades?|grade report|graded work)\b|分數|分数|評語|评语|成績|成绩/iu;
const detail=/\b(?:instructions?|details?|what .* (?:asked|required) to do|assignment (?:id|named|called))\b|作業說明|作业说明|作業內容|作业内容/iu;
const existingContext=/\b(?:calendar import|import(?:ed)? (?:from|via)|came from.{0,20}calendar)\b|匯入|导入|匯出的行事曆/iu;
const explicitDate=/\b20\d{2}-\d{2}-\d{2}\b/gu;
const titleOnly=/\b(?:only (?:the )?(?:titles?|names?)|(?:titles?|names?) only)\b|只(?:顯示|显示|列出)(?:名稱|名称|標題|标题)/iu;
const fromMeeting=/\b(?:last (?:meeting|lesson|class)|missed class|was absent|linked (?:class|meeting)|attendance)\b|上次上課|上次上课|缺課|缺课|缺席|上堂課|上堂课/iu;
const other=/\b(?:balance|tuition|fees?|next class|timetable|leave requests?|attendance|materials?|health|registrar)\b|餘額|余额|學費|学费|下一堂|課表|课表|請假|请假|教材|健康|註冊組/iu;
const noStatus=/(?:\b(?:without|omit|hide|exclude|do not show)\b|不要(?:顯示|显示)|隱藏|隐藏)\s*(?:the (?:tracker |saved )?)?(?:status|狀態|状态)/iu;
const noDates=/(?:\b(?:without|omit|hide|exclude|do not show)\b|不要(?:顯示|显示)|隱藏|隐藏)\s*(?:the )?(?:dates?|deadlines?|due dates?|截止(?:日期)?|日期)/iu;
const namedTarget=/\b(?:another|the other|a different|my other|different) (?:course|class)\b|\b(?:for|in|from) (?:my |the )?(?:course|class) (?!this\b|shown\b|above\b|assignments?\b)[\p{L}\d_-]+|\b(?:course|assignment)\s+(?:id|named|called)\b|課程[「『]|课程[「『]/iu;

export function dtmAssignmentListSelection(question,route=''){
  if(typeof question!=='string'||question.length>2000||typeof route!=='string')return null;
  const match=dtmAssignmentListRoute.exec(route);
  if(!match)return null;
  const courseId=match[1]??null;
  const path=courseId?'/dtm/course/'+courseId+'/assignments':'/dtm/assignments';
  const q=question.normalize('NFKC').trim();
  const independent=q.split(/[;；。！？\n]|\.(?:\s|$)|\s+(?:also|but|plus)\s+|以及|並且|还有|還有/iu)
    .map(value=>value.trim()).filter(value=>value&&!/^use yyyy-mm-dd for dates?$/iu.test(value));
  const assignment=independent.find(value=>topic.test(value));
  if(!assignment)return null;
  const reason=(code)=>({courseId,path,reason:code});
  if(foreign.test(q))return reason('foreign');
  if(negative.test(assignment))return reason('excluded');
  if(operation.test(assignment))return /\b(?:all|every|assignments|homework)\b|全部|所有/iu.test(assignment)?reason('operation'):null;
  if(file.test(assignment))return reason('files');
  if(grade.test(assignment))return reason('grades');
  if((detail.test(assignment)||/\bthis assignment\b|這份作業|这份作业/iu.test(assignment))&&!excludedFields.test(assignment))return reason('detail');
  if(fromMeeting.test(assignment)||existingContext.test(assignment))return null;
  if(!request.test(assignment))return null;
  if(courseId&&/\b(?:all (?:my )?(?:moodle |dtm )?courses?|across (?:my )?courses)\b|所有課程|全部課程|所有课程|全部课程/iu.test(q))
    return {...reason('choose'),path:'/dtm/assignments'};
  if(namedTarget.test(q)||/["“「『][^"”」』]+["”」』]/u.test(q)
    ||[...q.matchAll(/\/dtm\/course\/[^\s),\]<>]+/gu)].some(([url])=>url.replace(/\/$/u,'')!==path))
    return reason('choose');
  const distinctPart=independent.length>1||other.test(assignment);
  if(distinctPart)return reason('combined');
  const statedDates=[...q.matchAll(explicitDate)].map(([value])=>value);
  const today=/\btoday\b|今天/iu.test(q),tomorrow=/\btomorrow\b|明天/iu.test(q),overdue=/\boverdue\b|逾期/iu.test(q);
  const explicitDay=statedDates[0]??null;
  if(Number(today)+Number(tomorrow)+Number(overdue)+statedDates.length>1)return reason('combined');
  if(explicitDay&&(!Number.isFinite(Date.parse(explicitDay))||!new Date(explicitDay).toISOString().startsWith(explicitDay+'T')))
    return reason('choose');
  const namesOnly=titleOnly.test(q);
  const open=/\b(?:unfinished|open|not yet finished|incomplete|pending|overdue)\b|未完成|待繳交|待缴交|逾期/iu.test(q);
  const done=/\b(?:completed|done|submitted or graded)\b|\b(?<!not yet )finished\b|已完成|已繳交或評分|已缴交或评分/iu.test(q);
  const submitted=!done&&/\b(?:submitted|turned in)\b|已(?:繳交|缴交|提交)/iu.test(q);
  const graded=!done&&/\bgraded\b|已評分|已评分/iu.test(q);
  if(Number(open)+Number(done)+Number(submitted)+Number(graded)>1)return reason('combined');
  const period=today?'today':tomorrow?'tomorrow':overdue?'overdue':explicitDay;
  return {courseId,path,reason:null,mode:open?'open':done?'done':submitted?'submitted':graded?'graded':'all',
    period,dates:!namesOnly&&!noDates.test(q),statuses:!namesOnly&&!noStatus.test(q),countOnly:/\b(?:how many|count)\b|多少|幾(?:份|項|筆)|几(?:份|项|笔)/iu.test(q)};
}

export function dtmAssignmentListBoundary(selection,question,signedIn){
  const en=!/\p{Script=Han}/u.test(question),t=(english,zh)=>en?english:zh;
  const uri=signedIn?selection.path:'/dtm/login?next='+encodeURIComponent(selection.path);
  const label=!signedIn?t('Sign in to see saved Moodle assignments','登入查看已儲存的 Moodle 作業')
    :selection.reason==='grades'?t('Open Moodle grade report','開啟 Moodle 成績報告'):t('Open saved Moodle assignments','開啟已儲存的 Moodle 作業');
  const messages={
    foreign:t("I cannot show another student's Moodle assignments.",'無法查詢其他學生的 Moodle 作業。'),
    excluded:t('I skipped the excluded assignment list.','已略過您排除的作業清單。'),
    operation:t('No change was made. Use the assignment page to make edits or submissions.','未修改紀錄。請在作業頁面編輯或繳交。'),
    files:t('Open a specific assignment to check committed files or a submission receipt. The list only has local tracker status.','請開啟特定作業以查核已提交的檔案或繳交收據。作業清單只有站內追蹤狀態。'),
    grades:t('Open the Moodle grade report to check saved grades. The assignment list only has local tracker status.','請開啟 Moodle 成績報告查核紀錄。作業清單只有站內追蹤狀態。'),
    detail:t('Open a specific assignment to check its saved instructions.','請開啟要查詢作業的詳細頁以查看已儲存說明。'),
    choose:t('Choose the exact course or assignment page for that request.','請開啟要查詢的確切課程或作業頁面。'),
    combined:t('Ask the assignment question separately so it can be checked against this list.','請單獨詢問作業，以查核此頁的清單。'),
  };
  const href=selection.reason==='grades'&&signedIn?(selection.courseId?'/dtm/course/'+selection.courseId+'/grades':'/dtm/grades'):uri;
  const citations=selection.reason==='foreign'||selection.reason==='excluded'?[]:[{title:label,url:href}];
  return {status:!signedIn||['foreign','files','grades','operation'].includes(selection.reason)?'handoff':'clarification',
    answer:[messages[selection.reason],...citations.map(({title,url})=>'['+title+']('+url+')')].filter(Boolean).join('\n\n'),
    citations,suggestedQuestions:[],grounding:{source:signedIn?'account':'directory',webSearched:false}};
}
