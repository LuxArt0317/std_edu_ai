import document from './data/ipiac115.json' with {type:'json'};
import {isPublicAdmissionLanguageQuestion} from './publicAdmissionLanguageIntent.js';

/** Retrieve source text, never the evaluation lab's expected answers. */
export function publicProspectusContext(question,route=''){
  if(typeof question!=='string'||question.length>2000||(route!==document.url&&!isPublicAdmissionLanguageQuestion(question)&&!/\bipi[a]?c\b|新南向.{0,12}(?:專班|合作)|產學合作專班/iu.test(question)))return null;
  const stop=new Set(['what','when','where','which','does','with','this','that','from','your','about','including','different','explain','school','university','ipiac']);
  const terms=[...new Set((question.toLowerCase().match(/[a-z]{3,}|[\u3400-\u9fff]{2,}/gu)||[]).filter(term=>!stop.has(term)))];
  const families=[[/scholar|award|獎學|獎助/iu,['scholarship','獎學','學業']], [/tuition|fee|deduct|學費|扣/iu,['tuition','fee','學雜費','費用']], [/language|mandarin|chinese|語言|華語/iu,['language','tocfl','華語','語言']], [/entry|admission|enroll|入學|招生/iu,['admission','入學','招生']], [/regulation|rule|規定|規章/iu,['regulation','obligation','規定','辦法']]];
  for(const [pattern,extra]of families)if(pattern.test(question))terms.push(...extra);
  const ranked=document.pages.map((page,index)=>({...page,index,score:terms.reduce((n,term)=>n+(page.text.toLowerCase().includes(term)?1:0),0)})).sort((a,b)=>b.score-a.score||a.index-b.index);
  const limit=isPublicAdmissionLanguageQuestion(question)||/\b(?:tuition|fees?|deduct(?:ion)?)\b|學費|學雜費|扣抵/iu.test(question)?2:4;
  // Match document section roles before generic terms such as "academic year".
  // Otherwise eligibility/application pages crowd out the scholarship table.
  const programRules=(route===document.url||/\bipi[a]?c\b|產學合作專班|新南向專班/iu.test(question))&&/regulations?|rules?|obligations?|規定|規章|權利|義務/iu.test(question);
  const scholarship=programRules||/scholar|award|獎學|獎助/iu.test(question);
  const language=isPublicAdmissionLanguageQuestion(question);
  const sections=language?document.pages.filter(page=>/Language proficiency requirements|七、應具備之語文能力/u.test(page.text)||/四、獎助學金申請/u.test(page.text.replace(/\s+/gu,''))):scholarship?document.pages.filter(page=>
    /四、獎助學金申請|Scholarship of International Bachelor Program|新南向獎助學金/u.test(page.text.replace(/\s+/gu,'')) ||
    /Scholarship of International Bachelor Program/u.test(page.text)):[];
  const prioritized=[...sections.map(page=>({...page,index:document.pages.indexOf(page)})),...ranked.filter(page=>page.score>0)];
  const pages=prioritized.filter((page,index,all)=>all.findIndex(other=>other.locator===page.locator)===index).slice(0,limit);
  const relevant=pages.length?pages:ranked.slice(0,2);
  const selected=[document.pages[0],...relevant].filter((page,index,all)=>all.findIndex(p=>p.locator===page.locator)===index);
  const excerpts=selected.map(page=>({locator:page.locator,text:page.text.slice(0,4000),truncated:page.text.length>4000}));
  const metadata={pageTitle:document.title,localUrl:document.url,originalSource:document.source,capturedOn:document.capturedOn,
    provenance:document.scope,sourceChecksum:document.checksum,contentAvailable:true,
    coverage:`Selected excerpts from ${selected.length} of ${document.pageCount} physical pages. Unselected or truncated text cannot establish that a condition is absent. The document is a 115-entry draft, not another cohort's rules, a current bill or a private award decision.`,
    selectedPages:excerpts.map(p=>p.locator),excerpt:excerpts.map(p=>`${p.locator}${p.truncated?' (excerpt)':''}\n${p.text}`).join('\n\n'),excerptTruncated:excerpts.some(p=>p.truncated)||selected.length<document.pageCount,
    totalCharacters:document.pages.reduce((n,p)=>n+p.text.length,0),includedCharacters:excerpts.reduce((n,p)=>n+p.text.length,0)};
  return {page:{title:document.title,route:document.url,source:document.source,capturedOn:document.capturedOn},contentAvailable:true,
    evidence:{id:'public-document:ipiac-115:'+document.checksum.slice(0,16),title:document.title,url:document.url,urls:[document.url,document.source],capturedOn:document.capturedOn,content:JSON.stringify(metadata)}};
}
