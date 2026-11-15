const faq=Object.freeze({id:'library:faq',url:'https://www.lib.stu.edu.tw/service/faq/',
  titleEn:'STU Library FAQ',titleZh:'樹德科技大學圖書館常問問題',kind:'library-service'});
const rooms=Object.freeze({id:'library:room-reservation',url:'https://www.lib.stu.edu.tw/service/roomequipmentreserve/',
  titleEn:'STU Library space and equipment reservations',titleZh:'圖書館空間及設備預約與借用',kind:'library-service'});
const hours=Object.freeze({id:'library:opening-hours',url:'https://lis.stu.edu.tw/115-08-26-9/',
  titleEn:'STU Library opening hours',titleZh:'樹德科技大學圖書館開館時間',kind:'library-service'});

const library=/\blibrar(?:y|ies)\b|圖書館|图书馆/iu;
const entry=/\b(?:enter|entry|visitors?|university id|guest access)\b|入館|入馆|校外人士|換證|换证|訪客|访客/iu;
const reservation=/\b(?:discussion|study|group) rooms?\b|討論室|讨论室|研討室|研讨室|研究小間/iu;
const databases=/\b(?:databases?|electronic resources?|e-resources?|off[- ]campus)\b|資料庫|数据库|電子資源|电子资源|校外連線|校外连线/iu;
const openingHours=/\b(?:(?:opening|office|business|service|weekday|weekend|holiday)[ -]hours|hours of operation|librar(?:y|ies)(?:['’]s)? hours|library (?:opens?|closes?|closed) (?:today|tomorrow|this weekend|on|at|during)|library (?:open|close)(?=[?.!]|$))\b|開館時間|開放時間|服務時間|閉館|(?:今天|明天|週末|星期[六日天]|假日).{0,12}(?:開館|開放|關門|有開)|幾點(?:開館|關門)/iu;

/** Known navigation only. The wording of these pages must be read to support facts. */
export function findOfficialLibraryServiceLeads(question){
  if(!library.test(question))return [];
  const contact=entry.test(question)||databases.test(question);
  const services=reservation.test(question)?(contact?[faq,rooms]:[rooms,faq]):(contact?[faq]:[]);
  return openingHours.test(question)?[hours,...services]:services;
}

function matchesLead(value,lead){
  return typeof value==='string'&&(lead.url===value||lead.url===value+'/');
}

export function isOfficialLibraryLead(value){
  return [faq,rooms,hours].some(lead=>matchesLead(value,lead));
}

export function isOfficialLibraryHoursLead(value){
  return matchesLead(value,hours);
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
