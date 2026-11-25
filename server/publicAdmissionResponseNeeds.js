import {isPublicAdmissionLanguageQuestion} from './publicAdmissionLanguageIntent.js';
import {isPublicEnrollmentDateQuestion} from './publicEnrollmentEvidence.js';

/** Source-conditioned coverage, never an expected answer or replacement source. */
export function publicAdmissionResponseNeeds(question,evidence){
 if(typeof question!=='string'||question.length>2000||!Array.isArray(evidence))return [];
 const language=isPublicAdmissionLanguageQuestion(question),dates=isPublicEnrollmentDateQuestion(question);
 if(!language&&!dates)return [];
 const notes=[];
 for(const item of evidence.slice(0,12)){
  if(typeof item?.content!=='string'||item.content.length>100000)continue;
  const prospectus=/^public-document:ipiac-115:[a-f0-9]{16}$/u.test(item.id||'');
  const milestones=/^public-document:admission-milestones:[a-f0-9]{16}$/u.test(item.id||'');
  if(!prospectus&&!milestones)continue;
  let data;try{data=JSON.parse(item.content);}catch{continue;}
  if(!data||typeof data!=='object'||Array.isArray(data))continue;
  const cite=' Source: '+item.id+'.';
  if(language&&prospectus&&typeof data.excerpt==='string'){
   const text=data.excerpt;
   if(/Language proficiency requirements|應具備之語文能力/u.test(text)&&/Programs offered in English/u.test(text)&&/CEFR/u.test(text))
    notes.push('Explain how admission language requirements depend on the admission track and teaching language. Include the source-present English-taught admission proficiency requirement, its stated exemptions and alternative supporting evidence; compare these positive listed admission requirements with later language obligations; never infer a global absence of Mandarin enrollment prerequisites from selected excerpts.'+cite);
   if(/TOCFL|華語能力|華語文能力/u.test(text)&&/graduation|畢業|scholarship|獎助學金/u.test(text))
    notes.push('Keep admission requirements separate from source-present language expectations during study, graduation conditions and scholarship conditions. Explain the source’s positive obligations rather than claiming the document contains no admission prerequisite. Preserve each rule’s audience and timing; a later condition does not establish an enrollment prerequisite.'+cite);
   if(/newly approved|新核定/u.test(text)&&Array.isArray(data.languageObligationClauses)&&data.languageObligationClauses.some(clause=>
    typeof clause?.text==='string'&&/newly approved|新核定/u.test(clause.text)))
    notes.push('The numbered language-obligation clauses contain a program-approval-year qualification. Preserve that qualification with its rule when summarizing the earlier general teaching-language guidance. An entry cohort is not evidence of when a program was approved. Use the literal languageObligationClauses; do not invent or broaden their applicability.'+cite);
   if(typeof data.coverage==='string'&&/draft|cohort/u.test(data.coverage))
    notes.push('Attach the source draft’s program and entry-cohort scope to language rules. The supplied cohort does not settle requirements for earlier cohorts or other tracks; explain the supported rules before asking which track or entry year applies.'+cite);
  }
  if(dates&&milestones&&data.contentStatus==='verified_admission_milestone_rows'&&data.sourceCohort&&data.questionScope&&Array.isArray(data.milestones)){
   const scope=data.questionScope,rows=data.milestones;
   if(Array.isArray(scope.missingSelectors)&&scope.missingSelectors.length)
    notes.push('Ask for the unresolved admission track/program or entry year/intake listed in questionScope.missingSelectors. Do not silently resolve an unspecified request to this source cohort. If giving source dates, frame them conditionally as a historical example for the supplied cohort.'+cite);
   const has=role=>rows.some(row=>row&&row.role===role&&typeof row.locator==='string'&&typeof row.text==='string'&&typeof row.date==='string');
   if(has('application-opening'))
    notes.push('When describing the source cohort’s application opening, preserve the event role and source cohort. Include its paired document-submission deadline when supplied, rather than presenting a partial application timeline. Do not invent a missing opening or extend this cohort’s window to another intake.'+cite);
   if(has('classes-start')||has('check-in-registration-deadline'))
    notes.push('Keep application opening, document submission, classes starting and check-in/registration deadlines distinct. A class-start date or registration deadline is not an application or registration opening. Preserve each supplied temporalStatus; past events are not current open windows.'+cite);
  }
 }
 return [...new Set(notes)].slice(0,6).map(note=>note.slice(0,650));
}
