import catalog from "./catalog.json";

type SourceRow = [string, string, string, [string, string][]];
export interface PortalProgram {
  id: string;
  title: string;
  sourcePath: string;
  group: string;
  kind: string;
  section: string;
}
export const portalRows = (catalog as SourceRow[]).map(
  ([group, kind, section, links], row) => ({
    group,
    kind,
    section,
    programs: links.map(([title, sourcePath], index): PortalProgram => ({
      id: `${row + 1}-${index + 1}`,
      title,
      sourcePath,
      group,
      kind,
      section,
    })),
  }),
);
export const portalPrograms = portalRows.flatMap((row) => row.programs);
export const portalGroups = [
  {
    id: "menu",
    label: "選單資訊",
    views: [
      ["custom", "自訂選單"],
      ["common", "常用選單"],
      ["external", "外部選單"],
      ["help", "系統說明選單"],
      ["course", "選課選單"],
      ["graduation", "畢業離校選單"],
    ],
  },
  {
    id: "aca",
    label: "教務系統",
    views: [
      ["all", "系統列表及搜尋"],
      ["input", "申請輸入程式"],
      ["query", "查詢程式"],
      ["portal", "系統入口"],
    ],
  },
  {
    id: "sao",
    label: "學務資訊",
    views: [
      ["all", "系統列表及搜尋"],
      ["input", "申請輸入程式"],
      ["query", "查詢程式"],
      ["portal", "系統入口"],
    ],
  },
  {
    id: "swd",
    label: "總務資訊",
    views: [
      ["all", "系統列表及搜尋"],
      ["input", "申請輸入程式"],
      ["query", "查詢程式"],
    ],
  },
  {
    id: "rdd",
    label: "研發系統",
    views: [
      ["all", "系統列表及搜尋"],
      ["input", "申請輸入程式"],
      ["query", "查詢程式"],
      ["portal", "系統入口"],
    ],
  },
  {
    id: "personal",
    label: "電算中心",
    views: [
      ["all", "系統列表及搜尋"],
      ["input", "申請輸入程式"],
    ],
  },
  {
    id: "infoSystem",
    label: "資訊系統",
    views: [
      ["all", "系統入口清單"],
      ["library", "圖書資訊系統"],
    ],
  },
];
export const kindLabels: Record<string, string> = {
  input: "輸入",
  query: "查詢",
  portal: "系統入口",
  external: "外部選單",
  stu: "系統說明",
};
export const menuPath = (group: string, view: string) =>
  `/school-affairs/menu/${group}/${view}`;
export const programByTitle = (title: string) =>
  portalPrograms.find((program) => program.title === title);
const commonTitles = [
  ["請假填單", "請假填單"],
  ["就學貸款申請", "就學貸款申請"],
  ["Leave application form", "請假填單"],
  ["Inquiry of Absenteeism Records", "缺曠課紀錄查詢"],
  [
    "Checking the status of your application to leave school",
    "離校申請狀態查詢",
  ],
  ["行事曆", "行事曆"],
  ["CU數位平台", "CU數位平台"],
  ["學校首頁", "學校首頁"],
  ["Calendar", "行事曆"],
  ["Moodle Digital Academy", "Moodle數位學園"],
  ["mySTU", "mySTU"],
  ["My course schedule;", "我的功課表"],
  ["Course selection record query;", "選課紀錄查詢"],
  ["Club activities", "社團活動"],
  ["Proof of enrollment", "在學證明"],
];
export const commonPrograms = commonTitles.map(([label, title]) => ({
  ...programByTitle(title)!,
  title: label,
}));
const courseTitles = [
  "初選",
  "加退選",
  "我的功課表",
  "暑期選課",
  "棄選",
  "歷年超減修申請紀錄查詢",
  "永久課程簡介查詢",
  "補加選",
  "選課確認",
  "選課紀錄查詢",
];
export function getMenuPrograms(
  group: string,
  view: string,
  favorites: readonly string[] = [],
): PortalProgram[] {
  if (group === "menu") {
    if (view === "common") return commonPrograms;
    if (view === "custom")
      return portalPrograms.filter((program) => favorites.includes(program.id));
    if (view === "course")
      return courseTitles.map((title) => programByTitle(title)!);
    if (view === "graduation") return [programByTitle("離校申請狀態查詢")!];
    if (view === "external")
      return portalPrograms.filter((program) => program.group === "sysmenu");
    if (view === "help")
      return portalPrograms.filter((program) => program.group === "sysDoc");
    return [];
  }
  return portalPrograms.filter(
    (program) =>
      (group === "all" || program.group === group) &&
      (["all", "library"].includes(view) || program.kind === view),
  );
}
export const filterPrograms = (
  programs: readonly PortalProgram[],
  query: string,
) => {
  const terms = query
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return programs.filter((program) =>
    terms.every((term) =>
      `${program.title} ${program.section}`
        .normalize("NFKC")
        .toLocaleLowerCase()
        .includes(term),
    ),
  );
};

export interface PortalNews {
  id: string;
  title: string;
  category: "news" | "health";
  summary: string;
}
const headlines = [
  "溝坪社區在地文化推廣與財務規劃知能培育計畫SIG共同培力活動最後一場",
  "📣 你的聲音，讓校園更好！ 日間部學生會｜115學年度第一學期校園生活滿意度調查｜",
  "🎁 好禮「樹」於你｜日間部學生會會員小禮物開領啦！",
  "【🤜志工培訓】轉知～中華非營利組織發展協會舉辦「志願服務基礎訓練及志願服務特殊訓練-社會福利類」，歡迎有興趣的同學踴躍參加！",
  "115.11.02 學生掛號郵件清單 (請務必自行點閱附加清單)",
  "【📣物資補助計畫】轉知～財團法人金車文教基金會舉辦「2027金車曙光寒假物資贊助計劃」，歡迎有興趣的同學踴躍提案申請！",
  "【For導師.系助】請推派班級幹部代表參加「115年第1學期班級幹部增能訓練活動」第3次公告",
  "歡迎報名參加~外語日活動–感恩節「語」你同樂！",
  "🚀 你的創意，不只是想法！「新樹界」創新創業競賽熱烈徵件中！",
  "【開會通知】115.11.10(二)14:00召開本校「115學年度第1學期膳食委員會會議」",
];
const healthHeadlines = [
  "【登革熱防疫宣導】積水容器乖乖清，巡倒清刷馬上行",
  "【疫苗資訊】10/19起開打！新增 Novavax XFG COVID-19公費疫苗接種資訊",
  "💪【連假防疫提醒】流感防治做的好，開心放假沒煩惱！",
  "防範非洲豬瘟、口蹄疫、牛結節疹及高病原性家禽流行性感冒宣導",
  "【登革熱防治宣導】境外移入登革熱確診者就醫拒驗快篩，若影響防疫最高罰30萬元",
  "📢 【開學季校園防疫重點公告】新冠、流感、水痘與登革熱防護",
  "【身心健康中心公告】115學年度『因應高雄市政府「登革熱邊境防疫~境外學生檢疫」防疫措施工作協調會議』會議紀錄",
  "📢【疫苗接種資訊】115-116年度COVID-19疫苗接種計畫與防疫提醒",
  "📢【疫苗接種資訊】轉知衛福部COVID-19疫苗公費接種延長至115年9月28日",
];
export const portalNews: PortalNews[] = [
  ...headlines.map((title, index): PortalNews => ({
    id: `news-${index}`,
    title,
    category: "news",
    summary:
      index === 0
        ? "本活動介紹溝坪社區的西拉雅族文化，並安排文化體驗。最後一場狩獵文化活動調整至11月6日辦理；報名及完整內容請查看原始公告。"
        : "此介面保留原始公告標題。完整內文及附件請以校方公告為準；這裡的閱讀、收藏及分享功能只作用於本地預覽。",
  })),
  ...healthHeadlines.map((title, index): PortalNews => ({
    id: `health-${index}`,
    title,
    category: "health",
    summary:
      "此介面保留原始防疫公告標題，用於展示閱讀與收藏流程。公告內文、醫療建議及最新規定請以校方及衛生主管機關發布的資訊為準。",
  })),
];
