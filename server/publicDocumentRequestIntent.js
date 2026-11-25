/** Asking for the procedure is public; reading an account's records remains private. */
export function isPublicDocumentRequestQuestion(question){
 if(typeof question!=='string'||question.length>2000)return false;
 if(!/\b(?:transcripts?|academic (?:records?|certificates?)|enrol[l]?ment certificates?)\b|成績單|在學證明|學籍證明/iu.test(question))return false;
 if(/\b(?:status|tracking|track|already|submitted|approved|paid|my grades?|my marks?|gpa|download my|show my|read my)\b|進度|狀態|已申請|已繳|我的成績|下載我的|顯示我的/iu.test(question))return false;
 return /\b(?:how|where|procedure|apply|request|obtain)\b|如何|怎麼|哪裡|申請方式|申請流程/iu.test(question);
}
