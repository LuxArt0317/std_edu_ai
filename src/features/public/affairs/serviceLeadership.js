export const serviceLeadershipPath = '/school-affairs/services/42-1';
const officialRoot = 'https://info.stu.edu.tw/SAO/LSD/student/';

export const serviceLeadershipViews = [
  {
    key:'preselection', label:'服務單位預選', heading:'服務實作單位預選', source:officialRoot+'mtnSelectUnit.asp',
    lines:['開學第二週進行服務實作單位預選。','第三週請查詢正式選擇結果。'],
    englishLabel:'Service unit preselection',
    english:'Open service unit preselection. Confirm your placement in the third week.',
  },
  {
    key:'confirmation', label:'服務實作單位確認', heading:'服務實作單位確認', source:officialRoot+'qrySelectUnit.asp',
    lines:['第三週查詢確認結果。第四週至第十四週到確認的服務單位進行服務。'],
    englishLabel:'Service placement confirmation',
    english:'Open service placement confirmation to check your assigned unit.',
  },
  {
    key:'lectures', label:'服務講堂課程查詢', heading:'服務講堂課程查詢', source:officialRoot+'qryAllLecture.asp',
    lines:['查詢各學期的服務講堂課程及個人當期修課情況。'],
    englishLabel:'Service leadership lectures',
    english:'Open the service leadership lecture and enrollment lookup.',
  },
  {
    key:'assignments', label:'作業繳交及成績查詢', heading:'作業繳交及成績查詢', source:officialRoot+'qryOffClass.asp',
    lines:['查詢服務領導各項目的完成狀態。','填寫服務實作報告及反思問卷。'],
    englishLabel:'Service leadership assignments and grades',
    english:'Open the service leadership assignment, reflection, and grade destination.',
  },
];
