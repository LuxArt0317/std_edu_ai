export const dtmViews = ['materials','meetings','assignments','grades'] as const;
export type DtmView = typeof dtmViews[number];

export function coursesByTerm<T extends {term:string}>(courses:T[]) {
  const groups = new Map<string,T[]>();
  for (const course of courses) {
    if (!groups.has(course.term)) groups.set(course.term,[]);
    groups.get(course.term)?.push(course);
  }
  return [...groups].sort(([a],[b])=>b.localeCompare(a,undefined,{numeric:true}));
}

/** Public-facing DTM directory labels observed on the official homepage on 2026-11-12.
 * Counts and announcements can change; these are dated reference labels, never
 * evidence of a stu.best user's actual Moodle enrollment. */
export const observedAt = '2026-11-12';
export const announcements = [
  ['請同學務必進行二步驗證註冊，以免期限到被鎖定', 'https://dtm.stu.edu.tw/mod/url/view.php?id=582036', 'Set up two-step verification before the deadline'],
  ['本校微軟Office365 OneDrive空間配額實施OneDrive及Microsoft Office365儲存空間限縮政策及配額', 'https://dtm.stu.edu.tw/mod/page/view.php?id=625803', 'Microsoft 365 and OneDrive storage quotas'],
  ['【老師通知】實體課程依然以數位教材網為主', 'https://dtm.stu.edu.tw/mod/page/view.php?id=605479', 'Teacher notice: use DTM for in-person classes'],
  ['【老師通知】教材上傳教學更新版', 'https://dtm.stu.edu.tw/mod/url/view.php?id=611329', 'Teacher notice: updated guide to uploading materials'],
  ['【解決教材無法瀏覽】iPhone / iPad 跨網站追蹤與快取', 'https://dtm.stu.edu.tw/mod/page/view.php?id=474576', 'Troubleshoot viewing materials on iPhone or iPad'],
  ['【解決教材無法瀏覽】電腦瀏覽器排解教學', 'https://dtm.stu.edu.tw/mod/url/view.php?id=396168', 'Troubleshoot viewing materials in a desktop browser'],
  ['【重要通知】全校 Google 雲端空間配額上線時程', 'https://dtm.stu.edu.tw/mod/page/view.php?id=505419', 'Google Drive storage quota rollout'],
  ['教材上雲端後如何關閉文件下載功能', 'https://dtm.stu.edu.tw/mod/url/view.php?id=296535', 'Turn off downloads for materials shared in the cloud'],
  ['因應 Google 變更分享方式，請老師將 PPT 檔案轉存成 PDF 格式後再上傳雲端，否則無法進行連結嵌入！', 'https://dtm.stu.edu.tw/mod/url/view.php?id=448453', 'Save PowerPoint slides as PDF before uploading'],
  ['數位教材網基本使用教學', 'https://dtm.stu.edu.tw/mod/url/view.php?id=34355', 'Getting started with DTM'],
  ['教材上網與教材權限設定', 'https://dtm.stu.edu.tw/mod/url/view.php?id=47', 'Upload materials and set access permissions'],
  ['【重要】教材匯入功能', 'https://dtm.stu.edu.tw/mod/page/view.php?id=75065', 'Import course materials'],
  ['本年度提供所有老師 Google Meet 企業版', 'https://dtm.stu.edu.tw/mod/page/view.php?id=476797', 'Google Meet Enterprise for teachers'],
  ['數位學園與數位教材網的差異', 'https://dtm.stu.edu.tw/mod/page/view.php?id=4', 'Difference between E-learning and DTM'],
] as const;
export const categories = [
  ['115學年度第1學期',1871,88],['114學年度第3學期',30,87],
  ['114學年度第2學期',1940,85],['114學年度第1學期',2003,84],
  ['其它',0,1],['113學年度第3學期',24,83],
  ['113學年度第2學期',2039,82],['113學年度第1學期',2202,79],
  ['112學年度第3學期',22,78],['112學年度第2學期',2129,77],
  ['112學年度第1學期',2319,76],
  ['111學年度第3學期',35,72],['111學年度第2學期',2246,71],['111學年度第1學期',2413,69],
  ['110學年度第3學期',32,67],['110學年度第2學期',2262,66],['110學年度第1學期',2400,63],
  ['109學年度第3學期',27,62],['109學年度第2學期',2280,57],['109學年度第1學期',2402,56],
] as const;
export const otherCategories = [
  ['語文中心','Language Center',58,6],['電算中心','Computing Center',60,0],
  ['證照訓練','Certification training',18,3],['學分班','Credit courses',70,2],
  ['推廣教育中心','Continuing Education Center',64,0],
] as const;
export const quickLinks = [
  ['學校首頁','/','School homepage'],['校務資訊系統','/school-affairs','School Affairs'],
  ['數位學園','/elearning','Digital Academy'],['CU平台','https://cu.stu.edu.tw/','CU platform'],
  ['TronClass平台','https://tc.stu.edu.tw/','TronClass'],['Gmail','https://my.stu.edu.tw/','School Gmail'],
  ['電算中心','https://ecc.stu.edu.tw/','Computing Center'],
] as const;
