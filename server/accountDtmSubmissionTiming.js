import {isDeepStrictEqual} from 'node:util';
import {runAnswerVerification} from './answerVerification.js';
import {dtmSubmissionInstantMicros,readDtmSubmissionTiming} from './accountSubmissionEvidence.js';

const sourceId='account:dtmSubmissionTiming';
const formatting=Object.fromEntries(['UTC','Asia/Taipei'].map(timeZone=>[timeZone,new Intl.DateTimeFormat('en-CA',{
  timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',
  hourCycle:'h23',timeZoneName:'shortOffset',
})]));
const units=[
  [86400000000n,'day','天'],[3600000000n,'hour','小時'],[60000000n,'minute','分鐘'],[1000000n,'second','秒'],
  [1000n,'millisecond','毫秒'],[1n,'microsecond','微秒'],
];

function duration(delta,zh){
  let remaining=delta<0n?-delta:delta;
  const parts=[];
  for(const [size,en,cn] of units){
    const count=remaining/size;
    if(count)parts.push(zh?count+' '+cn:count+' '+en+(count===1n?'':'s'));
    remaining%=size;
  }
  return parts.join(zh?'、':', ');
}

function presentTime(value,zone){
  const fraction=/\.\d{1,6}/u.exec(value)?.[0]??'';
  function local(timeZone){
    const p=Object.fromEntries(formatting[timeZone].formatToParts(new Date(value)).map(part=>[part.type,part.value]));
    const suffix=timeZone==='UTC'?'UTC':'Taipei ('+p.timeZoneName+')';
    return p.year+'-'+p.month+'-'+p.day+' '+p.hour+':'+p.minute+':'+p.second+fraction+' '+suffix;
  }
  return zone==='utc'?local('UTC'):zone==='both'?local('Asia/Taipei')+' / '+local('UTC'):local('Asia/Taipei');
}

function timingRecord(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2
    ||!Object.hasOwn(value,'submittedAt')||!Object.hasOwn(value,'dueAtAtSubmission'))return null;
  const {submittedAt,dueAtAtSubmission}=value;
  const submitted=dtmSubmissionInstantMicros(submittedAt),due=dtmSubmissionInstantMicros(dueAtAtSubmission);
  if(submittedAt===null)return dueAtAtSubmission===null?{submittedAt,dueAtAtSubmission}:null;
  return submitted===null||dueAtAtSubmission!==null&&due===null?null:{submittedAt,dueAtAtSubmission};
}

function timingAnswer(record,selection,zh){
  const t=(en,cn)=>zh?cn:en;
  const {submittedAt,dueAtAtSubmission}=record;
  const lines=[];
  if(submittedAt===null)lines.push(t('No committed submission is saved for this assignment.','這份作業沒有已儲存的繳交檔案。'));
  else{
    if(dueAtAtSubmission===null)lines.push(t('There is no deadline saved with this submission, so its timing cannot be determined.',
      '這筆繳交紀錄沒有保存當時的截止時間，因此無法判斷是否準時。'));
    else{
      const delta=dtmSubmissionInstantMicros(submittedAt)-dtmSubmissionInstantMicros(dueAtAtSubmission);
      const difference=duration(delta,zh);
      lines.push(delta>0n?t('Your current saved submission was '+difference+' late.','目前儲存的繳交檔案遲交了 '+difference+'。')
        :delta<0n?t('Your current saved submission was on time, '+difference+' before its saved deadline.',
          '目前儲存的繳交檔案準時，早於儲存的截止時間 '+difference+'。')
          :t('Your current saved submission was on time and exactly at its saved deadline.','目前儲存的繳交檔案準時，繳交時間正好等於儲存的截止時間。'));
      lines.push(t('Deadline saved with this submission: ','繳交時儲存的截止時間：')+presentTime(dueAtAtSubmission,selection.zone));
    }
    lines.push(t('Submission time: ','繳交時間：')+presentTime(submittedAt,selection.zone));
  }
  const title=t('Open this assignment','開啟這份作業');
  lines.push('['+title+']('+selection.path+')');
  return {status:'answered',answer:lines.join('\n\n'),citations:[{chunkId:sourceId,title,url:selection.path}],
    grounding:{source:'account',webSearched:false},suggestedQuestions:[]};
}

export async function answerDtmSubmissionTiming({account,selection,question,deadline,onProgress},load=readDtmSubmissionTiming){
  const zh=/\p{Script=Han}/u.test(question),t=(en,cn)=>zh?cn:en;
  const activity=[];
  const unavailable={status:'abstained',answer:'',citations:[],grounding:{source:'account',webSearched:false},suggestedQuestions:[]};
  async function read(attempt){
    let record=null;
    try{record=timingRecord(await load(account,{courseId:selection.courseId,assignmentId:selection.assignmentId,deadline}));}
    catch{/* A failed read is unknown. The verification graph can retry the same scope. */}
    const step={kind:'account-read:dtmSubmissionTiming:'+attempt,
      label:t('Checked the saved submission timing','查核儲存的作業繳交時間'),
      status:record?'complete':'unavailable',detail:record?t('Read the saved timing for the selected assignment.','已查詢指定作業的繳交時間。')
        :t('The selected submission timing could not be read.','目前無法讀取指定作業的繳交時間。')};
    activity.push(step);
    try{onProgress?.(step);}catch{/* A closed stream cannot approve a response. */}
    return record?[{id:sourceId,url:selection.path,content:JSON.stringify(record)}]:[];
  }
  const first=await read(1);
  function render(evidence){
    if(evidence.length!==1||evidence[0].id!==sourceId||evidence[0].url!==selection.path)return unavailable;
    const record=timingRecord(JSON.parse(evidence[0].content));
    return record?timingAnswer(record,selection,zh):unavailable;
  }
  const checked=await runAnswerVerification({question,initialAnswer:render(first),deadline,onProgress,
    loadEvidence:async({attempt})=>attempt===1?first:read(attempt),
    verify:async({candidate,evidence})=>{
      const expected=render(evidence);
      return {ok:expected.status==='answered'&&expected.answer===candidate.answer&&isDeepStrictEqual(expected.citations,candidate.citations),
        reason:'evidence_unavailable'};
    },
    repair:async({evidence})=>render(evidence),
  });
  return {...checked,answer:checked.verification?.status==='verified'?checked.answer
    :t('I couldn’t verify the saved timing for this submission. Please try again.','目前無法核對這份作業的繳交時間，請稍後再試。'),
    activity:[...activity,...(checked.activity??[])]};
}
