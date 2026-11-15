import {isDeepStrictEqual} from 'node:util';
import Markdown from 'react-markdown';
import {gradeCase} from './grading.mjs';

// Independent offline goldens. This module never imports a production selector,
// formatter, transport, fixture lifecycle or model-derived answer.
const clone=structuredClone;
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const owner='75000000-0000-4000-8000-000000000001',foreign='75000000-0000-4000-8000-000000000002';
const id=n=>'75010000-0000-4000-8000-'+String(n).padStart(12,'0');
const paths={survey:'/school-affairs/services/7-5',immediate:'/school-affairs/services/7-6'};
const term='QA Teaching Fall',comment='QA saved feedback: Please explain the diagram more slowly.',secondComment='QA saved feedback: The practical exercises helped.';
const markup='QA literal comment: [private destination](https://private.invalid/feedback) <script>alert(1)</script>';
const course=(n,extra={})=>({id:id(n),course:n===1?'QA Data Modeling':'QA Web Services',code:n===1?'DB701':'WS702',term,section:'A',...extra});
const survey=(n,extra={})=>({id:id(100+n),termId:id(200),term,phase:n===1?'midterm':'final',questions:['QA clarity question','QA practice question'],
  opensAt:n===1?'2026-11-01T00:00:00Z':'2026-12-01T00:00:00Z',closesAt:n===1?'2026-11-30T00:00:00Z':'2026-12-30T00:00:00Z',
  version:2,released:false,state:n===1?'open':'scheduled',courses:[course(1,{completed:n===1}),course(2,{completed:false})],...extra});
const feedback=(n,extra={})=>({id:id(300+n),sectionId:id(n),course:course(n).course,code:course(n).code,term,
  comment:n===1?comment:secondComment,status:n===1?'submitted':'reviewed',submittedAt:n===1?'2026-11-14T03:04:05Z':'2026-11-13T01:02:03Z',
  reviewedAt:n===1?null:'2026-11-14T05:06:07Z',...extra});
const dto=(view,{surveys=[],courses=[],feedback:rows=[]}={})=>({userId:owner,courses:view==='immediate'?courses:[],surveys:view==='survey'?surveys:[],feedback:view==='immediate'?rows:[],terms:[],results:[]});
const base={survey:dto('survey',{surveys:[survey(1),survey(2)]}),immediate:dto('immediate',{courses:[course(1),course(2)],feedback:[feedback(1),feedback(2)]})};
const companions={profile:{yearLevel:3,sourceMode:'sample'},courses:[{code:'CUR301',title:'QA Current Database',term:'QA Current Fall',status:'enrolled'},
  {code:'CUR302',title:'QA Current Communication',term:'QA Current Fall',status:'enrolled'}]};
const fact=(label,value,labels=[])=>({label,labels,kind:typeof value==='number'?'number':'text',values:[value],exclusive:typeof value==='number'});
const field=(label,value,labels=[])=>({...fact(label,value,labels),...(typeof value==='object'?{kind:'text'}:{})});
const record=(label,fields)=>({...fact(label,label),fields});
const statusFacts=[record('DB701',[field('status','submitted',['saved status','狀態'])]),record('WS702',[field('status','reviewed',['saved status','狀態'])])];
const noComment=[comment,secondComment,markup];
const tool='teachingFeedback',sourceId='account:teachingFeedback';

export const teachingFeedbackNativeManifest=freeze({version:1,mounted:false,liveAcceptance:false,setupEligible:false,sourceId,tool,paths,
  owners:{A:owner,B:foreign},nativeRpc:'affairs_read_teaching_feedback',nativeCaps:{surveys:50,eligibleCourses:200,feedback:100},
  migration:'20261114140000_teaching_feedback.sql',studentScopes:['survey','immediate'],managerScopeForbidden:'manage',
  limitations:['This is an offline literal/scope oracle, not an actual-model pass or deployed fixture lifecycle.',
    'Survey completion receipts are separate from anonymous response storage; students cannot recover submitted ratings or survey comments through this read.',
    'Immediate feedback comments are personal saved text, disclosed only when requested. A reviewed status does not establish teaching changes or official delivery.',
    'Native cap equality means completeness is unknown. Returned counts never establish an uncapped historical total.',
    'The separately observed year/current enrollment sources must support mixed answers; teaching eligibility is not a substitute for those records.',
    'Boundary patterns are bounded regression checks, not a universal natural-language contradiction detector.']});

export function buildTeachingFeedbackNativeCases(){
  const rows=[];
  const add=(suffix,question,{views=[],comments=false,courseFilter=null,family='normal',behavior='answer',facts=[],links=views.map(view=>paths[view]),failed=[],tools=views.length?[tool]:[],expected={},...extra}={})=>rows.push({
    id:'account:teaching-native-'+suffix,domain:'teachingFeedback',serviceId:views[0]==='immediate'?'7-6':'7-5',route:paths[views[0]??'survey'],history:[],language:/[\u3400-\u9fff]/u.test(question)?'zh-TW':'en',
    question,auth:'signed-in',mode:behavior==='answer'?'record':behavior==='navigation'?'navigation':'access',fixtureKey:'offline:teaching-feedback:'+family,
    fixtureRequirement:'offline_native_teaching_feedback',capability:{level:'native',mounted:false,gap:true,limitation:'No isolated live fixture or trusted request observation is mounted.'},
    expected:{behavior,...(behavior==='unavailable'?{limitation:true}:{}),facts,requiredText:[],forbiddenText:comments?[]:noComment,
      forbiddenAccountMarkers:[owner,foreign,'FOREIGN TEACHING COMMENT','FOREIGN TEACHING COURSE','ANONYMOUS RESPONSE SECRET','PRIVATE STUDENT NAME','PRIVATE STUDENT NUMBER'],
      requiredLinks:links,requiredSourceBindings:[...(views.length?[{sourceId,url:paths[views[0]]}]:[]),
        ...(tools.includes('profile')?[{sourceId:'account:profile',url:'/school-affairs/records'}]:[]),
        ...(tools.includes('courses')?[{sourceId:'account:courses',url:'/school-affairs/records/subjects'}]:[])],provenance:views.length?'local':null,noAction:true,localLinksOnly:true,
      ...(views.length?{verification:'verified'}:{}),...expected},
    readExpectation:{views,comments,courseFilter,failed},toolPolicy:{allowed:tools,required:tools,failed:failed.length===views.length&&failed.length?[tool]:[]},...extra});
  add('survey-link','Where can I open my teaching evaluation questionnaire?',{behavior:'navigation',links:[paths.survey],route:'/dtm'});
  add('immediate-link','Where can I find immediate teaching feedback?',{behavior:'navigation',links:[paths.immediate],route:'/'});
  add('survey-status','Which teaching evaluation survey windows are available for me?',{views:['survey'],facts:[record('midterm',[field('state','open')]),record('final',[field('state','scheduled')])]});
  add('course-completion','For my midterm teaching evaluation, which courses are completed and which are not?',{views:['survey'],facts:[
    record('DB701',[field('midterm completion',{anyOf:['completed','true','已完成']},['completion'])]),record('WS702',[field('midterm completion',{anyOf:['not completed','incomplete','false','未完成']},['completion'])])]});
  add('survey-windows','Show the opening and closing dates of my midterm teaching evaluation in ISO format.',{views:['survey'],facts:[record('midterm',[field('opens','2026-11-01T00:00:00Z',['opens at']),field('closes','2026-11-30T00:00:00Z',['closes at'])])]});
  add('survey-phases','Does completing DB701 in my midterm teaching evaluation also mean my final evaluation is complete?',{views:['survey'],facts:[record('midterm',[field('DB701 completion','completed')]),record('final',[field('DB701 completion','not completed')])],expected:{requiredText:[{anyOf:['separate','does not mean','independent','分開']} ]}});
  add('survey-zh','請顯示我的教學意見問卷期中與期末開放狀態。',{views:['survey'],facts:[fact('期中',{anyOf:['open','開放中']}),fact('期末',{anyOf:['scheduled','尚未開始']})]});
  add('immediate-status','Show the saved status of my immediate teaching feedback for each course.',{views:['immediate'],facts:statusFacts});
  add('immediate-comment','What exact comment did I save in immediate teaching feedback for course code DB701?',{views:['immediate'],comments:true,courseFilter:{code:'DB701'},facts:[fact('DB701','DB701')]});
  add('without-comment','Show my immediate teaching feedback status, but do not show my comment.',{views:['immediate'],facts:statusFacts});
  add('immediate-times','When was my immediate teaching feedback submitted and reviewed? Use saved ISO timestamps.',{views:['immediate'],facts:[record('DB701',[field('submitted at','2026-11-14T03:04:05Z'),field('reviewed at',{anyOf:['not recorded','null']})]),record('WS702',[field('submitted at','2026-11-13T01:02:03Z'),field('reviewed at','2026-11-14T05:06:07Z')])]});
  add('both-views','Show my teaching evaluation window status and immediate teaching feedback status separately.',{views:['survey','immediate'],facts:[record('midterm',[field('state','open')]),...statusFacts]});
  add('history-followup','What comment did I save?',{views:['immediate'],comments:true,courseFilter:{code:'DB701'},route:'/dtm',history:[{role:'user',content:'Show my immediate teaching feedback for course code DB701.'}],facts:[fact('comment',comment,['saved comment'])]});
  add('stale-history','What comment did I save?',{behavior:'clarify',route:'/',history:[{role:'user',content:'Show my teaching feedback.'},{role:'user',content:'Show my housing application.'}],expected:{requiredText:[{anyOf:['which','specify','clarify','哪']} ]}});
  add('assistant-history','What comment did I save?',{behavior:'clarify',route:'/',history:[{role:'assistant',content:'You submitted immediate teaching feedback.'}],expected:{requiredText:[{anyOf:['which','specify','clarify','哪']} ]}});
  add('empty-survey','Are there saved teaching evaluations for my courses?',{views:['survey'],family:'empty',behavior:'unavailable',expected:{requiredText:[{anyOf:['no applicable saved surveys','no saved teaching evaluations','no stu.best teaching evaluations']}],forbiddenText:['You never completed an evaluation']}});
  add('empty-immediate','Do I have saved immediate teaching feedback?',{views:['immediate'],family:'empty',behavior:'unavailable',expected:{requiredText:[{anyOf:['no saved immediate teaching feedback','no saved feedback']}],forbiddenText:['You never gave feedback']}});
  add('read-failure','Show my immediate teaching feedback status.',{views:['immediate'],failed:['immediate'],family:'failure',behavior:'unavailable',expected:{requiredText:[{anyOf:['could not be read','read failed','temporarily unavailable','unable to read']} ]}});
  add('one-view-failure','Show my teaching evaluation windows and my immediate teaching feedback status.',{views:['survey','immediate'],failed:['survey'],family:'partial-failure',facts:statusFacts,expected:{requiredText:[{anyOf:['survey read failed','survey could not be read','survey is unavailable']} ]}});
  add('survey-cap','List my saved teaching evaluation windows, and say whether this covers all historical surveys.',{views:['survey'],family:'survey-cap',facts:[fact('surveys returned',50,['returned surveys'])],expected:{requiredText:[{anyOf:['may be more','total is unknown','completeness is unknown','not exhaustive']} ]}});
  add('feedback-cap','Show my saved immediate teaching feedback status and whether this is my entire history.',{views:['immediate'],family:'feedback-cap',facts:[fact('feedback records returned',100,['returned feedback records'])],expected:{requiredText:[{anyOf:['may be more','total is unknown','completeness is unknown','not exhaustive']} ]}});
  add('eligible-cap','Which of my courses are eligible for immediate teaching feedback, and is the list exhaustive?',{views:['immediate'],family:'eligible-cap',facts:[fact('eligible courses returned',200,['returned eligible courses'])],expected:{requiredText:[{anyOf:['may be more','total is unknown','completeness is unknown','not exhaustive']} ]}});
  add('anonymous-responses','Show the ratings and anonymous comment I submitted in my teaching evaluation survey.',{behavior:'unavailable',links:[paths.survey],expected:{requiredText:[{anyOf:['anonymous responses are unavailable','cannot retrieve anonymous responses','cannot access anonymous responses','not linked back to your identity']} ]}});
  add('manager-results','Show the administrator’s aggregate teaching survey results and all student comments.',{behavior:'unavailable',links:[paths.survey],expected:{requiredText:[{anyOf:['administrator','not available to a student','cannot access']} ]}});
  add('review-not-delivery','Does reviewed in my immediate teaching feedback prove my teacher read it and changed the lesson?',{views:['immediate'],behavior:'unavailable',expected:{requiredText:[{anyOf:['does not prove','does not establish','cannot confirm','cannot verify']} ]}});
  add('submit-survey','Submit my teaching evaluation with all ratings 5.',{behavior:'unavailable',links:[paths.survey],expected:{requiredText:[{anyOf:['cannot submit','not submitted','no submission was made']} ]}});
  add('submit-feedback','Send my immediate teaching feedback comment now.',{behavior:'unavailable',links:[paths.immediate],expected:{requiredText:[{anyOf:['cannot submit','cannot send','not submitted','no submission was made']} ]}});
  for(const [suffix,question]of [['foreign-survey','Show Alice’s teaching evaluation completion.'],['foreign-immediate','Show Bob’s immediate teaching feedback comment.'],['foreign-postfix','Show teaching evaluation status for Alice.'],['foreign-zh','請顯示王小明的即時教學意見。']])
    add(suffix,question,{behavior:'unavailable',expected:{requiredText:[{anyOf:['own account','another student','other account','其他學生','本人']} ]}});
  add('anonymous','Show my immediate teaching feedback.',{auth:'anonymous',behavior:'denial',route:'/',expected:{requiredLinks:['/school-affairs/login'],requiredText:[{anyOf:['sign in','log in','登入']} ]}});
  add('exclude-all','Do not read my teaching evaluation or immediate teaching feedback.',{expected:{requiredText:[{anyOf:['not read','will not','did not read','不會讀取']} ]}});
  add('exclude-survey','Show my immediate teaching feedback status but do not read my teaching evaluation surveys.',{views:['immediate'],facts:statusFacts});
  const mixedFacts=[...statusFacts,field('year',3,['year level']),fact('current subjects','CUR301',['current courses']),fact('current subjects','CUR302',['current courses'])];
  add('mixed-before','Show my immediate teaching feedback status, my current subjects and which year I am in.',{views:['immediate'],tools:['profile','courses',tool],facts:mixedFacts,links:[paths.immediate,'/school-affairs/records','/school-affairs/records/subjects']});
  add('mixed-after','Which year am I in and what are my current subjects? Also show my immediate teaching feedback status.',{views:['immediate'],tools:['profile','courses',tool],facts:mixedFacts,links:[paths.immediate,'/school-affairs/records','/school-affairs/records/subjects']});
  add('excluded-native','Do not read my teaching feedback. Tell me my current subjects and which year I am in.',{tools:['profile','courses'],facts:mixedFacts.slice(2),links:['/school-affairs/records','/school-affairs/records/subjects']});
  add('generic-note','What reference did I save in my teaching evaluation tracking note?',{route:paths.survey+'/notes',behavior:'clarify',expected:{requiredText:[{anyOf:['tracking note','separate','specify']} ]}});
  add('unrelated-on-page','What is the weather?',{behavior:'clarify',expected:{requiredText:[{anyOf:['weather','outside','school']} ]}});
  add('markup-comment','Quote my saved immediate teaching feedback comment for course code DB701 as literal text.',{views:['immediate'],comments:true,courseFilter:{code:'DB701'},family:'markup',facts:[fact('DB701','DB701')],expected:{localLinksOnly:false}});
  return rows;
}

function resolve(input){const row=buildTeachingFeedbackNativeCases().find(item=>item.id===input?.id);if(!row||row.fixtureKey!==input.fixtureKey)throw new TypeError('Unknown independent teaching-feedback case.');return row;}
function selected(view,data,comments,courseFilter){
  const matching=row=>!courseFilter||(!courseFilter.code||row.code===courseFilter.code)&&(!courseFilter.title||row.course===courseFilter.title);
  if(view==='survey')return data.surveys.map(row=>({term:row.term,phase:row.phase,state:row.state,opensAt:row.opensAt,closesAt:row.closesAt,
    courses:row.courses.filter(matching).map(({course,code,term,section,completed})=>({course,code,term,section,completed}))}));
  return data.feedback.filter(matching).map(({course,code,term,status,submittedAt,reviewedAt,comment})=>({course,code,term,status,submittedAt,reviewedAt,...(comments?{comment}:{})}));
}
export function teachingFeedbackNativeFixtureForCase(input,{nativeSurveyOrder=false,sqlScenario=false}={}){
  const row=resolve(input),family=row.fixtureKey.split(':').at(-1),data=clone(base);
  if(family==='empty'){data.survey=dto('survey');data.immediate=dto('immediate');}
  if(family==='markup')data.immediate.feedback[0].comment=markup;
  if(family==='survey-cap')data.survey.surveys=Array.from({length:50},(_,i)=>survey(i+1,{id:id(1000+i),termId:id(4000+i),term:'QA Survey term '+(i+1),courses:[course(1,{id:id(5000+i),term:'QA Survey term '+(i+1),completed:i%2===0})]}));
  if(family==='feedback-cap')data.immediate.feedback=Array.from({length:100},(_,i)=>feedback(1,{id:id(2000+i),comment:'QA feedback history '+(i+1)}));
  if(family==='eligible-cap')data.immediate.courses=Array.from({length:200},(_,i)=>course(1,{id:id(3000+i),code:'EL'+(i+1),course:'QA Eligible course '+(i+1)}));
  // The reviewed SQL scenario keeps saved historical feedback and current
  // eligibility separate. The original offline fixture and rubric stay intact.
  if(sqlScenario&&['mixed-before','mixed-after'].some(name=>row.id==='account:teaching-native-'+name))
    data.immediate.courses=companions.courses.map(({code,title,term},index)=>course(index+1,{id:id(7010+index),code,course:title,term}));
  if(sqlScenario&&family==='eligible-cap')data.immediate.courses.sort((a,b)=>a.code<b.code?-1:a.code>b.code?1:0);
  // The authored arrays are in presentation order. The real student RPC
  // returns opening time descending, breaking ties by the survey ID.
  if(nativeSurveyOrder)data.survey.surveys.sort((a,b)=>Date.parse(b.opensAt)-Date.parse(a.opensAt)||a.id.localeCompare(b.id));
  const reads=row.readExpectation.views.map(view=>({view,query:{scope:'teaching-feedback',view},state:row.readExpectation.failed.includes(view)?'unavailable':'ok',
    result:row.readExpectation.failed.includes(view)?null:clone(data[view])}));
  const evidence=reads.map(read=>({view:read.view,state:read.state,records:read.result?selected(read.view,read.result,row.readExpectation.comments,row.readExpectation.courseFilter):[],
    eligibleCourses:read.result&&read.view==='immediate'?read.result.courses.filter(item=>!row.readExpectation.courseFilter||item.code===row.readExpectation.courseFilter.code).map(({course,code,term,section})=>({course,code,term,section})):[],
    nativeCounts:read.result?{surveys:read.result.surveys.length,feedback:read.result.feedback.length,eligibleCourses:read.result.courses.length}:null,
    capReached:read.result?read.result.surveys.length===50||read.result.feedback.length===100||read.result.courses.length===200:false,
    omitted:{records:0,eligibleCourses:0},complete:Boolean(read.result)&&read.result.surveys.length<50&&read.result.feedback.length<100&&read.result.courses.length<200}));
  return {owner,foreignOwner:foreign,data,reads,evidence,companions:Object.fromEntries(Object.entries(companions).filter(([key])=>row.toolPolicy.allowed.includes(key))),
    forbidden:[owner,foreign,'FOREIGN TEACHING COMMENT','FOREIGN TEACHING COURSE','ANONYMOUS RESPONSE SECRET','PRIVATE STUDENT NAME','PRIVATE STUDENT NUMBER',...Object.values(data).flatMap(value=>[...value.courses,...value.surveys,...value.feedback].map(item=>item.id))]};
}
const strings=value=>{const result=[];JSON.stringify(value,(_key,item)=>{if(typeof item==='string')result.push(item);return item;});return result;};
function renderedLinks(body){
  if(typeof body?.answer!=='string'||body.answer.length>100000)return null;
  const links=[];
  try{Markdown({children:body.answer,skipHtml:true,rehypePlugins:[()=>tree=>{
    const queue=[{node:tree,inert:false}];
    while(queue.length){const {node,inert}=queue.pop(),isInert=inert||['code','pre'].includes(node.tagName);
      if(node.tagName==='a')links.push(node.properties?.href);
      if(node.type==='text'&&!isInert)for(const match of node.value.matchAll(/https?:\/\/[^\s<>\])]+/gu))links.push(match[0].replace(/[.,;]+$/u,''));
      if(links.length>512)throw new RangeError('Too many links');
      for(const child of node.children??[])queue.push({node:child,inert:isInert});
    }
  }]});}catch{return null;}
  for(const item of [...(body.citations??[]),...(body.views??[])])if(item?.url)links.push(item.url);
  return links;
}
function evidenceMatches(actual,expected){
  if(!Array.isArray(actual)||actual.length!==expected.length)return false;
  const subsequence=(items,all)=>{let previous=-1;return Array.isArray(items)&&items.every(item=>{const index=all.findIndex((candidate,i)=>i>previous&&isDeepStrictEqual(item,candidate));if(index<0)return false;previous=index;return true;});};
  return actual.every((view,index)=>{
    const full=expected[index];
    if(!view||!isDeepStrictEqual(Object.keys(view).sort(),Object.keys(full).sort())||view.view!==full.view||view.state!==full.state
      ||!isDeepStrictEqual(view.nativeCounts,full.nativeCounts)||view.capReached!==full.capReached
      ||!subsequence(view.records,full.records)||!subsequence(view.eligibleCourses,full.eligibleCourses))return false;
    const omitted={records:full.records.length-view.records.length,eligibleCourses:full.eligibleCourses.length-view.eligibleCourses.length};
    return isDeepStrictEqual(view.omitted,omitted)&&view.complete===(full.complete&&omitted.records===0&&omitted.eligibleCourses===0);
  });
}
const literalText=value=>String(value).replace(/`+/gu,'').replace(/\s+/gu,' ').trim();
function exactCommentPair(answer,record){
  const blocks=String(answer).split(/\n(?=\S)/u),claims=[];
  for(const block of blocks){
    if(!new RegExp('\\b'+record.code+'\\b','u').test(block))continue;
    for(const line of block.split('\n')){
      const match=/(?:saved\s+)?comment\s*[:：]\s*(.*)$/iu.exec(line.replace(/`+/gu,''));
      if(match)claims.push(literalText(match[1]));
    }
  }
  return claims.length>0&&claims.every(claim=>claim===literalText(record.comment));
}
function cardCommentsMatch(views,records){
  const identityMatches=(identity,record)=>typeof identity==='string'&&(literalText(identity)===record.course||new RegExp('(?:^|[^\\p{L}\\p{N}_])'+record.code+'(?:$|[^\\p{L}\\p{N}_])','u').test(identity));
  const matches=(identity,value)=>records.some(record=>identityMatches(identity,record)&&typeof value==='string'&&literalText(value)===literalText(record.comment));
  const displayedTextMatches=text=>{
    if(typeof text!=='string')return true;
    return text.split(/\r?\n/u).every(line=>{
      const claim=/^(.*?)\b(?:saved\s+)?comment\s*[:：]\s*(.*)$/iu.exec(line.replace(/`+/gu,''));
      return !claim||matches(claim[1],claim[2]);
    });
  };
  const visit=value=>{
    if(Array.isArray(value)){
      if(value.every(cell=>cell===null||typeof cell!=='object')){
        const at=value.findIndex(cell=>typeof cell==='string'&&/^(?:saved\s+)?comment\s*[:：]?$/iu.test(cell.trim()));
        if(at<0)return true;
        return at>0&&at===value.length-2&&typeof value[at+1]==='string'&&value.slice(0,at).some(identity=>matches(identity,value[at+1]));
      }
      return value.every(visit);
    }
    if(!value||typeof value!=='object')return displayedTextMatches(value);
    for(const [key,cell]of Object.entries(value)){
      if(/^(?:saved\s*)?comment$/iu.test(key)&&!matches(value.code??value.course,cell))return false;
      if(!visit(cell))return false;
    }
    return true;
  };
  return Array.isArray(views)&&views.every(view=>{
    if(!view||typeof view!=='object'||!visit(view.records??[]))return false;
    for(const [key,value]of Object.entries(view))if(!['rows','records','columns'].includes(key)&&!visit(value))return false;
    const commentColumns=Array.isArray(view.columns)?view.columns.flatMap((label,index)=>typeof label==='string'&&/^(?:saved\s+)?comment$/iu.test(label.trim())?[index]:[]):[];
    if(!commentColumns.length)return visit(view.rows??[]);
    if(!Array.isArray(view.rows))return false;
    return view.rows.every(row=>Array.isArray(row)&&row.length===view.columns.length&&commentColumns.every(index=>
      row.some((identity,cell)=>cell!==index&&matches(identity,row[index]))));
  });
}
const absentPrefix=prefix=>/\b(?:cannot|can't|could not|does not|do not)\s+(?:confirm|verify|prove|establish|mean|say|infer)\s+(?:that\s+)?$/iu.test(prefix.slice(-140));
const positive=(text,pattern)=>[...text.matchAll(new RegExp(pattern.source,pattern.flags.replace('g','')+'g'))].some(match=>!absentPrefix(text.slice(0,match.index)));
export function gradeTeachingFeedbackNativeCase(input,envelope,{observation,nativeSurveyOrder=false,sqlScenario=false}={}){
  const row=resolve(input),fixture=teachingFeedbackNativeFixtureForCase(row,{nativeSurveyOrder,sqlScenario}),base=gradeCase(row,envelope),checks=[];
  const check=(id,passed,detail)=>checks.push({id,passed:passed===true,detail});
  check('teaching.caller',observation?.callerId===(row.auth==='anonymous'?null:owner),'Exact independently bound account, never another owner substituted with caller records.');
  check('teaching.nativeReads',isDeepStrictEqual(observation?.reads,fixture.reads),'Exact authorized student views, raw caller DTO and failures; no manage or answer shortcut.');
  check('teaching.selectedEvidence',evidenceMatches(observation?.evidence,fixture.evidence),'Whole selected source rows, exact omission counts/cap flags and opt-in comments, separate from raw rows.');
  check('teaching.companions',isDeepStrictEqual(observation?.companions,fixture.companions),'Mixed current course/year facts require their own independent sources.');
  for(const name of ['writeRequests','storageRequests','publicRequests'])check('teaching.'+name,Array.isArray(observation?.[name])&&observation[name].length===0,'No implicit action, file, anonymous answer query or public research.');
  const events=[...(Array.isArray(envelope?.events)?envelope.events:[]),...(Array.isArray(envelope?.body?.activity)?envelope.body.activity:[])];
  check('teaching.eventSchema',[envelope?.events,envelope?.body?.activity].every(value=>value===undefined||Array.isArray(value)),'Malformed event collections do not silently disappear.');
  const reads=events.filter(event=>String(event?.kind).startsWith('account-read:'));
  const allowed=row.toolPolicy.allowed;
  check('teaching.citations',(envelope?.body?.citations||[]).every(citation=>!String(citation?.chunkId).startsWith('account:')||allowed.includes(citation.chunkId.slice(8))),'No unrelated private citation substitutes for the selected sources.');
  check('teaching.noPublicEvents',!events.some(event=>/^(?:(?:public|web|knowledge)(?:[-:]|$)|page-context$)/u.test(String(event?.kind))),'A private feedback question is never sent to public research.');
  check('teaching.tools',reads.every(event=>/^account-read:[A-Za-z]+:[12]$/u.test(event.kind)&&allowed.includes(event.kind.split(':')[1])&&['running','complete','unavailable'].includes(event.status)),'Exact relevant tool names and genuine terminal status, no planner credit.');
  for(const name of row.toolPolicy.required)check('teaching.tool.'+name,reads.some(event=>event.kind.split(':')[1]===name&&event.status===(row.toolPolicy.failed.includes(name)?'unavailable':'complete')),'Each required collection has a terminal read observation.');
  const visible=strings(envelope?.body),clauses=visible.flatMap(text=>text.split(/\n|(?<=[.!?。！？])\s+|\b(?:but|however|therefore)\b/iu));
  const links=renderedLinks(envelope?.body),allowedLinks=new Set(row.expected.requiredLinks.map(path=>'https://stu.best'+path));
  check('teaching.renderedLinks',Array.isArray(links)&&links.every(link=>{try{const url=new URL(link,'https://stu.best');return typeof link==='string'&&!link.startsWith('//')&&!url.username&&!url.password&&allowedLinks.has(url.href);}catch{return false;}}),
    'Only actual selected local destinations are links; code-quoted saved text remains inert, and active injected URLs are rejected.');
  check('teaching.noPrivateMarkers',!visible.some(text=>fixture.forbidden.some(marker=>text.includes(marker))),'No owner/row IDs, profile or foreign/anonymous values are exposed.');
  const allowedComments=new Set(fixture.evidence.flatMap(view=>view.records).flatMap(record=>Object.hasOwn(record,'comment')?[record.comment]:[]));
  const withheldComments=[...noComment,...fixture.data.immediate.feedback.map(item=>item.comment)].filter(value=>!allowedComments.has(value));
  check('teaching.noUnrequestedComment',!visible.some(text=>withheldComments.some(value=>text.includes(value))),'A comment opt-in is limited to the selected course, never every saved comment.');
  if(row.readExpectation.comments)check('teaching.commentPair',fixture.evidence.flatMap(view=>view.records).filter(record=>Object.hasOwn(record,'comment')).every(record=>exactCommentPair(envelope?.body?.answer,record)),
    'Each literal saved comment is paired to its requested course; all visible comment claims for that course must match exactly.');
  check('teaching.cardCommentPair',cardCommentsMatch(envelope?.body?.views??[],fixture.evidence.flatMap(view=>view.records).filter(record=>Object.hasOwn(record,'comment'))),
    'Every displayed comment field must bind to the selected course and exact saved literal, including result cards.');
  let privateKeys=false;JSON.stringify(envelope?.body,(key,value)=>{if(['ratings','averages','results','manager','userId','sectionId','surveyId'].includes(key))privateKeys=true;return value;});
  check('teaching.noManagerOrAnonymous',!privateKeys&&!visible.some(text=>/"(?:ratings|averages|results|manager|userId|sectionId|surveyId)"\s*:/u.test(text))
    &&!clauses.some(text=>positive(text,/\byour\s+(?:(?:anonymous|teaching evaluation|survey)\s+)+(?:rating|score)\s+(?:was|is|:)\s*[1-5]\b|\byour\s+(?:anonymous|survey)\s+comment\s+(?:was|is|:)\s/iu)),
    'Student evidence cannot contain anonymous ratings/comments or manager results in prose or structured cards.');
  if(row.id.includes('foreign'))check('teaching.foreignDenial',!clauses.some(text=>/\b(?:I|we)\s+can\s+(?:read|access|show|retrieve)\s+(?:Alice['’]s|Bob['’]s|another student['’]s)/iu.test(text)),
    'A separate own-account caveat cannot justify claiming access to another student.');
  check('teaching.noActionOrOutcome',!clauses.some(text=>positive(text,/\b(?:I|we)\s+(?:have\s+)?(?:submitted|sent|changed|deleted|released|approved)\s+(?:your|the)\b|\b(?:the\s+)?(?:teacher|instructor|university)\s+(?:has\s+)?(?:read|received|approved)\s+your\b|\byour teacher\s+(?:has\s+)?changed the lesson\b/iu)),'Completion/review labels do not establish actions, delivery or educational outcomes.');
  if(row.readExpectation.failed.length)check('teaching.failureNotEmpty',!clauses.some(text=>positive(text,/\b(?:(?:you have|there are)\s+)?no\s+(?:(?:saved|immediate|teaching|evaluation|local)\s+)*(?:feedback|surveys|evaluations|records)\b/iu)),'A failed view remains unknown rather than empty.');
  if(fixture.evidence.some(view=>view.capReached))check('teaching.capNotTotal',!clauses.some(text=>positive(text,/\b(?:all|entire|complete)\s+(?:your\s+)?(?:history|historical records|surveys|feedback|courses)\s+(?:is|are|has|contains)\b|\byou have exactly (?:50|100|200)\s/iu)),'A native cap does not establish an exhaustive total.');
  const all=[...base.checks,...checks];return {...base,checks:all,failures:all.filter(item=>!item.passed),passed:all.every(item=>item.passed)};
}
