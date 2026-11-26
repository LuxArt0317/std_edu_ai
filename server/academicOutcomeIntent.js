/** Read-only first-person academic outcome questions; never predicts eligibility or rank. */
export function isCombinedAcademicOutcomeQuestion(question){
 if(typeof question!=='string'||question.length>320)return false;
 const text=question.normalize('NFKC').trim().replace(/[?？。.！!]+$/u,'').trim();
 return /^(?:based on my (?:past|previous|historical|saved) grades,?\s*)?(?:can|may) i graduate,? and (?:what (?:rank|ranking|class standing) (?:would|will) i (?:get|have)|what is my (?:rank|ranking|class standing))$/iu.test(text)
  ||/^(?:根據|依據)我(?:的)?(?:歷年|過去|已儲存)(?:成績)[,，]?(?:我)?(?:能否|是否可以|可以)畢業[,，]?(?:以及|和|而且)?我(?:的)?(?:排名|名次)(?:會是什麼|是多少|如何)$/u.test(text);
}
