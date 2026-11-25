/** General housing procedures/rates, never an owned assignment, bill or performed action. */
export function isPublicHousingPolicyQuestion(question){
 return typeof question==='string'&&question.length<=2000
  &&/\b(?:dorm(?:itory)?|housing|accommodation|residence hall)\b|宿舍|住宿/iu.test(question)
  &&/\b(?:fees?|rates?|cost|prices?|how|procedure|apply|move out|check.?out|deposit|refund)\b|費用|收費|價目|如何|怎麼|申請方式|退宿|保證金|退費/iu.test(question)
  &&!/\b(?:wi[ -]?fi|wireless|network|internet|repair|broken)\b|網路|無線|報修|維修/iu.test(question)
  &&!/\b(?:my|our|his|her|their|your)\b.{0,40}\b(?:assigned|beds?|rooms?|bills?|balances?|fees?|deposits?|refunds?|applications?|records?|history)\b|\b(?:am i|will i|would i|do i (?:owe|have|qualify))\b|\bmy (?:friend|roommate|classmate)\b|(?:我的|我們的|他的|她的|他們的).{0,12}(?:床位|房號|費|押金|保證金|退費|帳|申請|紀錄)/iu.test(question)
  &&!/\b(?:my (?:assigned|bed|room|bill|balance|fee|deposit|refund|application)|show my|read my|status|receipt|already|on my behalf|submit|approve|cancel)\b|我的(?:床|房|費|帳|餘|保證金|申請)|進度|狀態|收據|已申請|代我|幫我送出|取消/iu.test(question);
}
