import source from './data/academicStudyOptions.json' with {type:'json'};

/** Literal formal-process clauses from actual regulations linked by the existing directory. */
export function publicAcademicStudyOptionEvidence(){
 return source.documents.map(document=>{
  const section=article=>{
   const rows=document.sections.filter(row=>row.article===article);
   if(rows.length!==1)throw Error('Study-option article is missing or ambiguous');
   return rows[0];
  };
  const quote=(article,selector)=>{
   const row=section(article),text=selector(row.text);
   if(typeof text!=='string'||text.length<20||!row.text.includes(text))throw Error('Study-option quote does not match the source');
   return {article,pageNumbers:row.pageNumbers,quote:text};
  };
  let clauses;
  if(document.role==='semester_suspension'){
   clauses=[quote('5',text=>{
    const start=text.indexOf('學生休學，'),last=text.indexOf('經核准始生效',start);
    if(start<0||last<0)throw Error('Semester suspension procedure clause changed');
    return text.slice(start,last+'經核准始生效'.length);
   })];
  }else if(document.role==='credit_transfer'){
   clauses=[quote('9',text=>text),quote('4',text=>{
    const start=text.indexOf('學生抵修學分後，'),end=text.indexOf('。',start);
    if(start<0||end<0)throw Error('Credit-transfer study-period clause changed');
    return text.slice(start,end+1);
   })];
  }else throw Error('Unknown study-option source role');
  const excerpt='The clauses field contains selected literal published process instructions and their page references.';
  const metadata={pageTitle:document.title,localUrl:document.url,originalSource:document.source,capturedOn:document.capturedOn,sourceChecksum:document.checksum,pageCount:document.pageCount,
   contentAvailable:true,contentStatus:'verified_document',role:document.role,resourceType:'published_procedure_pdf',clauses,
   excerpt,excerptTruncated:true,totalCharacters:document.pages.reduce((total,page)=>total+page.text.length,0),includedCharacters:excerpt.length,
   coverage:'Selected clauses from the named published edition, not a complete statement of conditions, exceptions, application windows or personal eligibility. A published procedure PDF is not a native semester-status application or evidence of submission, approval, credit transfer or permission to stop attending. Credit transfer does not establish a waiver of the remaining study requirements.',
  };
  return {id:'public-document:study-option:'+document.role,title:document.title,url:document.url,urls:[document.url,source.directory.url],capturedOn:document.capturedOn,content:JSON.stringify(metadata)};
 });
}
