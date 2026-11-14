import {studentConductPath} from './studentConduct.js';

/** Describe a form destination or account boundary without reading records. */
export function studentConductGuide(question,scope,signedIn){
  const zh=/[\u3400-\u9fff]/u.test(question);
  const skipped=scope.excluded&&!scope.selected&&!scope.otherQuestion;
  if(scope.foreign||skipped){
    const answer=scope.foreign
      ?zh?'我只能查詢自己的 stu.best 帳戶。無法查看其他學生的獎懲紀錄。':'I can only check your signed-in stu.best account. I can’t show another student’s conduct records.'
      :zh?'已略過您要求不要查看的獎懲紀錄。':'I skipped the conduct records you asked me to leave out.';
    return {status:'handoff',answer,citations:[],suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
  }
  const direct=scope.navigation||signedIn;
  const url=direct?studentConductPath:'/school-affairs/login?next='+encodeURIComponent(studentConductPath);
  const title=direct?(zh?'開啟學生個人獎懲紀錄表':'Open student conduct records'):(zh?'登入後查看學生個人獎懲紀錄':'Sign in to check your saved student conduct records');
  return {status:direct?'answered':'handoff',answer:'['+title+']('+url+')',
    citations:[{chunkId:'directory:student-conduct',title,url,claim:title,sourceName:'School Affairs',locator:null,effectiveAt:null,reviewedAt:null}],
    suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}
