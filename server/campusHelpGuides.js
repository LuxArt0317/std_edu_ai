import {assistantLanguage} from '../src/services/assistantLanguage.js';

const result=(answer,links)=>({status:'answered',answer,citations:links.map(({title,url})=>({
  chunkId:'campus-help:'+url,claim:title,title,url,sourceName:'stu.best service routes',locator:url,effectiveAt:null,reviewedAt:null,
})),suggestedQuestions:[],grounding:{source:'directory',webSearched:false,checkedAt:new Date().toISOString()},
activity:[{kind:'directory',label:'Checked local service routes',detail:'Read navigation and access guidance; no personal records were queried or changed.',status:'complete'}]});

/** Public help only. This guide never reads or establishes another user's rights. */
export function campusHelpGuide(question){
  if(typeof question!=='string'||question.length>2000)return null;
  const zh=assistantLanguage(question)==='zh-Hant';
  const compound=/[;；]|\b(?:and|also|plus)\s+(?:what|when|how|show|read|check|tell|my|can|do)\b|以及我的|並且|而且/iu.test(question);
  const other=/\b(?:friend|roommate|classmate|(?:another|other) student|someone else)(?:['’]s)?\s+(?:(?:exam|final|semester|academic|private|medical)\s+){0,3}(?:grades?|scores?|transcripts?|rankings?|records?|tuition balance)\b|\b(?:grades?|scores?|transcripts?|rankings?)\s+(?:of|for|from)\s+(?:(?:my|a|the|another|other)\s+){0,2}(?:friend|roommate|classmate|student)\b|(?:朋友|室友|同學|他人|別人)的?(?:考試|學期|私人)?(?:成績|分數|病歷|排名)/iu;
  const privateRecord=/\b(?:grades?|scores?|transcripts?|rankings?|medical records?|tuition balance)\b|成績|分數|病歷|排名/iu;
  const access=/\b(?:can|could|may|look up|lookup|access|see|read|view|get|show|find)\b|查|看|取得|存取/iu;
  if(!compound&&other.test(question)&&privateRecord.test(question)&&access.test(question))return result(zh
    ?'我只能協助查看目前帳戶獲授權存取的紀錄。知道朋友的姓名或學號、或登入 Google，並不會自動取得對方的成績權限。請朋友登入自己的[成績查詢](/school-affairs/services/13-1)後，自行選擇是否與您分享。'
    :'I can help with records your account is authorized to access. Knowing your friend’s name or student number, or signing in with Google, does not by itself grant access to their grades. Your friend can open [Grade Inquiry](/school-affairs/services/13-1) in their own account and choose what to share.',
    [{title:zh?'成績查詢':'Grade Inquiry',url:'/school-affairs/services/13-1'}]);

  const learning=/\b(?:moodle|dtm|digital teaching materials)\b|數位教材|教材網/iu.test(question);
  const navigation=/\b(?:how (?:do|can|should) i (?:open|log in|login|sign in|access|find|check|view)|how to (?:open|log in|sign in|access|find|check|view)|where (?:is|can i (?:open|find|check|view|access))|open|login link)\b|(?:如何|怎麼|哪裡|在哪).{0,15}(?:登入|開啟|查詢|查看)|(?:登入|開啟).{0,12}(?:教材|moodle|dtm)/iu.test(question);
  // Leave multi-domain questions to the evidence planner, not a partial shortcut.
  const anotherTopic=/\b(?:tuition|scholarship|leave|wifi|wi-fi|repair|dorm|graduation|internship)\b|學費|獎學金|請假|宿舍|實習|畢業|報修/iu.test(question);
  if(!learning||!navigation||anotherTopic||compound)return null;
  const grades=/\bgrades?|scores?\b|成績|分數/iu.test(question);
  if(grades){
    const academic=/\b(?:school affairs|academic|including)\b|校務|教務|包含/iu.test(question);
    const links=[{title:zh?'DTM 成績':'DTM grades',url:'/dtm/grades'},...(academic?[{title:zh?'校務成績查詢':'Academic Services Grade Inquiry',url:'/school-affairs/services/13-1'}]:[])];
    const learningHelp=zh
      ?'DTM 是此網站的 Moodle 數位教材網。登入後可開啟 DTM 成績綜覽，或進入課程並選擇「成績（Grades）」查看該課程的成績報告。'
      :'DTM is this website’s Moodle Digital Teaching Materials platform. After signing in, use the DTM grade overview or open your course and choose **Grades** for its coursework grade report.';
    const academicHelp=academic?(zh
      ?'校務成績可從「教務系統 → 查詢程式 → 學生選課 → 成績查詢」進入，再選擇當學期或歷年成績，核對學年度與學期。'
      :'For semester records, go through **School Affairs → Academic Affairs → Query Programs → Student Course Selection → Grade Inquiry**, then choose current-term or historical grades and check the academic year and semester in the report.') : '';
    return result((zh?'開啟 ':'Open ')+links.map(link=>'['+link.title+']('+link.url+')').join(zh?'，以及 ':' and ')+'. '+learningHelp+' '+academicHelp+' '+(zh?'DTM 課程活動成績與校務學期成績分開維護；這些導覽說明並非查得您的個人成績。':'DTM coursework marks and School Affairs semester grades are separate records; this navigation guidance does not establish your personal marks.'),links);
  }
  return result(zh
    ?'開啟[數位教材網](/dtm)，或前往[DTM 登入](/dtm/login)並選擇「Continue with Google」。DTM 與校務資訊系統共用 stu.best 的 Google 登入；若目前工作階段仍有效，無須再登入。'
    :'Open [Digital Teaching Materials](/dtm), or use [DTM sign-in](/dtm/login) and choose **Continue with Google**. DTM and School Affairs share the stu.best Google session, so an active session can carry across both.',
    [{title:'Digital Teaching Materials',url:'/dtm'},{title:'DTM sign-in',url:'/dtm/login'}]);
}
