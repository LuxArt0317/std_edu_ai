import {publicProspectusFinancialProjection} from './publicProspectusFinancialProjection.js';
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
  const scholarshipApplication=!language&&/scholar|獎學|獎助/iu.test(question)&&/appl(?:y|ying|ication)|eligib|requirements?|qualif|申請|資格|條件/iu.test(question);
  // Read the actual application form, policy and award table as distinct roles.
  // Admission-document checklists on the same physical page are not scholarship requirements.
  const applicationSections=scholarshipApplication?['pdf:page:27','pdf:page:12','pdf:page:29','pdf:page:31'].map(locator=>document.pages.find(page=>page.locator===locator)).filter(Boolean):[];
  const sections=language?document.pages.filter(page=>/Language proficiency requirements|七、應具備之語文能力/u.test(page.text)||/四、獎助學金申請/u.test(page.text.replace(/\s+/gu,''))):scholarship?document.pages.filter(page=>
    /四、獎助學金申請|Scholarship of International Bachelor Program|新南向獎助學金/u.test(page.text.replace(/\s+/gu,'')) ||
    /Scholarship of International Bachelor Program/u.test(page.text)):[];
  const calculation=/\b(?:calculat\w*|deduct\w*|remaining|after reduction)\b|計算|计算|扣抵|扣除/iu.test(question)&&/scholar|tuition|學費|学费|獎/iu.test(question);
  const financialNotes=calculation?document.pages.filter(page=>/disbursed in the following semester/u.test(page.text)&&/Rights and Obligations|學生權利|學生權利與義務|Students are required to live/u.test(page.text)):[];
  const prioritized=[...applicationSections.map(page=>({...page,index:document.pages.indexOf(page)})),...sections.map(page=>({...page,index:document.pages.indexOf(page)})),...ranked.filter(page=>page.score>0)];
  const pages=prioritized.filter((page,index,all)=>all.findIndex(other=>other.locator===page.locator)===index).slice(0,limit);
  const relevant=pages.length?pages:ranked.slice(0,2);
  const languageObligations=language?document.pages.filter(page=>/Notice of Rights and Obligations/u.test(page.text)&&/before graduation/u.test(page.text)&&/Failure to obtain A2 before the third semester/u.test(page.text)):[];
  const selected=[document.pages[0],...relevant,...financialNotes,...languageObligations].filter((page,index,all)=>all.findIndex(p=>p.locator===page.locator)===index);
  const excerpts=selected.map(page=>{
    const policyStart=scholarshipApplication&&page.locator==='pdf:page:12'?page.text.indexOf('四、獎助學金申請'):-1;
    const languageStart=language&&languageObligations.includes(page)?page.text.indexOf('6. 依照教育部規定'):-1;
    const languageEnd=languageStart>=0?page.text.indexOf('8. 校外實習課程',languageStart):-1;
    if(languageStart>=0&&languageEnd<0)throw Error('Language obligation source boundary missing');
    const text=languageStart>=0?page.text.slice(languageStart,languageEnd).trim():policyStart>=0?page.text.slice(policyStart):page.text;
    return {locator:page.locator,text:text.slice(0,4000),truncated:text.length>4000};
  });
  const languageObligationClauses=language?excerpts.filter(page=>languageObligations.some(source=>source.locator===page.locator)).flatMap(page=>{
    const starts=[...page.text.matchAll(/(?:^|\s)([67])\.\s/gu)];
    return starts.map((match,index)=>({locator:page.locator,paragraph:match[1],
      text:page.text.slice(match.index,starts[index+1]?.index??page.text.length).trim()}));
  }):[];
  const metadata={pageTitle:document.title,localUrl:document.url,originalSource:document.source,capturedOn:document.capturedOn,
    provenance:document.scope,sourceChecksum:document.checksum,contentAvailable:true,
    coverage:`Selected excerpts from ${selected.length} of ${document.pageCount} physical pages. Unselected or truncated text cannot establish that a condition is absent. The document is a 115-entry draft, not another cohort's rules, a current bill or a private award decision.`,
    ...(scholarshipApplication?{sectionRoles:{'pdf:page:27':'Annex IV application form, signature and application notes','pdf:page:12':'Scholarship application policy, not general admission checklist','pdf:page:29':'Award tiers and associated conditions','pdf:page:31':'Program rights and obligations'},applicationScope:'Separate initial application documents from later-semester award conditions; form submission is not an award decision.'}:{}),
    ...(language?{languageObligationClauses,languageSectionRoles:{'pdf:page:10':'Admission language proficiency for the specified teaching-language track','pdf:page:31':'Literal numbered obligations for language before graduation and scholarship timing; preserve their stated program and academic-year scope'},languageScope:'Compare the positive admission language-proof requirements with later language obligations. Selected excerpts cannot establish the absence of an enrollment prerequisite across the full document or other cohorts.'}:{}),
    ...(calculation?{financialArithmetic:publicProspectusFinancialProjection()}:{}),
    selectedPages:excerpts.map(p=>p.locator),excerpt:excerpts.map(p=>`${p.locator}${p.truncated?' (excerpt)':''}\n${p.text}`).join('\n\n'),excerptTruncated:excerpts.some(p=>p.truncated)||selected.length<document.pageCount,
    totalCharacters:document.pages.reduce((n,p)=>n+p.text.length,0),includedCharacters:excerpts.reduce((n,p)=>n+p.text.length,0)};
  const services=calculation?[{title:'Scholarship applications and review',url:'/school-affairs/services/9-1',requiresSignIn:true,scope:'Caller-owned scholarship application, award amount and review status; a published prospectus is not a saved award decision.'},{title:'Pending tuition and fee charges',url:'/school-affairs/services/39-1',requiresSignIn:true,scope:'Caller-owned amountDue and amountPaid records. Their difference is the saved pending amount; a hypothetical tuition reduction is not a confirmed posted credit or payment.'}]:scholarshipApplication?[{title:'Scholarship applications and review',url:'/school-affairs/services/9-1',requiresSignIn:true,scope:'Caller-owned scholarship application, award amount and review status; navigation only, not a saved award decision.'}]:[];
  return {...(services.length?{additionalEvidence:[{id:'published-guidance',title:'Implemented fee and scholarship record navigation',url:services[0].url,urls:services.map(row=>row.url),content:JSON.stringify({services,scope:'Navigation and implemented data fields only; no caller records were read and no award, posted payment or deduction is established.'})}]}:{}),page:{title:document.title,route:document.url,source:document.source,capturedOn:document.capturedOn},contentAvailable:true,
    evidence:{id:'public-document:ipiac-115:'+document.checksum.slice(0,16),title:document.title,url:document.url,urls:[document.url,document.source],capturedOn:document.capturedOn,content:JSON.stringify(metadata)}};
}
