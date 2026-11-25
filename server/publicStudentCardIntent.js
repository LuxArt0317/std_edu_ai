export function isPublicStudentCardReplacementQuestion(question){
 return typeof question==='string'&&question.length<=2000
  &&/\bstudent (?:id(?: card)?|card)\b|學生證/iu.test(question)
  &&/\b(?:replacement|replace|lost|damaged|broken)\b|補發|換發|遺失|損壞/iu.test(question)
  &&!/\b(?:status|tracking|receipt|submitted|approve|issue me|on my behalf)\b|進度|狀態|收據|已申請|代我|核准/iu.test(question);
}
export function focusStudentCardContext(context){
 if(!context?.contentAvailable)return context;
 const metadata=JSON.parse(context.evidence.content);
 if(typeof metadata.excerpt!=='string')return context;
 const lines=metadata.excerpt.split('\n').map(line=>line.replace(/\s*\(https?:\/\/[^\s)]+\)/gu,'').trim()).filter(Boolean);
 return {...context,evidence:{...context.evidence,content:JSON.stringify({...metadata,excerpt:[...new Set(lines)].join('\n'),
  coverage:String(metadata.coverage||'')+' Initial card-issuance batches, temporary library access, replacement procedures and later iPASS activation are separate. An activation fee does not establish a replacement fee. Historical temporary-access dates do not establish current access. Provide only supported contact/procedure facts and identify the specific missing replacement details.'})}};
}
