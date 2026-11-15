import {leavePath,officialLeaveUrl,officialRegistrarUrl,officialWifiUrl,wifiGuidePath} from '../src/features/public/affairs/studentServices.js';

const wirelessService='https://www.ecc.stu.edu.tw/wireless/';
const enrollmentLeave='https://www.aca.stu.edu.tw/%E5%AD%B8%E7%94%9F%E4%BC%91%E5%AD%B8%E3%80%81%E5%BE%A9%E5%AD%B8%E5%8F%8A%E9%80%80%E5%AD%B8/';
const registrationNotice='https://www2.stu.edu.tw/latestnews_single.php?id=223587';
const wifiPassword=/^(?:(?:hi|hey|please)[, ]+)?(?:(?:what(?: is|'s)|where (?:can|do) i (?:find|get)|do you know|tell me)\s+)?(?:(?:the |our )?(?:(?:stu|school|campus)(?:'s)? )?wi[ -]?fi (?:pass(?:word|code)?|network password|key)|(?:the )?password for (?:the )?(?:(?:stu|school|campus) )?wi[ -]?fi)(?: please)?$/iu;
const semesterIntentLead=/^(?:i(?: am|'?m| was)? (?:planning|thinking|considering)(?: to| about| of)?|i want to|i (?:need|have) to|i might|i(?: am|'?m) going to|what (?:can|should) i do if i (?:want to|plan to|need to)|how (?:can|do|should) i) /iu;
const enrollmentChange=/^(?:stop (?:going to|attending) (?:school|university)|(?:take|taking) (?:a|the|this) semester off|(?:drop out|dropping out)(?: of (?:school|university))?|(?:withdraw|withdrawing) from (?:school|(?:the )?university)|apply for (?:a )?(?:semester leave|leave of absence)(?: for (?:a|this) semester)?)$/iu;
const adviceSuffix=/[,.!? ]+(?:is there anything i should do|what (?:can|should) i do|what do i (?:need|have) to do|how do i (?:do (?:it|that)|apply)|can you help(?: me)?|please)$/iu;
function asksAboutEnrollmentChange(text){
  const lead=semesterIntentLead.exec(text);
  return Boolean(lead&&enrollmentChange.test(text.slice(lead[0].length).replace(adviceSuffix,'').trim()));
}
const absenceForm=/^(?:please )?(?:(?:where|how) (?:can|do|should) i (?:file|submit|apply for) (?:(?:a|an|the) )?(?:student )?(?:(?:sick|personal) )?leave(?: for class(?:es)?)?|where (?:is|can i (?:find|open|get)) (?:the |a )?(?:student )?(?:class )?absence form)(?: please)?$/iu;
const wifiChinese=/^(?:請問\s*)?(?:樹德(?:科大|科技大學)?|學校|校園)?\s*(?:wi[ -]?fi|無線網路)\s*(?:的)?\s*(?:密碼|通行碼)(?:是什麼|是多少|在哪(?:裡|裏))?$/iu;
const semesterChinese=/^(?:請問\s*)?(?:(?:我)?(?:想|打算|考慮|需要)(?:要)?(?:休學|退學|暫停上學|休一學期)(?:\s*[,，、]?\s*(?:該怎麼辦|怎麼辦|要做什麼|怎麼申請))?|(?:怎麼|如何)(?:辦理|申請)?(?:休學|退學))$/u;
const absenceChinese=/^(?:請問\s*)?(?:(?:我)?(?:要去哪(?:裡|裏)|在哪(?:裡|裏)|怎麼|如何)(?:申請|辦理|填寫)?(?:學生)?(?:請假|假單)|(?:學生)?(?:請假|假單)(?:要)?在哪(?:裡|裏)(?:申請|填寫)?)$/u;

function selection(question){
  const text=question.normalize('NFKC').trim().replace(/[’‘]/gu,"'").replace(/[?!。！？]+$/u,'').trim();
  if(wifiPassword.test(text)||wifiChinese.test(text))return 'wifi-access';
  if(asksAboutEnrollmentChange(text)||semesterChinese.test(text))return 'enrollment-leave';
  if(absenceForm.test(text)||absenceChinese.test(text))return 'class-absence-form';
  return null;
}

const link=(title,url)=>'['+title+']('+url+')';
const source=(chunkId,title,url)=>({chunkId:'campus-guidance:'+chunkId,title,url,sourceName:'Shu-Te University'});

export function answerStudentSupportGuidance(question){
  const kind=selection(question);
  if(!kind)return null;
  const zh=/\p{Script=Han}/u.test(question),t=(en,cn)=>zh?cn:en;
  let answer,citations,title;
  if(kind==='wifi-access'){
    title=t('Campus Wi-Fi access','校園無線網路連線');
    const guide=t('Wi-Fi setup guide','無線網路設定教學');
    answer=t('For campus Wi-Fi on a personal device, choose **STU-Dot1x** or **STU-Dot1x-5G** and follow the Computing Center’s setup steps. These networks use 802.1X sign-in. The published instructions give the sign-in steps for these networks. **STUWLAN** uses a web sign-in page.',
      '個人手機或電腦在校內可選 **STU-Dot1x** 或 **STU-Dot1x-5G**，並依電算中心教學設定。這兩個網路使用 802.1X 登入，教學提供的是登入流程。**STUWLAN** 則使用網頁登入。')
      +'\n\n'+link(guide,wifiGuidePath);
    citations=[source('wireless-service',t('Computing Center wireless service','電算中心無線網路說明'),wirelessService),source('wireless-setup',guide,officialWifiUrl)];
  }else if(kind==='enrollment-leave'){
    title=t('Taking a semester off or withdrawing','休學與退學');
    const process=t('Semester leave and withdrawal instructions','學生休學、復學及退學');
    const registrar=t('Registration and Curriculum Division','註冊課務組');
    answer=t('If you want to pause your studies and return later, ask the Registrar about **semester leave (休學)**. If you plan to leave the program, ask about **withdrawal (退學)**.',
      '如果你想暫時離校、之後再回來，可向註冊課務組詢問 **休學**。如果打算離開原就讀學程，請詢問 **退學**。')
      +'\n\n'+t('Contact your department or advisor and the Registration and Curriculum Division before you stop attending. Ask about the deadline, paperwork, and any tuition refund for your term. Bring your student ID when you go to the Registrar to start the application.',
      '停止上課前，先聯絡系所或導師及教務處註冊課務組，確認當學期的申請期限、離校手續和退費。到註冊課務組辦理時，請帶學生證。')
      +'\n\n'+link(process,enrollmentLeave)+' · '+link(registrar,officialRegistrarUrl);
    citations=[source('semester-leave',process,enrollmentLeave),source('registrar-process',t('Registrar’s application notice','教務處休退學申辦公告'),registrationNotice)];
  }else{
    title=t('Student Leave form','學生請假填單');
    const submit=t('Open Student Leave form','開啟學生請假填單');
    answer=t('For a class absence, sign in to the university’s Student Leave system and submit your request there. You can also prepare a private draft in School Affairs on stu.best.',
      '如果是因故無法上課，請登入校方學生請假系統送出假單。也可以先在 stu.best 校務系統準備私人草稿。')
      +'\n\n'+link(submit,officialLeaveUrl)+' · '+link(t('Prepare a draft on stu.best','在 stu.best 準備草稿'),leavePath)
      +'\n\n'+t('If you mean taking a semester off, follow the separate ', '若你想暫停就讀一學期，請參考')
      +link(t('semester leave process','休學流程'),enrollmentLeave) + (zh?'。':'.');
    citations=[source('student-leave-form',title,officialLeaveUrl),source('semester-leave',t('Semester leave instructions','學生休學辦法'),enrollmentLeave)];
  }
  return {status:'answered',answer,citations,suggestedQuestions:[],grounding:{source:'directory',webSearched:false},
    activity:[{kind:'student-support-guidance',label:t('Checked campus guidance','已核對校園服務指引'),detail:title,status:'complete'}]};
}
