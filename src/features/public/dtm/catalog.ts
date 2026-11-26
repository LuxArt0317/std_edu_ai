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

export {announcements, observedAt} from './noticeCatalog.js';
export const categories = [
  ['115學年度第1學期',1871,88],['114學年度第3學期',30,87],
  ['114學年度第2學期',1940,85],['114學年度第1學期',2003,84],
  ['其它',0,1],['113學年度第3學期',24,83],
  ['113學年度第2學期',2039,82],['113學年度第1學期',2202,79],
  ['112學年度第3學期',22,78],['112學年度第2學期',2129,77],
  ['112學年度第1學期',2319,76],
  ['111學年度第3學期',35,72],['111學年度第2學期',2246,71],['111學年度第1學期',2413,69],
  ['110學年度第3學期',32,67],['110學年度第2學期',2322,66],['110學年度第1學期',2400,63],
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
