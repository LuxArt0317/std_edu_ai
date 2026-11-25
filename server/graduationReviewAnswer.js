import {isDeepStrictEqual} from 'node:util';
import {loadOwnGraduationReviewAnswer} from './affairsWorkspace.js';
import {runAnswerVerification} from './answerVerification.js';
import {graduationReviewPaths} from './graduationReview.js';

const evidenceId='account:graduationReview';

function literal(value){
  const visible=value.trim().replace(/\s+/gu,' ');
  const delimiter='`'.repeat(Math.max(0,...(visible.match(/`+/gu)??[]).map(run=>run.length))+1);
  return delimiter+' '+visible+' '+delimiter;
}

function detailStatement({view,name},detail,zh){
  const noun=view==='credits'?(zh?'學分類別':'credit category'):(zh?'課程要求':'course requirement');
  if(detail.state==='missing')return zh?`這份報告沒有符合 ${literal(name)} 的${noun}。`
    :`This report has no matching ${noun} named ${literal(name)}.`;
  if(detail.state==='ambiguous')return zh?`這份報告有多筆符合 ${literal(name)} 的${noun}，請指定其中一筆。`
    :`More than one saved ${noun} matches ${literal(name)}. Please specify which one.`;
  if(view==='credits'){
    const credit=value=>value??(zh?'未記錄':'not recorded');
    const fields=zh?['要求學分','完成學分','符合學分','明細小計']:['Required credits','Completed credits','Matched credits','Detail subtotal'];
    const values=[detail.requiredCredits,detail.completedCredits,detail.matchedCredits,detail.detailSubtotalCredits];
    return [literal(detail.label),...fields.map((field,index)=>`- ${field}: ${credit(values[index])}`)].join('\n');
  }
  const nameText=literal(detail.label),titles=detail.matchedTitles;
  if(!titles.length)return zh?`${nameText}未記錄符合課程。`:`${nameText} has no saved matched courses.`;
  const shown=titles.slice(0,12);
  const heading=zh?`${nameText}在報告中記錄的符合課程：`:`Saved course matches for ${nameText}:`;
  const additional=shown.length<titles.length?(zh?`另有 ${titles.length-shown.length} 筆符合課程，請查看報告。`
    :`Open the report for the other ${titles.length-shown.length} saved matches.`):null;
  return [heading+' '+shown.map(literal).join(zh?'、':', '),additional].filter(Boolean).join('\n');
}

export async function answerGraduationReview({account,question,selection,deadline,onProgress}){
  const {kind,view}=selection;
  const zh=/\p{Script=Han}/u.test(question);
  const label=kind==='legacy'?(zh?'舊版畢業檢核':'Legacy graduation review'):(zh?'教務應用服務畢業檢核':'Academic Services graduation review');
  const url=graduationReviewPaths[kind],link=`[${zh?'開啟':'Open the '}${label}](${url})`;
  const cite={chunkId:evidenceId,title:label,url,sourceName:zh?'stu.best 站內參考報告':'Local stu.best reference report'};
  const observed=new Map();
  const emit=step=>{observed.set(step.kind,step);try{onProgress?.(step);}catch{/* Closed response stream. */}};
  const read=async attempt=>{
    const step={kind:'account-read:graduationReview:'+attempt,label:zh?'查詢畢業檢核紀錄':'Checked graduation review records',
      detail:zh?'只查詢你選擇的站內參考報告欄位。':'Looked up only the requested fields of your selected local reference report.'};
    emit({...step,status:'running'});
    try{
      const saved=await loadOwnGraduationReviewAnswer(account,selection,{deadline});
      emit({...step,status:'complete'});
      return [{id:evidenceId,url,content:JSON.stringify(saved)}];
    }catch{
      emit({...step,status:'unavailable'});
      return [];
    }
  };
  const withheld={status:'abstained',answer:'',citations:[],suggestedQuestions:[]};
  const format=sources=>{
    if(sources.length!==1||sources[0].id!==evidenceId||sources[0].url!==url)return null;
    const saved=JSON.parse(sources[0].content);
    if(saved.reportKind!==kind||saved.view!==view)return null;
    let status;
    if(!saved.found)status=zh?`此帳戶沒有已儲存的${label}報告。`:`Your account has no saved ${kind==='legacy'?'Legacy':'Academic Services'} graduation report.`;
    else if(saved.detail)status=detailStatement(selection,saved.detail,zh);
    else if(saved.statusText===null)status=zh?`${label}未記錄狀態文字。`:`The saved ${label} has no recorded status text.`;
    else if(!saved.statusText.trim())status=zh?`${label}的狀態欄為空白。`:`The saved ${label} status field is blank.`;
    else status=`${label}${zh?'狀態：':' status: '}${literal(saved.statusText)}`;
    const provenance=zh?'資料來自 stu.best 站內參考報告。':'This lookup covers local stu.best reference records.';
    const eligibility=view==='eligibility'?(zh?'無法從這份站內參考報告確認你是否可正式畢業。'
      :'I can’t verify whether you can officially graduate from this local reference report.'):null;
    return {status:'answered',answer:[eligibility,status,provenance,link].filter(Boolean).join('\n\n'),citations:[cite],suggestedQuestions:[],
      grounding:{source:'account',webSearched:false,checkedAt:saved.checkedAt,degraded:false}};
  };
  const initial=await read(1);
  const result=await runAnswerVerification({question,initialAnswer:format(initial)??withheld,deadline,onProgress:emit,
    loadEvidence:async({attempt})=>attempt===1?initial:read(attempt),
    verify:async({candidate,evidence})=>{
      const supported=format(evidence);
      return supported&&isDeepStrictEqual(candidate,supported)?{ok:true}:{ok:false,reason:'evidence_unavailable'};
    },
    repair:async({evidence})=>format(evidence)??withheld,
  });
  const unavailable=view==='status'||view==='eligibility'
    ?(zh?`目前無法確認${label}的已儲存狀態。`:`I couldn’t verify the saved ${label} status.`)
    :(zh?`目前無法確認${label}中要求的欄位。`:`I couldn’t verify the requested fields in the saved ${label}.`);
  return {...result,...(result.verification.status==='verified'?{}:{answer:unavailable+'\n\n'+link}),activity:[...observed.values()]};
}
