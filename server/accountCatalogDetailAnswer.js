import {isDeepStrictEqual} from 'node:util';
import {runAnswerVerification} from './answerVerification.js';
import {catalogDetailIntent} from './catalogDetailIntent.js';
import {loadSyllabusDetail} from './syllabusSearch.js';
import {normalizeCourseSyllabus} from '../src/features/public/affairs/courseSyllabusModel.js';
import {syllabusGradingLabels} from '../src/features/public/affairs/courseSyllabusOptions.js';

const sourceId='account:courseCatalog';
const grounding={source:'account',webSearched:false};
const language=question=>(english,chinese)=>/\p{Script=Han}/u.test(question)?chinese:english;
const labels={instructor:['Teacher','教師'],credits:['Credits','學分數'],prerequisite:['Prerequisite','先修課程'],
  objectives:['Teaching objectives','教學目標'],language:['Language of instruction','授課語言']};
const englishGrading=['Regular assessment','Midterm assessment','Final assessment','Other'];
const inline=value=>String(value).replace(/[\r\n\t]+/gu,' ').replace(/[&<>"'`*_[\]()#!~|:\\]/gu,char=>'&#'+char.charCodeAt(0)+';');
const localLink=(title,path)=>'['+title+']('+path+')';

export function catalogDetailGuestAnswer(question,selection){
  const say=language(question);
  const title=say('Sign in to open the selected offering','登入後查看所選課程');
  const url='/school-affairs/login?next='+encodeURIComponent(selection.path);
  return {status:'handoff',answer:localLink(title,url),
    citations:[{chunkId:'directory:courseCatalog',title,url,claim:title,sourceName:'School Affairs'}],
    suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}

function render(question,selection,evidence){
  const source=evidence[0];
  if(evidence.length!==1||source.id!==sourceId||source.url!==selection.path)throw new Error('Wrong offering evidence.');
  const row=JSON.parse(source.content);
  const say=language(question),title=say('Open the selected offering','開啟所選課程');
  const citation={chunkId:sourceId,title,url:selection.path,claim:say('Selected offering lookup','所選課程查詢'),
    sourceName:'School Affairs catalog',locator:null,effectiveAt:null,reviewedAt:null};
  const base={citations:[citation],suggestedQuestions:[],grounding};
  const link=localLink(title,selection.path);
  if(row===null)return {...base,status:'handoff',
    answer:say('There is no published stu.best sample offering at this link.','此連結查無已公開的 stu.best 範例課程。')+'\n\n'+link};
  if(row.id!==selection.id)throw new Error('Wrong offering ID.');
  const missing=say('not recorded','未記錄');
  const lines=[say('Published stu.best sample','stu.best 已公開範例')+': '+inline(row.name)+' ('+inline(row.code)+')'];
  for(const field of selection.fields){
    if(field==='course_code'||field==='course_name')continue;
    if(field==='grading'){
      row.grading.forEach(({index,weight})=>{
        const gradeLabel=say('Grading row '+(index+1)+' ('+englishGrading[index]+')','評分第 '+(index+1)+' 項（'+syllabusGradingLabels[index]+'）');
        lines.push(gradeLabel+': '+(weight===null?missing:weight+'%'));
      });
      continue;
    }
    lines.push(say(...labels[field])+': '+(row.fields[field]===''?missing:inline(row.fields[field])));
  }
  if(selection.enrollment)lines.push(say('This catalog listing cannot confirm your enrollment. Check My Subjects for your registered courses.',
    '此課程目錄無法確認你的選課紀錄。請到我的科目查詢已選課程。'));
  return {...base,status:'answered',answer:[...lines,link].join('\n\n')};
}

export async function answerCatalogDetail({account,question,selection,deadline,onProgress}){
  const expected=catalogDetailIntent(question,selection.path);
  if(!isDeepStrictEqual(selection,expected))throw new Error('Invalid offering selection.');
  const activity=new Map();
  const progress=step=>{
    activity.set(step.kind,step);
    try{onProgress?.(step);}catch{/* The browser may have disconnected. */}
  };
  const load=async attempt=>{
    const kind='account-read:courseCatalog:'+attempt,label='Checked the published offering';
    progress({kind,label,status:'running',detail:'Reading the exact selected course or syllabus.'});
    try{
      const {row}=await loadSyllabusDetail({...account,requestDeadline:deadline},selection.id);
      let projected=null;
      if(row){
        const syllabus=normalizeCourseSyllabus(row.syllabus);
        const fields=Object.fromEntries(selection.fields.filter(field=>Object.hasOwn(labels,field)).map(field=>
          [field,Object.hasOwn(syllabus,field)?syllabus[field]:row[field]]));
        const grading=selection.fields.includes('grading')?syllabus.grading.map(({weight},index)=>({index,weight}))
          .filter(({index})=>selection.gradingRow===null||index===selection.gradingRow-1):[];
        projected={id:row.id,name:row.course_name,code:row.course_code,fields,grading};
      }
      progress({kind,label,status:'complete',detail:'Checked the selected published record and requested fields.'});
      return [{id:sourceId,url:selection.path,content:JSON.stringify(projected)}];
    }catch{
      progress({kind,label,status:'unavailable',detail:'The selected offering could not be read.'});
      return [];
    }
  };
  const format=evidence=>render(question,selection,evidence);
  const first=await load(1);
  const draft=first.length?format(first):{status:'abstained',answer:'',citations:[],grounding};
  const result=await runAnswerVerification({question,initialAnswer:draft,deadline,onProgress:progress,
    loadEvidence:({attempt})=>attempt===1?Promise.resolve(first):load(attempt),
    verify:async({candidate,evidence})=>evidence.length?{ok:isDeepStrictEqual(candidate,format(evidence))}:{ok:false,reason:'evidence_unavailable'},
    repair:async({evidence})=>evidence.length?format(evidence):draft});
  const say=language(question);
  return {...result,activity:[...activity.values()],...(result.status==='abstained'?{
    answer:say('I couldn’t verify this published offering. Try opening it and asking again.','目前無法查證這筆已公開的課程。請開啟課程後再試一次。')
      +'\n\n'+localLink(say('Open the selected offering','開啟所選課程'),selection.path),
  }:{})};
}
