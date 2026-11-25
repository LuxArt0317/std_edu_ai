import source from './data/calendarText.json' with {type:'json'};

/** Public institution-wide dates do not establish a student's own class or graduation status. */
export function isPublicCalendarDateQuestion(question){
 return typeof question==='string'&&question.length<=2000
  &&/\b(?:graduation|commencement|semester|holidays?|midterms?|final[ -]exams?|exam periods?|events?|academic calendar)\b|畢業典禮|學期|假日|期中考|期末考|行事曆|校園活動/iu.test(question)
  &&/\b(?:when|dates?|periods?|this year|held|scheduled|begin|start|end|what events)\b|何時|什麼時候|日期|期間|今年|有哪些活動/iu.test(question)
  &&!/\b(?:my|mine|our|i|me|their|his|her|another|other student|attended|attendance|participation|today|tomorrow|latest|updated|cancelled|canceled|changes|eligible|assignment|submission)\b|我的|我們|其他學生|出席|參加紀錄|今天|明天|我能|我可以|資格|作業|繳交/iu.test(question);
}
export function publicCalendarContext(question){
 if(!isPublicCalendarDateQuestion(question))return null;
 const requested=question.match(/\b(1\d{2})\b/u)?.[1];
 const span=question.match(/\b(20\d{2})\s*[-–/]\s*(20\d{2})\b/u);
 const documents=source.documents.filter(row=>(!requested||row.academicYear===Number(requested))&&(!span||row.academicYear+1911===Number(span[1])&&row.academicYear+1912===Number(span[2])));
 const document=documents.sort((a,b)=>b.academicYear-a.academicYear)[0];if(!document)return null;
 const ceremony=/\b(?:graduation|commencement)\b|畢業典禮/iu.test(question)&&!/\b(?:semester|holidays?|exam)\b|學期|假日|考試/iu.test(question);
 const campusEvents=/\bevents?\b|校園活動|有哪些活動/iu.test(question);
 const events=document.events.filter(row=>ceremony?/Commencement|Graduation Ceremony/iu.test(row.event)
  :campusEvents?/Anniversary|Library Week|Ceremony|blood donation|orientation/iu.test(row.event)
  :/Start of .*Semester|End of .*Semester|First day of classes|Midterm exams|Final exams|break begins|holiday/iu.test(row.event));
 if(!events.length)return null;
 const excerpt='The structured events and notes fields contain the selected published calendar text and page locators.';
 const pages=[...new Set(events.map(row=>row.locator.split(':event:')[0]))];
 const metadata={pageTitle:document.title,localUrl:document.url,originalSource:document.source,capturedOn:document.capturedOn,sourceChecksum:document.checksum,
  contentAvailable:true,coverage:`Published ${document.academicYear} academic-year English calendar (${document.academicYear+1911}–${document.academicYear+1912}). Selected ${events.length} of ${document.events.length} source event lines across ${pages.length} pages, plus published notes. Grid numbers were removed; event labels and ranges retain the source wording. Administrative semester span, first day of classes, examinations, ceremony and degree completion are distinct. A calendar does not establish personal graduation eligibility, degree issuance, a complete live event directory or later emergency changes.`,
  events,notes:document.notes,excerpt,excerptTruncated:events.length<document.events.length,totalCharacters:document.pages.reduce((n,p)=>n+p.text.length,0),includedCharacters:excerpt.length};
 return {page:{title:document.title,route:document.url,source:document.source,capturedOn:document.capturedOn},contentAvailable:true,
  evidence:{id:'public-document:calendar:'+document.checksum.slice(0,16),title:document.title,url:document.url,urls:[document.url,document.source,source.directoryUrl],capturedOn:document.capturedOn,content:JSON.stringify(metadata)}};
}
