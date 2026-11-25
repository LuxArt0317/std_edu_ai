export function isPublicAdmissionLanguageQuestion(question){
 return typeof question==='string'&&question.length<=2000
  &&/\b(?:mandarin|chinese|english|language|tocfl|cefr)\b|華語|中文|英文|語言/iu.test(question)
  &&/\b(?:international|foreign|admi(?:ssion|t)|enrol[l]?|applicants?|apply)\b|境外|外國學生|國際學生|入學|申請/iu.test(question)
  &&!/\b(?:my (?:score|certificate|result|application)|application status|am i eligible)\b|我的成績|我的證書|申請狀態|我符合/iu.test(question);
}
