const sourceId=/^public-document:ipiac-115:[a-f0-9]{16}$/u;
/** Coverage instructions derive from source sections present, never an expected answer. */
export function publicProspectusResponseNeeds(question,evidence){
 if(typeof question!=='string'||question.length>2000||!/scholar|獎學|獎助/iu.test(question)||!/appl(?:y|ying|ication)|eligib|requirements?|qualif|申請|資格|條件/iu.test(question)||!Array.isArray(evidence))return [];
 const notes=[];
 for(const item of evidence.slice(0,12)){
  if(!sourceId.test(item?.id||'')||typeof item.content!=='string'||item.content.length>100000)continue;
  let data;try{data=JSON.parse(item.content);}catch{continue;}
  if(!data||typeof data.excerpt!=='string'||!data.sectionRoles||typeof data.sectionRoles!=='object')continue;
  const text=data.excerpt,roles=data.sectionRoles;
  const has=(locator,pattern)=>typeof roles[locator]==='string'&&text.includes(locator)&&pattern.test(text);
  const form=has('pdf:page:27',/Scholarship Application Form for Foreign Student/u);
  const policy=has('pdf:page:12',/四、獎助學金申請/u);
  const tiers=has('pdf:page:29',/ranking within the top[\s\S]*pass all subjects/u);
  const obligations=has('pdf:page:31',/Notice of Rights and Obligations/u);
  const cite=' Source: '+item.id+'.';
  if(form&&policy)notes.push('Explain scholarship application as a process: distinguish applicant scope, form completion/signature and status-specific supporting documents from review and award. State the supported initial submission route and separate continuing-student application timing; submission alone establishes no award.'+cite);
  if(tiers)notes.push('For application eligibility/requirements, include the available academic award thresholds, ranking conditions and corresponding tier amounts when explaining later awards. Keep tiers alternative, not cumulative, and distinguish academic award conditions from admission documents.'+cite);
  if(policy&&/internship provider or employer/u.test(text))notes.push('Preserve every supported alternative in the residence exception, including the arrangement and approval conditions; do not narrow an either/or exception to a single provider category. Keep semester-specific conditions and source cohort scope attached to the relevant rule.'+cite);
  if(form&&/awarded the scholarship should perform the obligated services/u.test(text))notes.push('The application form includes a recipient service obligation. Mention that obligation at the source’s stated scope; do not invent hours or conflate status-specific supporting documents with an obligation applying to every recipient.'+cite);
  if(obligations)notes.push('Use the supplied program obligations to clarify continuing conditions, keeping general program obligations distinct from semester-specific scholarship conditions. Preserve source-draft/mixed-year limitations without replacing the supported process explanation with a disclaimer.'+cite);
 }
 return [...new Set(notes)].slice(0,5).map(note=>note.slice(0,650));
}
