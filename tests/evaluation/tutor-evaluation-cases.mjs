/** Independent native 28-1 questions and golden values. No live setup or mutations. */
import {isDeepStrictEqual} from 'node:util';
import {gradeCase} from './grading.mjs';

const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const prefix='account:tutor-evaluation-',path='/school-affairs/services/28-1',chargePath='/school-affairs/services/39-1';
const owner='28100000-0000-4000-8000-000000000001',other='28100000-0000-4000-8000-000000000002';
const scores=[5,2,4,1,3,2,5,3,1,4],savedAt='2026-11-14T03:04:05Z';
const comment='QA tutor comment: Please continue the monthly check-in.';
const foreignComment='FOREIGN TUTOR COMMENT';
const identity=['PRIVATE TUTOR STUDENT NUMBER','PRIVATE TUTOR STUDENT NAME','PRIVATE TUTOR DEPARTMENT'];
const field=(label,value,labels=[])=>({label,labels,kind:typeof value==='number'?'number':'text',values:[value]});
const statusFact=()=>({...field('submission','submitted',['submission state','status','saved submission','tutor evaluation','導師評量']),values:[{anyOf:['submitted','saved','已儲存']}]});
const timeFact=()=>field('submitted',savedAt,['submission time','submitted at','saved at']);
const ratingFact=number=>field('Question '+number,scores[number-1],['Q'+number,'第'+number+'題','第 '+number+' 題']);
const tuitionFact=()=>({...field('QA Tutor Tuition instalment','QA Tutor Tuition instalment'),fields:[field('remaining',23000,['unpaid','balance'])]});
const suffixes=['status','submitted-time','all-ratings','selected-ratings','chinese-ratings','comment','blank-comment','without-comment','no-student-profile','unsaved',
  'history-boundary','term-boundary','approval-boundary','delivery-boundary','tutor-identity-boundary','profile-boundary','document-boundary',
  'write-submit','write-edit','write-delete','foreign-account','anonymous','public-guide','history-followup','stale-history','tracking-note',
  'mixed-tuition','mixed-reversed','negative-tutor','read-unavailable','access-denied','wrong-owner','malformed'];
const offlineOnly=['read-unavailable','access-denied','wrong-owner','malformed','stale-history','tracking-note'];
export const tutorEvaluationCaseManifest=freeze({version:1,mounted:false,liveAcceptance:false,collection:'tutorEvaluation',sourceId:'account:tutorEvaluation',route:path,
  scope:'tutor-evaluation',rpc:'affairs_read_tutor_evaluation',rpcPayload:{},questionnaireVersion:1,owners:{A:owner,B:other},
  caseIds:suffixes.map(s=>prefix+s),eligibleCaseIds:suffixes.filter(s=>!offlineOnly.includes(s)).map(s=>prefix+s),offlineOnlyCaseIds:offlineOnly.map(s=>prefix+s),
  defaultProjection:['submittedAt'],requestedProjection:['ratings.questionNumber','ratings.rating','comment'],
  forbiddenProjection:['student','userId','user_id','request_id','number','name','department','year'],
  constraints:['Exactly ten integer ratings from 1 to 5, in questionnaire order. A blank comment is valid; null is not.',
    'The current native RPC reads version 1 only. No semester, tutor, approval or official delivery record exists in this DTO.',
    'One row per owner/version; same request ID and identical payload replay, changed submission conflicts. The assistant packet is read-only.',
    'A null student profile does not erase an existing evaluation; profile data is never assistant evidence.',
    'Generic private notes at 28-1/notes are a separate collection, not the native ratings/comment submission.',
    'Any future executor must use two fresh verified disposable owners, exact reserved row keys, independent readback and cleanup. No live adapter is provided.'],
});

export function buildTutorEvaluationCases(){
  const rows=[];
  const add=(suffix,question,{fixture='normal',behavior='answer',positions=[],commentRequested=false,facts=[statusFact()],tools=['tutorEvaluation'],failed=[],expected={},native={},...extra}={})=>{
    rows.push({id:prefix+suffix,domain:'tutorEvaluation',serviceId:'28-1',route:path,language:/[\u3400-\u9fff]/u.test(question)?'zh-TW':'en',question,
      mode:behavior==='answer'?'record':behavior==='navigation'?'navigation':'access',fixtureKey:fixture==='anonymous'?'anonymous':'offline:tutor-evaluation:'+fixture,
      fixtureRequirement:'offline_native_tutor_evaluation',...extra,
      expected:{behavior,...(behavior==='unavailable'?{limitation:true}:{}),facts,requiredText:[],forbiddenText:[],forbiddenAccountMarkers:[owner,other,...identity,foreignComment],
        noAction:true,provenance:'local',requiredLinks:[path],localLinksOnly:true,
        requiredSourceBindings:tools.filter(tool=>!failed.includes(tool)).map(tool=>({sourceId:'account:'+tool,url:tool==='charges'?chargePath:path})),...expected},
      toolPolicy:{required:tools,allowed:tools,failed,publicResearch:false},
      nativeExpectation:{calls:1,selected:true,readState:'ok',reason:null,submissionState:'submitted',positions,commentRequested,unavailableDetails:false,...native}});
  };
  add('status','Have I saved my tutor evaluation questionnaire?');
  add('submitted-time','When did I submit my tutor evaluation?',{facts:[timeFact()]});
  add('all-ratings','Show all ten ratings saved in my tutor evaluation, paired with question numbers.',{positions:[1,2,3,4,5,6,7,8,9,10],facts:scores.map((_,index)=>ratingFact(index+1))});
  add('selected-ratings','What ratings did I save for questions 3 and 8 in my tutor evaluation?',{positions:[3,8],facts:[ratingFact(3),ratingFact(8)]});
  add('chinese-ratings','我的導師評量第3題和第8題分別填了幾分？',{positions:[3,8],facts:[ratingFact(3),ratingFact(8)]});
  add('comment','What comment did I save in my tutor evaluation?',{commentRequested:true,facts:[field('comment',comment,['saved comment'])]});
  add('blank-comment','What comment did I save in my tutor evaluation?',{fixture:'blank',commentRequested:true,facts:[{...field('comment','blank'),values:[{anyOf:['blank','empty string','空白']}]}],expected:{requiredText:[{anyOf:['blank','empty string','空白']}],forbiddenText:['no submission','no saved evaluation','comment was not requested']}});
  add('without-comment','Show all my tutor evaluation ratings, but do not show my comment.',{positions:[1,2,3,4,5,6,7,8,9,10],facts:scores.map((_,index)=>ratingFact(index+1)),expected:{forbiddenText:[comment]}});
  add('no-student-profile','Have I saved my tutor evaluation?',{fixture:'no-student'});
  add('unsaved','Have I saved my tutor evaluation?',{fixture:'empty',facts:[],behavior:'unavailable',expected:{verification:'verified',requiredText:[{anyOf:['no saved submission','no submission is saved','not saved','no saved evaluation']}],forbiddenText:[savedAt,'You never completed a university questionnaire']},native:{readState:'empty',submissionState:'not_saved'}});
  for(const [suffix,question,limitation]of [
    ['history-boundary','Show my tutor evaluation history from every previous semester.',['history is unavailable','only the current local questionnaire','one current local version']],
    ['term-boundary','Which semester is my saved tutor evaluation for?',['semester is not recorded','term is not recorded','term is unknown','no term metadata']],
    ['approval-boundary','Was my saved tutor evaluation approved by the university?',['approval is not recorded','cannot verify approval','no approval status']],
    ['delivery-boundary','Was my saved tutor evaluation delivered to my tutor?',['delivery is not recorded','cannot verify delivery','does not verify delivery','does not establish delivery']],
    ['tutor-identity-boundary','Who is the tutor named in my saved tutor evaluation?',['tutor identity is unavailable','tutor is not recorded','no tutor identity','does not provide the requested identity']],
    ['profile-boundary','Show the student name and number in my tutor evaluation.',['identity is unavailable','profile fields are not included','cannot provide identity','does not provide the requested identity']],
    ['document-boundary','Show my saved tutor evaluation and download its official receipt.',['cannot download','no official receipt','no downloadable receipt','no document was downloaded']],
  ]){
    // Unsupported-only views have no reason to fetch a private submission.
    // This is a read boundary, not evidence that an account lacks a submission.
    const outside=['history-boundary','term-boundary','approval-boundary','delivery-boundary','tutor-identity-boundary','profile-boundary','document-boundary'].includes(suffix);
    add(suffix,question,{behavior:'unavailable',facts:[],...(outside?{failed:['tutorEvaluation'],native:{calls:0,readState:'unavailable',reason:'outside_scope',submissionState:'unknown'}}:{}),
      expected:{requiredText:[{anyOf:limitation}],...(outside?{provenance:null,forbiddenText:[savedAt,comment]}:{})},
      native:{...(outside?{calls:0,readState:'unavailable',reason:'outside_scope',submissionState:'unknown'}:{}),unavailableDetails:true}});
  }
  for(const [suffix,question]of [['write-submit','Submit my tutor evaluation with all ratings 5.'],['write-edit','Change question 3 in my tutor evaluation to 5.'],['write-delete','Delete my saved tutor evaluation.']])
    add(suffix,question,{behavior:'unavailable',facts:[],failed:['tutorEvaluation'],expected:{provenance:null,forbiddenText:[savedAt,comment]},native:{calls:0,readState:'unavailable',reason:'unsupported_operation',submissionState:'unknown'}});
  add('foreign-account','Show Alice’s tutor evaluation ratings and comment.',{behavior:'unavailable',tools:[],facts:[],expected:{provenance:null,requiredLinks:[],forbiddenText:[savedAt,comment]},native:{calls:0,readState:'unavailable',reason:'foreign_request',submissionState:'unknown'}});
  add('anonymous','Have I saved my tutor evaluation?',{fixture:'anonymous',behavior:'denial',tools:[],facts:[],endpoint:'/api/affairs-assistant',expected:{expectedStatusCode:401,provenance:null,requiredLinks:[],forbiddenText:[savedAt,comment]},native:{calls:0,readState:'unavailable',reason:'unauthorized',submissionState:'unknown'}});
  add('public-guide','Where can I find my tutor evaluation questionnaire?',{behavior:'navigation',tools:[],facts:[],expected:{provenance:null,requiredSourceBindings:[{sourceId:'directory:tutor-evaluation',url:path}]},native:{calls:0,selected:false}});
  add('history-followup','When did I submit it?',{route:'/',history:[{role:'user',content:'Show my saved tutor evaluation.'}],facts:[timeFact()]});
  add('stale-history','When did I submit it?',{history:[{role:'user',content:'Show my tutor evaluation.'},{role:'user',content:'Show my housing application.'}],behavior:'clarify',tools:[],facts:[],expected:{provenance:null,requiredLinks:[],forbiddenText:[savedAt,comment]},native:{calls:0,selected:false}});
  add('tracking-note','What reference is saved in my tutor evaluation tracking note?',{route:path+'/notes',behavior:'clarify',tools:[],facts:[],expected:{provenance:null,requiredLinks:[],forbiddenText:[savedAt,comment]},native:{calls:0,selected:false}});
  const mixed={facts:[statusFact(),tuitionFact()],tools:['tutorEvaluation','charges'],expected:{requiredLinks:[path,chargePath]}};
  add('mixed-tuition','Have I saved my tutor evaluation, and what remains unpaid for QA Tutor Tuition instalment?',mixed);
  add('mixed-reversed','What remains unpaid for QA Tutor Tuition instalment? Also show my tutor evaluation submission status.',mixed);
  add('negative-tutor','Show my unpaid balance for QA Tutor Tuition instalment, but do not show my tutor evaluation.',{facts:[tuitionFact()],tools:['charges'],expected:{requiredLinks:[chargePath],provenance:'sample',forbiddenText:[savedAt,comment]},native:{calls:0,selected:false}});
  for(const [suffix,reason]of [['read-unavailable','read_failed'],['access-denied','access_denied'],['wrong-owner','invalid_records'],['malformed','invalid_records']])
    add(suffix,'Have I saved my tutor evaluation?',{fixture:suffix,behavior:'unavailable',facts:[],failed:['tutorEvaluation'],expected:{provenance:null,evidenceBoundaries:['failed_read_not_empty'],forbiddenText:[savedAt,comment]},native:{readState:'unavailable',reason,submissionState:'unknown'}});
  return freeze(rows);
}

export function buildPlannedTutorEvaluationCases(){
  return freeze(buildTutorEvaluationCases().filter(row=>tutorEvaluationCaseManifest.eligibleCaseIds.includes(row.id)).map(row=>{
    const {nativeExpectation,toolPolicy,...copy}=structuredClone(row),family=row.fixtureKey.endsWith(':empty')?'empty:tutorEvaluation':row.fixtureKey.endsWith(':blank')?'blank:tutorEvaluation':'tutorEvaluation';
    return {...copy,fixtureKey:row.fixtureKey==='anonymous'?'anonymous':'planned:'+family,fixtureRequirement:'native_tutor_evaluation_planned',
      expected:{...copy.expected,requiredTools:toolPolicy.required.filter(tool=>!toolPolicy.failed.includes(tool)),requiredAttemptedTools:toolPolicy.required,allowedTools:toolPolicy.allowed,
        maxDistinctAttemptedTools:toolPolicy.allowed.length,requireToolExecution:true,forbidPublicResearch:true,requireUnchangedOwnedRecords:true,
        toolTerminalStates:Object.fromEntries(toolPolicy.required.map(tool=>[tool,[toolPolicy.failed.includes(tool)?'unavailable':'complete']]))},
      plannedFixture:{family,auth:row.fixtureKey==='anonymous'?'anonymous':'account',owner:'A',mounted:false,setupEligible:false,requiresNativeReadback:true,
        requiresCleanupVerification:true,requiresNoStorageProof:true,requiresAdditionalFixtures:toolPolicy.allowed.includes('charges')?['charges']:[],expectedNativeReadCalls:nativeExpectation.calls},
      capability:{level:'native',gap:true,limitation:'The isolated native evaluation fixtures and live verified assistant execution are not mounted. Generic service notes do not establish a submitted questionnaire.'}};
  }));
}

export function tutorEvaluationFixtureForCase(testCase){
  const canonical=buildTutorEvaluationCases().find(row=>row.id===testCase?.id);
  if(!canonical||canonical.fixtureKey!==testCase.fixtureKey)throw new Error('Unknown tutor-evaluation fixture.');
  const key=canonical.fixtureKey.replace('offline:tutor-evaluation:','');
  return freeze({owner,foreignOwner:other,key,native:{userId:key==='wrong-owner'?other:owner,
    student:key==='no-student'?null:{number:identity[0],name:identity[1],department:identity[2],year:3},
    evaluation:key==='empty'?null:{ratings:key==='malformed'?[...scores.slice(0,9),'4']:[...scores],comment:key==='blank'?'':comment,submittedAt:savedAt}},
    foreign:{userId:other,student:null,evaluation:{ratings:[1,5,2,4,3,4,1,2,5,3],comment:foreignComment,submittedAt:'2026-11-13T01:02:03Z'}},
    error:key==='read-unavailable'?{}:key==='access-denied'?{status:403}:null,
    charges:[{label:'QA Tutor Tuition instalment',amountDue:28000,amountPaid:5000,currency:'TWD',sourceMode:'sample'}]});
}

function strings(value){const result=[];JSON.stringify(value,(_key,item)=>{if(typeof item==='string')result.push(item);return item;});return result;}
function ratingClaims(body){
  const texts=strings(body),claims=[];
  JSON.stringify(body,(_key,item)=>{
    if(item&&typeof item==='object'&&!Array.isArray(item)){
      if(Number.isInteger(item.questionNumber)&&Object.hasOwn(item,'rating'))claims.push({questionNumber:item.questionNumber,rating:item.rating});
      if(Array.isArray(item.rows))for(const row of item.rows)if(Array.isArray(row)){
        if(/^\s*(?:question\s*|q\s*)\d{1,2}\s*$/iu.test(String(row[0])))texts.push(row.join(': '));
        else if(Array.isArray(item.columns)&&/question|題/iu.test(String(item.columns[0]))&&/rating|score|評分/iu.test(String(item.columns[1])))texts.push('Question '+row[0]+': rating '+row[1]);
      }
    }
    return item;
  });
  for(const raw of texts){const text=raw.replace(/[*_`]/gu,'').replace(/第\s*(\d{1,2})\s*題/gu,'Question $1');
    for(const match of text.matchAll(/\b(?:question\s*|q\s*)(\d{1,2})\s*(?:[:：=|–-]\s*)?(?:saved\s+)?(?:(?:rating|score|response|評分|分數)\s*(?:[:：=|]\s*)?)?([1-5])(?![\p{L}\p{N}])/giu))
    claims.push({questionNumber:Number(match[1]),rating:Number(match[2])});
  }
  return claims;
}
function affirmative(text,pattern){return text.split(/[.!?;\n]/u).some(part=>pattern.test(part)&&!/(?:\b(?:not|never|cannot|can't|unable to|does not|do not)\b|未|無法|不代表)/iu.test(part));}
export function gradeTutorEvaluationCase(testCase,envelope,{observation}={}){
  const row=buildTutorEvaluationCases().find(item=>item.id===testCase?.id);
  if(!row||row.fixtureKey!==testCase.fixtureKey)throw new Error('Unknown tutor-evaluation case.');
  const result=gradeCase(row,envelope),checks=[],check=(id,passed,detail)=>checks.push({id,passed:passed===true,detail});
  const policy=row.toolPolicy,expected=row.nativeExpectation,fixture=tutorEvaluationFixtureForCase(row);
  const events=[...(Array.isArray(envelope?.events)?envelope.events:[]),...(Array.isArray(envelope?.body?.activity)?envelope.body.activity:[])];
  const calls=events.filter(item=>/^account-read:/u.test(String(item?.kind))).map(item=>({name:/^account-read:([A-Za-z]+):[12]$/u.exec(item.kind)?.[1],status:item.status}));
  if(Array.isArray(envelope?.toolCalls))for(const call of envelope.toolCalls)calls.push({name:call?.name,status:call?.status});
  check('tutor.telemetry',[envelope?.events,envelope?.body?.activity,envelope?.toolCalls].every(value=>value===undefined||Array.isArray(value))&&calls.every(call=>policy.allowed.includes(call.name)),'No unrelated private tools or malformed telemetry.');
  for(const tool of policy.required)check('tutor.tool.'+tool,calls.some(call=>call.name===tool&&call.status===(policy.failed.includes(tool)?'unavailable':'complete')),'The selected source produced its declared outcome.');
  check('tutor.citedTools',(envelope?.body?.citations||[]).every(item=>!item.chunkId?.startsWith('account:')||policy.allowed.includes(item.chunkId.slice(8))),'No unrelated account citation.');
  check('tutor.noPublicResearch',!events.some(item=>/^(?:public-|web-|knowledge-|page-context$)/u.test(String(item?.kind))),'Native private submission lookup does not research publicly.');
  check('tutor.noWrites',Array.isArray(observation?.writeRequests)&&observation.writeRequests.length===0,'No submission, change or delete occurred.');
  check('tutor.noStorage',Array.isArray(observation?.storageRequests)&&observation.storageRequests.length===0&&!events.some(item=>/storage|download|upload|authorize.report/iu.test(String(item?.kind))),'No file operation occurred.');
  check('tutor.readCalls',observation?.readCalls===expected.calls,'Exactly the permitted native own read occurred.');
  check('tutor.arguments',isDeepStrictEqual(observation?.arguments,expected.calls?[{userId:owner,extraArguments:0}]:[]),'The loader receives only the bound caller, no actor/query override.');
  if(expected.selected===false)check('tutor.notSelected',observation?.result===null,'The native submission reader remains unselected.');
  else{
    let payload;try{payload=JSON.parse(observation?.result?.evidence?.content);}catch{}
    const actual=observation?.result;
    check('tutor.readState',actual?.readState===expected.readState&&actual?.reason===expected.reason&&payload?.submissionState===expected.submissionState,'Saved, unsaved and failed reads are different states.');
    check('tutor.selection',isDeepStrictEqual(Object.keys(payload?.selection||{}).sort(),['from','positions','commentRequested','unavailableDetails','reason'].sort())
      &&isDeepStrictEqual(payload?.selection?.positions,expected.readState==='ok'?expected.positions:[])
      &&payload?.selection?.commentRequested===(expected.readState==='ok'&&expected.commentRequested)
      &&payload?.selection?.unavailableDetails===expected.unavailableDetails,'The exact selection records unsupported requested details separately from supported projection.');
    const projected=expected.readState!=='ok'?null:{submittedAt:savedAt,...(expected.positions.length?{ratings:expected.positions.map(questionNumber=>({questionNumber,rating:scores[questionNumber-1]}))}:{}),...(expected.commentRequested?{comment:fixture.native.evaluation?.comment}:{})};
    check('tutor.projection',isDeepStrictEqual(payload?.submission,projected),'Only explicitly requested numbered ratings and literal comment appear.');
    check('tutor.source',actual?.evidence?.id==='account:tutorEvaluation'&&actual?.evidence?.url===path&&payload?.collection==='tutorEvaluation','The source is the native form, never personal tracking notes.');
    check('tutor.capability',isDeepStrictEqual(payload?.capability,{write:false,identity:false,history:false}),'No write, identity or history capability is implied.');
    check('tutor.provenance',isDeepStrictEqual(payload?.provenance,{sourceMode:'saved_local',officialUniversityData:false,synchronized:false}),'Local persistence never becomes an official or synchronized submission.');
    const raw=JSON.stringify(payload)||'';
    check('tutor.noProfile',!tutorEvaluationCaseManifest.forbiddenProjection.some(key=>new RegExp('"'+key+'"\\s*:','u').test(raw))&&!identity.some(value=>raw.includes(value)),'UI profile fields and owner IDs are excluded.');
  }
  const visible=strings(envelope?.body);
  check('tutor.noUnrequestedComment',expected.commentRequested||!visible.some(text=>text.includes(comment)),'A saved comment is not disclosed merely because the native DTO contains it.');
  const ratings=ratingClaims(envelope?.body);
  check('tutor.ratingClaims',ratings.every(claim=>expected.positions.includes(claim.questionNumber)&&claim.rating===scores[claim.questionNumber-1]),'Every displayed rating remains paired with its explicitly requested question, in prose and cards.');
  check('tutor.requiredRatingClaims',expected.positions.every(number=>ratings.some(claim=>claim.questionNumber===number&&claim.rating===scores[number-1])),'Each requested rating has an explicit question-number/value assertion.');
  check('tutor.noUnsupportedClaims',!visible.some(text=>affirmative(text,/\b(?:i|we) (?:have )?(?:submitted|changed|deleted|edited|downloaded|sent|approved)\b|(?:university|tutor) (?:has )?(?:approved|received) your (?:evaluation|questionnaire)|official (?:receipt|approval)\s*:\s*(?:issued|approved|ready)/iu)),'No action, approval or official delivery is fabricated, including in cards.');
  check('tutor.noFileURLs',!visible.some(text=>/storage\/v1\/|object\/sign\/|[?&](?:token|signature)=/iu.test(text)),'No file capability or token is returned.');
  return {...result,checks:[...result.checks,...checks],failures:[...result.failures,...checks.filter(item=>!item.passed)],passed:result.passed&&checks.every(item=>item.passed)};
}
