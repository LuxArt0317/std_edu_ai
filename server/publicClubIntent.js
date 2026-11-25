/** Public directory/recruitment guidance only; personal membership stays scoped. */
export function isPublicClubRecommendationQuestion(question){
 return typeof question==='string'&&question.length<=2000&&/\bclubs?\b|社團/iu.test(question)
  &&/\b(?:recommend|suggest|improve|practi[cs]e|develop|skills?|interests?|beginner)\b|推薦|建議|技能|興趣|練習|培養/iu.test(question)
  &&!/\b(?:joined|membership|my records?|my credits?|my grades?|status|complete[ds]?|enrol[l]?ed)\b|已參加|我的紀錄|我的學分|成績|狀態/iu.test(question);
}
export function isPublicClubQuestion(question){
 if(isPublicClubRecommendationQuestion(question))return true;
 return typeof question==='string'&&question.length<=2000
  &&/\b(?:clubs?|student associations?)\b|社團/iu.test(question)
  &&/\b(?:what|which|exist|available|join|apply|find|contact|where|recommend)\b|有哪些|參加|加入|申請|推薦|聯絡|在哪/iu.test(question)
  &&!/\b(?:my|mine|am i|did i|i (?:have |had )?(?:attended|joined|participated)|their|his|her|another|other student|joined|membership status|credits?|requirements? completed)\b|我的|我已|我(?:目前|現在)?(?:加入|參加|隸屬)|其他學生|他人|學分|已參加/iu.test(question);
}

const clubDirectoryPath='/school-sites/activity.sao.stu.edu.tw/活力社團介紹';
const socialQueryKeys=new Set(['hl','igsh','igshid','utm_source','utm_medium','utm_campaign','utm_content','utm_term']);
const reservedInstagramPaths=new Set(['accounts','explore','reel','reels','p','stories','direct','challenge','oauth','about','developer','legal','api']);
function namedInstagramContact(line){
 const match=/^([^\n]{2,120}?)\s+\((https:\/\/[^\s)]+)\)\s*$/u.exec(line);
 if(!match)return null;
 const label=match[1].trim(),url=match[2];
 if(/[\p{Cc}\p{Cs}<>]/u.test(label)||/^(?:探索社團|了解更多|點此|click here|explore clubs?|learn more)$/iu.test(label)
  ||!/(?:社|團契|學生會|學生議會|學生行政中心|聯合會|委員會|青年會)|\b(?:club|association|society|student council)\b/iu.test(label)
  ||url.length>512||!/^https:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._]{1,30}\/?(?:\?[^#]*)?$/u.test(url))return null;
 try{
  const parsed=new URL(url),name=parsed.pathname.replace(/^\/|\/$/gu,'');
  if(parsed.username||parsed.password||parsed.port||parsed.hash||!/[A-Za-z0-9]/u.test(name)||name.startsWith('.')||name.endsWith('.')||name.includes('..')||reservedInstagramPaths.has(name.toLowerCase())
   ||[...parsed.searchParams].some(([key,value])=>!socialQueryKeys.has(key)||value.length>300||/[\p{Cc}\p{Cs}]/u.test(key+value)))return null;
  return {label,url};
 }catch{return null;}
}

/** Keep named source contacts while removing duplicate navigation and unrelated URLs.
 * The caller supplies a checksum-verified public-page context, not request data.
 */
export function compactClubDirectoryContext(context){
 if(!context?.contentAvailable)return context;
 let data;try{data=JSON.parse(context.evidence.content);}catch{return context;}
 if(!data||typeof data!=='object'||typeof data.excerpt!=='string')return context;
 let sourceContacts=false;
 try{sourceContacts=data.contentStatus==='verified_snapshot'&&data.contentAvailable===true
  &&data.localUrl===context.page.route&&data.originalSource===context.page.source&&context.evidence.url===context.page.route
  &&decodeURI(context.page.route).replace(/\/$/u,'')===clubDirectoryPath;}catch{/* Unknown routes cannot promote outgoing contacts. */}
 const contacts=[],seen=new Set();let contactBytes=2,contactsExcerpted=false;
 const lines=data.excerpt.split('\n').map(line=>{
  const text=line.trim(),contact=sourceContacts?namedInstagramContact(text):null;
  if(contact){
   const identity=contact.label+'\n'+contact.url;
   if(!seen.has(identity)){
    seen.add(identity);const cost=new TextEncoder().encode(JSON.stringify(contact)).length+1;
    if(contacts.length<64&&contactBytes+cost<=8000){contacts.push(contact);contactBytes+=cost;}
    else contactsExcerpted=true;
   }
   // Retaining the literal pair also makes repeat compaction stable. Structured
   // contacts and allowed URLs below remain bounded independently of the excerpt.
   if(contacts.some(row=>row.label===contact.label&&row.url===contact.url))return text;
  }
  return text.replace(/\s*\(https?:\/\/[^\s)]+\)/gu,'').trim();
 }).filter(Boolean);
 const excerpt=[...new Set(lines)].join('\n');
 return {...context,evidence:{...context.evidence,
  urls:[...new Set([...(context.evidence.urls||[]),...contacts.map(row=>row.url)])],
  content:JSON.stringify({...data,excerpt,includedCharacters:excerpt.length,
  ...(sourceContacts?{clubContacts:contacts,clubContactsExcerpted:contactsExcerpted,
   clubContactScope:'Named Instagram links published in this captured club directory. The links identify contact channels, not a verified meeting location, current account content, recruitment availability or successful membership. Distinct club names remain distinct; clarify an ambiguous club request rather than choosing one silently.'}:{}),
  coverage:String(data.coverage||'')+' Repeated identical lines and unrelated parenthesized link URLs were removed; named validated Instagram contacts remain. This excerpt does not establish recruitment availability or successful membership.'})}};
}
