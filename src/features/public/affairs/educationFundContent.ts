/** Literal public instructions observed after authorized read-only sign-in.
 * This dated reference is not a current policy, eligibility decision or application API.
 */
export const educationFundReference = {
  observedOn:'2026-11-13',
  sourceUrl:'https://info.stu.edu.tw/sao/edufundli/student/index.asp',
  path:'/school-affairs/services/21-2',
  title:'學產助學金申請系統',
  instructionsTitle:'教育部學產基金低收入戶學生助學金申請注意事項',
  periodText:'系統開放時間: 2026/9/1 上午 08:00:00 至 2026/10/12 下午 08:00:00 止',
  sections:[
    {title:'一、申請條件：',items:[
      '本要點所稱低收入戶學生，指在學學生持有低收入戶證明者。',
      '前學期成績學業成績總平均及格，且德行評量無小過以上之處分。',
    ]},
    {title:'二、不得申請：',paragraph:'研究所、空中大學、空中大學附設行政專校、空中商專及進修專科學校。'},
    {title:'三、已領有下列補助之一者，不得申請本補助：',items:[
      '公教人員子女教育補助。',
      '身心障礙學生及身心障礙人士子女就學費用減免。',
      '特殊教育學生獎學金及補助金。',
      '軍公教遺族就學費用優待。',
      '現役軍人子女就讀中等以上學校學費減免。',
      '原住民學生助學金、伙食費及住宿費補助。',
      '特殊境遇家庭子女孫子女就讀高級中等以上學校學雜費減免。',
      '本部補助高級中等學校學生免納學費之補助及定額補助',
      '師資培育公費生及公費醫師培育之公費待遇。',
      '行政院國軍退除役官兵輔導委員會之清寒榮民及清寒遺眷子女獎助學金。',
      '勞動部之失業勞工子女助學金。',
      '行政院農業委員會之農漁民子女助學金。',
      '其他經本部公告之政府各類學雜費減免及優待補助。',
    ]},
    {title:'四、每學期皆須申請一次(開學後15日內務必辦理完成)'},
    {title:'五、繳交資料：',items:[
      '【教育部學產基金低收入戶助學金申請書】。',
      '【低收入戶證明】有效期限內正本或影本，須列出學生的名字。',
    ]},
    {title:'六、教育部學產低收入戶助學金發放方式：',paragraph:'助學金發放以滙款方式，本校往來銀行為第一銀行，若您提供非第一銀行帳戶，銀行將收取滙款手續費15元(若有增減以銀行公告為準).。',emphasized:true},
  ],
} as const;
