// Fixed, record-free wording help for explicitly requested practice topics.
// Never interpolate the prompt, conversation history, or student record data.
const interview=/\b(?:job interview|interview|why should (?:we|they) hire|what makes me qualified (?:to be|for))\b|面試|面试/iu;
const study=/\b(?:study plan|study tips|study advice|how (?:can|should|do|could) i study|help me (?:to )?(?:study|plan my study))\b|(?:讀書|学习|學習)(?:計畫|计划|建議|建议)|(?:如何|怎麼|怎么)(?:讀書|读书|學習|学习)/iu;
const presentation=/\b(?:presentation|self.introduction|introduce myself)\b|自我介紹|自我介绍|簡報|简报/iu;
const technicalRole=/\b(?:software|programming|developer|programmer)\b|軟體|軟件|软件|程式開發|程序开发/iu;
const refersToEarlierWording=/\b(?:above|earlier|previous|rewrite|revise|translate|what (?:we|i|you) (?:just )?(?:said|discussed)|(?:this|that|my) (?:answer|draft|example))\b|前面|剛才|刚才|改寫|改写|翻譯|翻译/iu;
const schoolOrHiringFacts=/\b(?:official|verify|certify|eligibility|requirements?|policy|deadlines?|tell me whether|prove|check (?:my|the)|based on (?:my|the)|(?:campus|school|university) (?:rules?|interview|assessment|records?))\b|校方規則|校方规则|官方|查核|查證|查证|是否符合資格|是否符合资格|申請期限|申请期限/iu;

const content={
  interview:{
    en:[
      'Pick one real example from a class, project, work, or volunteering. Explain the problem, what you personally did, and what changed or what you learned.',
      'Try this aloud with true details: “In [project or task], I [your actual contribution]. My result was [an outcome you can explain].”',
      'What is one project or task you could talk about?',
    ],
    zh:[
      '挑一個你實際做過的例子，例如課堂作業、個人專案、工作或志工任務。說明當時的問題、你親自做了什麼，以及結果或收穫。',
      '用真實內容練習說：「在［專案或任務］中，我［實際做的工作］。成果是［能說明的結果］。」',
      '你可以分享一個實際做過的專案或任務嗎？',
    ],
  },
  technicalInterview:{
    en:[
      'Pick one real software example, such as a class project, personal project, or bug you worked on. Explain the problem, what you personally contributed, and how you checked the result. If it was a team project, focus on your own work.',
      'Try this aloud with true details: “In [project], I [your actual contribution] using [tools you really used]. My result was [something you can show or explain].”',
      'What is one project, assignment, or bug you could talk about?',
    ],
    zh:[
      '挑一個你實際做過的軟體例子，例如課堂作業、個人專案或修過的錯誤。說明問題、你親自做的部分，以及你如何測試結果。團隊合作時，聚焦自己的貢獻。',
      '用真實內容練習說：「在［專案］中，我使用［實際工具］完成［實際工作］。成果是［能展示或說明的結果］。」',
      '你可以分享一個實際做過的專案、作業或修過的錯誤嗎？',
    ],
  },
  presentation:{
    en:[
      'Start with the one point you want the audience to remember. Follow with one real example, then close by repeating the point in a single sentence.',
      'Try this opening: “Today I’ll explain [topic] and show [one example].” Replace both placeholders before practising it aloud.',
      'What is your presentation topic?',
    ],
    zh:[
      '先說出最希望聽眾記住的一點，接著用一個實際例子說明，最後用一句話重申重點。',
      '試著這樣開場：「今天我想介紹［主題］，並用［一個例子］說明。」先填入內容，再開口練習。',
      '你的簡報主題是什麼？',
    ],
  },
  study:{
    en:[
      'Pick one topic and turn it into three questions. Try answering from memory, then reopen your notes and mark what you missed. Use those gaps to choose what to practise next.',
      'Start today with the topic you find hardest. Write down one thing to revisit in your next study session.',
      'Which topic would you like to start with?',
    ],
    zh:[
      '選一個主題並寫出三個問題。先憑記憶作答，再翻開筆記核對，標記不熟悉的部分，作為下次練習的重點。',
      '今天先從最不熟悉的主題開始，寫下一個下次要回顧的重點。',
      '你想從哪一個主題開始？',
    ],
  },
};

export function generalCoachingGuide(question,{interviewOnly=false}={}){
  if(typeof question!=='string'||schoolOrHiringFacts.test(question)||refersToEarlierWording.test(question))return null;
  const topic=(interviewOnly||interview.test(question))?(technicalRole.test(question)?'technicalInterview':'interview')
    :presentation.test(question)?'presentation':study.test(question)?'study':null;
  if(!topic)return null;
  const language=/[\u3400-\u9fff]/u.test(question)?'zh':'en';
  return {status:'answered',answer:content[topic][language].join('\n\n'),citations:[],suggestedQuestions:[],activity:[]};
}
