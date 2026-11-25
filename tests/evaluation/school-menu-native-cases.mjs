/** Held-out navigation cases transcribed from the School Affairs catalog. */
const menu='/school-affairs/menu/';
const services='/school-affairs/services/';
const headings={
  'personal/all':'電算中心','personal/input':'電算中心','menu/common':'常用選單','menu/external':'外部選單',
  'menu/help':'系統說明選單','menu/course':'選課選單','menu/graduation':'畢業離校選單','infoSystem/library':'圖書資訊系統',
};

const rows=[
  ['aca','all','en',34,[['初選','6-1'],['提前畢業申請','7-4']],['線上報修','學生住宿申請']],
  ['aca','input','zh-TW',15,[['加退選','6-2'],['抵免學分申請','7-2']],['選課紀錄查詢','英檢考試系統']],
  ['aca','query','en',17,[['選課紀錄查詢','11-1'],['課程大綱查詢','12-3']],['提前畢業申請','專業學程資料']],
  ['aca','portal','zh-TW',2,[['專業學程資料','18-1'],['英檢考試系統','19-1']],['補加選','選課紀錄查詢']],
  ['sao','all','zh-TW',30,[['請假填單','leave'],['學生住宿申請','26-1']],['線上報修','暑期選課']],
  ['sao','input','en',18,[['就學貸款申請','21-1'],['教學助理自我評表','25-2']],['學生請假紀錄查詢','社團活動']],
  ['sao','query','zh-TW',8,[['學生請假紀錄查詢','leave/history'],['學生團體保險查詢','35-1']],['請假填單','學生住宿申請']],
  ['sao','portal','en',4,[['社團活動','40-1'],['服務領導教育','42-1']],['學生住宿申請','住宿床位查詢']],
  ['swd','all','en',11,[['線上報修','45-1'],['場地使用狀況查詢','47-1']],['請假填單','實習紀錄輸入']],
  ['rdd','all','zh-TW',5,[['實習紀錄輸入','internship'],['實習機構查詢','55-1']],['學生住宿申請','場地使用狀況查詢']],
  ['rdd','input','en',3,[['證照獎補助金申請','52-1'],['實習紀錄輸入','internship']],['實習機構查詢','學習歷程']],
  ['rdd','query','zh-TW',1,[['實習機構查詢','55-1']],['實習紀錄輸入','學習歷程']],
  ['rdd','portal','en',1,[['學習歷程','56-1']],['證照獎補助金申請','實習機構查詢']],
  ['personal','all','zh-TW',4,[['密碼變更','1-1'],['通知訊息查詢','/school-affairs/notifications']],['電影票選系統','學生請假紀錄查詢']],
  ['personal','input','en',2,[['密碼變更','1-1'],['校園公告MAIL接收設定','2-1']],['通知訊息查詢','已收藏消息查詢']],
  ['infoSystem','all','zh-TW',4,[['電影票選系統','57-1'],['電子書有獎徵答','57-2']],['通知訊息查詢','校園公告MAIL接收設定']],
  ['menu','common','en',15,[['Leave application form','leave'],['Moodle Digital Academy','/elearning']],['電影票選系統','校務系統入口操作說明']],
  ['menu','external','zh-TW',5,[['mySTU','/student-sso'],['Moodle數位學園','/elearning']],['就學貸款申請','校務系統入口操作說明']],
  ['menu','help','en',1,[['校務系統入口操作說明','5-1']],['電影票選系統','Moodle數位學園']],
  ['menu','course','zh-TW',10,[['我的功課表','11-2'],['永久課程簡介查詢','12-2']],['離校申請狀態查詢','校務系統入口操作說明']],
  ['menu','graduation','en',1,[['離校申請狀態查詢','16-1']],['我的功課表','提前畢業申請']],
  ['infoSystem','library','zh-TW',4,[['電子書有獎徵答','57-2'],['智慧財產權有獎徵答','57-4']],['校務系統入口操作說明','校園公告MAIL接收設定']],
];

export function buildSchoolMenuNativeCases(){
  return rows.map(([group,view,language,total,anchors,exclusions])=>{
    const chinese=language==='zh-TW';
    const listings=anchors.map(([title,path])=>({title,url:path.startsWith('/')?path:services+path}));
    return {
      id:'public-menu-'+group.toLowerCase()+'-'+view,domain:'school-menu-context',routeFamily:'school-menus',
      route:menu+group+'/'+view,mode:'navigation',language,fixtureKey:'anonymous',
      question:chinese?'這個頁面列出哪些系統服務？':'Which service links are listed on this page?',
      capability:{level:'public',limitation:null},
      expected:{
        behavior:'navigation',provenance:'snapshot',
        requiredText:[...listings.map(item=>item.title),...[headings[group+'/'+view]].filter(Boolean)],
        requiredLinks:listings.map(item=>item.url),
        forbiddenText:exclusions,requiredTools:[],noAction:true,
      },
      catalogExpectation:{group,view,total,listings},
    };
  });
}
