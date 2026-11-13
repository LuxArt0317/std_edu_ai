export const exchangeGrantPath = '/school-affairs/services/23-1';
export const exchangeGrantTitle = '國際交流暨校外參賽助學金申請管理系統';
export const exchangeGrantManual = '/stu-reference/grants/operation-manual.pdf';
export const exchangeGrantMenu = [
  {key: 'conference', label: '校外研討會參展申請作業', role: '活動申請者(學生)', description: '校外研討會參展申請作業'},
  {key: 'exchange', label: '國際交流申請作業', role: '活動申請者(學生)', description: '國際交流申請作業'},
  {key: 'reports', label: '心得報告填寫作業', role: '活動參加者(學生)', description: '心得報告填寫作業'},
  {key: 'receipts', label: '印領清冊列印作業', role: '活動申請者(學生)', description: '印領清冊維護作業'},
] as const;
export type ExchangeGrantKind = 'conference' | 'exchange';
export const exchangeGrantDirections = {
  conference: {
    title: exchangeGrantMenu[0].label,
    formTitle: '研討會或校外參展助學金申請作業',
    rulesTitle: '樹德科技大學學生參加研討會或校外參展助學金實施要點',
    closing: [
      '印領清冊。',
      '每人心得報告乙份。',
      '由住宿旅店開立之住宿費憑證（如有申請住宿費補助者須憑證實支實付，抬頭：樹德科技大學；統編：87900886）。',
      '參加或聆聽校外學術研討會者須另檢附研討會議程、論文集封面、目錄。',
    ],
  },
  exchange: {
    title: exchangeGrantMenu[1].label,
    formTitle: '國際交流助學金申請作業',
    rulesTitle: '樹德科技大學學生國際交流助學金實施要點',
    closing: [
      '未出國者，檢附補助項目之收據或發票；出國者，檢附旅行業代收轉付收據（應有學校抬頭：樹德科技大學；統編：87900886）或國際線航空機票購票證明單、電子機票（或機票票根）及往來登機證存根（或航空公司出具搭乘證明）。',
      '每人心得報告乙份。',
      '印領清冊。',
      '論文發表需另檢附研討會議程、論文集封面、目錄。',
      '如有核銷膳宿費，應有住宿旅店開立之住宿費憑證（憑證實支實付，抬頭：樹德科技大學；統編：87900886）。',
    ],
  },
} as const;

export const grantRulesIndex = 'https://life.sao.stu.edu.tw/獎助學金/校內獎助學金/';
