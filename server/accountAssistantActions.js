import {randomUUID} from 'node:crypto';
import {parseExplicitAccountAction} from './accountActionIntent.js';

const within = (value,min,max) => typeof value==='string' && [...value].length>=min && [...value].length<=max;
const same = (left,right) => typeof left==='string' && left.normalize('NFKC').toLowerCase()===right.normalize('NFKC').toLowerCase();

export function prepareAccountAction(question,snapshot,{requestId=randomUUID()}={}) {
  const requested=parseExplicitAccountAction(question);
  if(!requested)return {};
  const {kind,title,details,target}=requested;
  const zh=/[\u3400-\u9fff]/u.test(question);
  const say=(en,cn)=>zh?cn:en;
  const clarify=(en,cn)=>({clarification:say(en,cn)});
  if(requested.ambiguous)return clarify('Ask for one change at a time. Quote the exact title or nickname if it contains instructions.',
    '請一次要求一項變更。如果標題或暱稱含有指令文字，請加上引號。');
  const proposal=(label,payload,url='/school-affairs/records')=>Buffer.byteLength(JSON.stringify(payload),'utf8')<=3850
    ?{action:{kind,label,payload,requestId,url}}
    :clarify('Please shorten the supplied text before reviewing the change.','請縮短輸入文字後再確認變更。');
  if(kind==='create_task')return within(title,3,160)
    ?proposal(say('Create task: ','建立待辦：')+title,{title})
    :clarify('What title should I use for the task?','請提供待辦標題。');
  if(kind==='complete_task'){
    const matches=(snapshot.tasks??[]).filter(row=>!row.completedAt && target && same(row.title,target));
    return matches.length===1
      ?proposal(say('Complete task: ','完成待辦：')+matches[0].title,{task_id:matches[0].id})
      :clarify('Which open stu.best task should I complete? Please give its exact title.','請提供要完成的待辦完整標題。');
  }
  if(kind==='create_service_request')return within(title,3,160)&&within(details,5,2000)&&['records','registration','general'].includes(requested.requestType)
    ?proposal(say('Create stu.best request: ','建立 stu.best 申請：')+title,{title,details,request_type:requested.requestType})
    :clarify('Please give the request title, details and category (records, registration, or general).','請提供此申請的標題、內容與類別。');
  if(kind==='publish_announcement'){
    if(snapshot.profile?.role!=='admin')return clarify('Publishing to stu.best requires an administrator account.','發佈 stu.best 公告需使用管理員帳戶。');
    return within(title,3,160)&&within(details,5,2000)
      ?proposal(say('Publish stu.best announcement: ','發佈 stu.best 公告：')+title,{title,body:details},'/school-affairs')
      :clarify('Please give the announcement title and text.','請提供公告的標題與內容。');
  }
  if(kind==='update_display_name')return within(title,1,80)&&typeof snapshot.profile?.displayName==='string'
    ?proposal(say('Change your stu.best display name to ','將你的 stu.best 顯示名稱改成 ')+title,{display_name:title,expected_name:snapshot.profile.displayName})
    :clarify('What display name would you like to use?','請提供新的顯示名稱。');
  const matches=(snapshot.assignments??[]).filter(row=>target&&same(row.title,target));
  if(matches.length!==1)return clarify('Which personal assignment tracker in stu.best should I update? Please give its exact title.','請提供要更新的個人作業追蹤完整標題。');
  const row=matches[0];
  if(row.sourceMode!=='personal'||!row.dtmCourseId||!['open','submitted'].includes(row.status))
    return clarify('I can change the tracker status of your own editable DTM assignments.','我可以變更你有編輯權限的個人 DTM 作業追蹤狀態。');
  const status=requested.status;
  if(row.status===status)return clarify('Your stu.best assignment tracker already has that status.','你的 stu.best 作業追蹤已是此狀態。');
  return proposal(say(`Set personal tracker “${row.title}” to ${status}`,`將個人作業「${row.title}」標記為${status==='open'?'未完成':'已繳交'}`),
    {id:row.id,status,expected_status:row.status},'/dtm/course/'+encodeURIComponent(row.dtmCourseId)+'/assignments');
}
