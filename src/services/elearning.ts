import {affairsClient} from '@/features/public/affairs/authClient';
import {elearningCoursePath,elearningPath,elearningScope,joinElearningCourse,
  type ElearningEnrollment,type ElearningWorkspace} from '../../server/elearningContract.js';
import type {AssistantResponse} from './researchAssistant';

async function access(userId:string,signal:AbortSignal){
  signal.throwIfAborted();
  const result=await affairsClient?.auth.getSession();
  signal.throwIfAborted();
  if(result?.error||result?.data.session?.user.id!==userId)throw new Error('請重新登入。');
  return result.data.session.access_token;
}
async function call(userId:string,signal:AbortSignal|undefined,path:string,body?:object){
  const timeout=AbortSignal.timeout(18000);
  const bounded=signal?AbortSignal.any([signal,timeout]):timeout;
  const token=await access(userId,bounded);
  const response=await fetch(path,{method:body?'POST':'GET',credentials:'omit',redirect:'error',cache:'no-store',signal:bounded,
    headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(!response.ok){
    void response.body?.cancel().catch(()=>{});
    throw new Error(response.status===404?'此課程目前無法在本站加選。':'無法載入數位學園資料。');
  }
  const result=await response.json();
  await access(userId,bounded);
  return result;
}
export async function loadElearning(userId:string,signal?:AbortSignal):Promise<ElearningWorkspace>{
  const data=await call(userId,signal,'/api/affairs-data?scope='+elearningScope);
  if(data?.userId!==userId||!['categories','courses','notices','enrollments'].every(key=>Array.isArray(data[key])))
    throw new Error('無法確認數位學園帳戶。');
  return data;
}
export async function joinElearning(userId:string,courseId:number,signal:AbortSignal):Promise<ElearningEnrollment>{
  const data=await call(userId,signal,'/api/affairs-action',{kind:joinElearningCourse,payload:{course_id:courseId}});
  if(data?.courseId!==courseId||typeof data.joinedAt!=='string'||!Number.isFinite(Date.parse(data.joinedAt)))
    throw new Error('無法確認加選結果。');
  return data;
}
export async function answerElearning(userId:string,question:string,signal?:AbortSignal):Promise<AssistantResponse>{
  const data=await loadElearning(userId,signal);
  const zh=/[\u3400-\u9fff]/u.test(question);
  const enrolled=new Set(data.enrollments.map(item=>item.courseId));
  const courses=data.courses.filter(item=>enrolled.has(item.id));
  const title=zh?'數位學園選課':'Remote-learning Moodle enrollments';
  const answer=courses.length
    ?(zh?'您在 stu.best 數位學園的課程：':'Your stu.best remote-learning Moodle courses:')
      +'\n\n'+courses.slice(0,10).map(course=>`- [${course.title.replace(/[[\]\\]/g,'\\$&')}](${elearningCoursePath(course.id)})`).join('\n')
    :zh?'您的 stu.best 帳戶目前沒有數位學園選課紀錄。':'Your stu.best account has no remote-learning Moodle enrollments.';
  return {status:'answered',answer,citations:[{chunkId:'account:elearning',title,url:elearningPath+'/my-courses',
    claim:zh?'您的數位學園選課紀錄':'Your remote-learning Moodle enrollment records',
    sourceName:'stu.best',locator:null,effectiveAt:null,reviewedAt:null}],suggestedQuestions:[],
    grounding:{source:'account',webSearched:false}};
}
