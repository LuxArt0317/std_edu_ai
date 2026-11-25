import {assistantLanguage} from '../src/services/assistantLanguage.js';
import {dtmSubmissionMaxBytes} from './dtmSubmissions.js';

/** Public procedure only; no assignment selection, private status or write. */
export function isPublicDtmSubmissionProcedureQuestion(question){
 if(typeof question!=='string'||question.length>2000)return false;
 const text=question.normalize('NFKC').trim();
 const how=/\b(?:how (?:do|can|should|would) i|where (?:do|can|should) i|show me how to|tell me how to)\b|如何|怎麼|怎么|哪裡|哪里/iu;
 const send=/\b(?:submit|upload|turn in|hand in)\b|繳交|缴交|提交|上傳|上传/iu;
 const work=/\b(?:midterm|answers?|assignments?|homework|exam|dtm|moodle)\b|期中|答案|作業|作业|考試|考试|教材/iu;
 const privateOrAction=/\b(?:for me|on my behalf|my (?:grade|score|submission status)|tuition|scholarships?|leave|housing|counseling|work permit|parking|survey|questionnaire|application|already submitted|did i|have i|was (?:it|my)|when did|late|deadline|due date|withdraw|cancel|delete|another student|someone else)\b|學費|学费|獎學金|奖学金|請假|请假|住宿|諮商|咨商|問卷|问卷|申請|申请|幫我提交|帮我提交|代我|我的成績|我的成绩|已繳交|已缴交|是否繳交|是否缴交|何時繳交|何时缴交|截止|遲交|迟交|刪除|删除|取消|別人|别人|其他學生|其他学生/iu;
 return how.test(text)&&send.test(text)&&work.test(text)&&!privateOrAction.test(text);
}

/** Facts mirror the mounted DtmSubmissionWorkspace/editor and server upload limit. */
export function publicDtmSubmissionGuide(question){
 if(!isPublicDtmSubmissionProcedureQuestion(question))return null;
 const zh=assistantLanguage(question)==='zh-Hant',maxMiB=dtmSubmissionMaxBytes/(1024*1024);
 const links=[
  {url:'/dtm/assignments',title:zh?'DTM 作業':'DTM assignments'},
  {url:'/dtm/login',title:zh?'登入 DTM':'Sign in to DTM'},
 ];
 const answer=zh
  ?`要先看老師指定的是哪一種繳交活動。若是本站的檔案作業，請開啟[DTM 作業](${links[0].url})，需要時先[登入](${links[1].url})，再進入正確課程與作業。確認作業內容及截止時間，開啟繳交／修改作業，新增或取代檔案，再按「儲存更改」。目前本站檔案作業限一個檔案，最大 ${maxMiB} MiB。儲存後回到該作業的「繳交狀態」查看結果；只選擇檔案不代表已儲存。這是操作說明，我尚未查詢或替你繳交任何作業。你說的是哪一門課、哪一個期中活動？`
  :`The right method depends on the activity your teacher assigned. For a file assignment here, open [DTM assignments](${links[0].url}), [sign in](${links[1].url}) if prompted, and open the correct course and assignment. Read its instructions and due date, open the submission editor, add or replace the file, then choose **Save changes (儲存更改)**. This site's file-assignment editor accepts one file up to ${maxMiB} MiB. Return to that assignment's **Submission status (繳交狀態)** to check the saved result; selecting a file alone does not save it. These are instructions, not a check of your work or a submission on your behalf. Which course and midterm activity do you mean?`;
 return {status:'answered',answer,citations:links.map((link,index)=>({chunkId:'dtm-submission-procedure-'+index,...link,claim:'Existing DTM assignment navigation and file-submission workflow.',sourceName:'Implemented DTM file-submission workspace',locator:null,effectiveAt:null,reviewedAt:null})),suggestedQuestions:[],grounding:{source:'directory',webSearched:false},activity:[{kind:'dtm-submission-procedure',label:zh?'找到作業繳交操作說明':'Located the file-assignment workflow',detail:zh?'使用本站作業、編輯器及儲存流程；未查詢私人紀錄或執行繳交。':'Used the mounted assignment/editor/save workflow; no private record was read and no submission was performed.',status:'complete'}]};
}
