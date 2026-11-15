const faq=Object.freeze({id:'library:faq',url:'https://www.lib.stu.edu.tw/service/faq/',
  titleEn:'STU Library FAQ',titleZh:'樹德科技大學圖書館常問問題',kind:'library-service'});
const rooms=Object.freeze({id:'library:room-reservation',url:'https://www.lib.stu.edu.tw/service/roomequipmentreserve/',
  titleEn:'STU Library space and equipment reservations',titleZh:'圖書館空間及設備預約與借用',kind:'library-service'});

const library=/\blibrar(?:y|ies)\b|圖書館|图书馆/iu;
const entry=/\b(?:enter|entry|visitors?|university id|guest access)\b|入館|入馆|校外人士|換證|换证|訪客|访客/iu;
const reservation=/\b(?:discussion|study|group) rooms?\b|討論室|讨论室|研討室|研讨室|研究小間/iu;
const databases=/\b(?:databases?|electronic resources?|e-resources?|off[- ]campus)\b|資料庫|数据库|電子資源|电子资源|校外連線|校外连线/iu;

/** Known navigation only. The wording of these pages must be read to support facts. */
export function findOfficialLibraryServiceLeads(question){
  if(!library.test(question))return [];
  if(reservation.test(question))return entry.test(question)||databases.test(question)?[faq,rooms]:[rooms,faq];
  return entry.test(question)||databases.test(question)?[faq]:[];
}

export function isOfficialLibraryLead(value){
  return typeof value==='string'&&[faq,rooms].some(lead=>lead.url===value||lead.url===value+'/');
}

const han=text=>(text.match(/\p{Script=Han}/gu)||[]).length;
const latin=text=>(text.match(/\p{Script=Latin}/gu)||[]).length;
export function libraryAnswerLanguage(question){
  if(/\b(?:answer|reply|respond|write|explain)\s+in English\b|用英文(?:回答|回覆|說明)/iu.test(question))return 'en';
  if(/\b(?:answer|reply|respond|write|explain)\s+in (?:Traditional )?Chinese\b|用繁體中文(?:回答|回覆|說明)/iu.test(question))return 'zh-Hant';
  const chinese=han(question);
  return chinese>0&&chinese*3>=latin(question)?'zh-Hant':'en';
}

export function libraryAnswerMatchesLanguage(answer,language){
  const prose=String(answer??'').replace(/\[[^\]\n]+\]\([^\s)]+\)|https?:\/\/[^\s<>]+|[「『][^」』]*[」』]/gu,'');
  const chinese=han(prose),english=latin(prose);
  return language==='en'?english>chinese*2:chinese>0&&chinese*3>=english;
}
