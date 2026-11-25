/** Published rules can be explained without claiming the caller has an award. */
export function isPublicScholarshipPolicyQuestion(question){
 if(typeof question!=='string'||question.length>2000)return false;
 if(!/\bipi[a]?c\b|產學合作專班|新南向專班/iu.test(question) && !(/scholar|獎學|獎助/iu.test(question)&&/tuition|學費|學雜費/iu.test(question)))return false;
 if(/\b(?:my|our)\b.{0,50}\b(?:status|balance|paid|approved|received|remaining|amount|application number)\b|我的.{0,20}(?:狀態|餘額|金額|核准|已領|申請編號)/iu.test(question))return false;
 return /\b(?:explain|regulations?|rules?|requirements?|eligibility|academic years?|cohorts?|deduct(?:ions?|ed|ing)?|calculat(?:e|ed|ions?))\b|規定|辦法|規章|申請條件|資格|入學年度|計算/iu.test(question);
}
