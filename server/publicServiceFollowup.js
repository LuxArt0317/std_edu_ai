// Resolve a text-only contact follow-up without forwarding any prior text.
// Both the public service and the requested field come from closed vocabulary.
const services = [
  { match: /^(?:library|圖書館)$/u, en: 'Shu-Te University library', zh: '樹德科技大學圖書館' },
  { match: /^(?:registrar(?:'s office)?|registration (?:office|and curriculum division)|註冊(?:課務)?組)$/u,
    en: 'Shu-Te University registrar', zh: '樹德科技大學註冊課務組' },
  { match: /^(?:admissions? office|招生(?:處|組|中心|辦公室))$/u,
    en: 'Shu-Te University admissions office', zh: '樹德科技大學招生辦公室' },
  { match: /^(?:comput(?:er|ing) cent(?:er|re)|電算中心)$/u,
    en: 'Shu-Te University Computing Center', zh: '樹德科技大學電算中心' },
  { match: /^(?:office of academic affairs|academic affairs office|教務處)$/u,
    en: 'Shu-Te University Academic Affairs Office', zh: '樹德科技大學教務處' },
  { match: /^(?:office of student affairs|student affairs office|學務處)$/u,
    en: 'Shu-Te University Student Affairs Office', zh: '樹德科技大學學務處' },
];
const fields = [
  { en: /^(?:opening|office|service|business) hours$/u, zh: /^(?:開放|辦公|服務)時間$/u,
    enQuestion: service => `What are the opening hours for the ${service.en}?`, zhQuestion: service => `${service.zh}的開放時間是什麼？` },
  { en: /^(?:(?:contact|telephone|phone) number|telephone|phone)$/u, zh: /^(?:聯絡)?(?:電話|電話號碼)$/u,
    enQuestion: service => `What is the phone number for the ${service.en}?`, zhQuestion: service => `${service.zh}的聯絡電話是多少？` },
  { en: /^(?:e-?mail(?: address)?)$/u, zh: /^(?:電子郵件(?:地址)?|信箱)$/u,
    enQuestion: service => `What is the email address for the ${service.en}?`, zhQuestion: service => `${service.zh}的電子郵件地址是什麼？` },
  { en: /^(?:address|location)$/u, zh: /^(?:地址|地點|位置)$/u,
    enQuestion: service => `What is the address for the ${service.en}?`, zhQuestion: service => `${service.zh}在哪裡？` },
  { en: /^(?:official )?(?:website|link|url)$/u, zh: /^(?:官網|官方網站|網站連結|連結)$/u,
    enQuestion: service => `What is the official website for the ${service.en}?`, zhQuestion: service => `${service.zh}的官方網站是什麼？` },
];

function normalizeQuestion(value) {
  if (typeof value !== 'string' || value.length > 160 || /[\r\n]/u.test(value)) return '';
  return value.normalize('NFKC').trim().toLowerCase().replace(/’/gu, "'").replace(/[ \t]+/gu, ' ')
    .replace(/[?。！!]+$/u, '').trim();
}

function publicService(value) {
  const prior = normalizeQuestion(value);
  const name = /^(?:where (?:is|can i (?:find|access)|do i find)|how (?:can i|do i|to) (?:contact|find|reach)|(?:show|give|send) me (?:the |a )?(?:link|url) (?:to|for)) (.+)$/u.exec(prior)?.[1]
    ?? /^(?:what (?:is|are) (?:the )?)(.+?)(?:'s)? (?:opening hours|office hours|phone number|email address|official website|website|visitor policy|discussion room rules)$/u.exec(prior)?.[1]
    ?? /^(?:請問)?(?:哪裡(?:可以)?找到|如何(?:聯絡|找到|前往))(.+)$/u.exec(prior)?.[1]
    ?? /^(?:請問)?(.+?)(?:在哪(?:裡|裏)?|怎麼(?:走|聯絡)|的?(?:連結|官網|電話|地址|電子郵件|信箱|服務時間)(?:是什麼|是多少)?)$/u.exec(prior)?.[1];
  const label = name?.replace(/^(?:the )?(?:(?:shu[- ]te university|stu(?:'s)?|campus) )?/u, '')
    .replace(/^(?:樹德科技大學|樹德科大|樹德|學校|校園)的?/u, '');
  return label ? services.find(service => service.match.test(label)) : null;
}

export function publicServiceFollowup(question, history) {
  const current = normalizeQuestion(question);
  const chinese = /\p{Script=Han}/u.test(current);
  const match = chinese
    ? /^(?:那(?:麼)?|還有)?(?:請問)?(?:它的|他們的|該單位的)?(.+?)(?:呢|是什麼|是多少)?$/u.exec(current)
    : /^(?:(?:and|also|what about|how about) )?(?:what (?:is|are) )?(?:the |its |their )?(.+)$/u.exec(current);
  const field = match && fields.find(item => (chinese ? item.zh : item.en).test(match[1]));
  if (!field) return null;
  const lastUser = Array.isArray(history) ? history.slice(-6).findLast(item => item?.role === 'user') : null;
  const service = publicService(lastUser?.content);
  if (!service) return null;
  return chinese ? field.zhQuestion(service) : field.enQuestion(service);
}
