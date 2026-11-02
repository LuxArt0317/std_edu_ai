export type StudentLink = { title: string; href: string | null };
export type StudentCategory = { title: string; items: StudentLink[] };
const group = (
  title: string,
  rows: Array<[string, string | null]>,
): StudentCategory => ({
  title,
  items: rows.map(([title, href]) => ({ title, href })),
});
// Functional directory labels and destinations observed on the official current-student page, 2026-11-02.
export const studentCategories: StudentCategory[] = [
  group("資訊系統", [
    ["校務資訊系統", "https://info.stu.edu.tw/ePortal/login.asp"],
    ["學生Gmail", "https://mail.google.com/a/stu.edu.tw"],
    ["TronClass創課(遠距教學)", "https://tc.stu.edu.tw/"],
    ["Moodle數位教材網", "https://dtm.stu.edu.tw/login/index.php"],
    ["GO！服務", "https://go.stu.edu.tw/"],
    ["宿網報修", "https://www.ecc.stu.edu.tw/學生宿舍網路報修/"],
    ["無線網路", "https://help.ecc.stu.edu.tw/wireless-setting/"],
    ["宿網管理系統", "https://dorm.stu.edu.tw/"],
    ["教學文件網站", "http://help.ecc.stu.edu.tw/"],
    ["密碼遺忘", "https://www.ecc.stu.edu.tw/forget-password-student/"],
    ["兩步驟驗證重置", "https://www.ecc.stu.edu.tw/stu2fchange/"],
    ["密碼變更", "https://sso.stu.edu.tw/chpswd/"],
  ]),
  group("課程學習", [
    [
      "當學期課程查詢",
      "https://info.stu.edu.tw/ACA/student/QueryAGECourse/index.asp",
    ],
    [
      "歷年課程查詢",
      "https://info.stu.edu.tw/ACA/teacher/QryCoursedept/qrydeptCourse.asp?lt=1",
    ],
    [
      "必修科目查詢",
      "https://info.stu.edu.tw/ACA/teacher/QryCoursedept/qrydeptCourse.asp?lt=1",
    ],
    ["課程地圖", "https://info.stu.edu.tw/ACA/student/CM/cm.asp"],
    [
      "歷程檔案系統",
      "http://infosys.stu.edu.tw/infosys.stu.edu.tw/StuSEP/Home/IndexTutorStuSEP/Home/IndexTutor",
    ],
    [
      "課程查詢系統",
      "https://info.stu.edu.tw/ACA/student/QueryAGECourse/index.asp",
    ],
    [
      "歷年課程規劃",
      "https://info.stu.edu.tw/ACA/teacher/QryCoursedept/qrydeptCourse.asp?lt=1",
    ],
    [
      "學分學程查詢",
      "https://info.stu.edu.tw/ACA/teacher/QryIntraCourse/qryIntraCourse.asp?lt=1",
    ],
    ["課程地圖查詢", "https://info.stu.edu.tw/ACA/student/CM/cm.asp"],
    [
      "替代科目查詢",
      "https://info.stu.edu.tw/ACA/student/qryCOURSEKD/qryCourseKindAdmit.asp",
    ],
    ["選課查詢", "https://www.aca.stu.edu.tw/選課資訊/"],
    [
      "成績查詢",
      "https://www.aca.stu.edu.tw/2024/02/01/學期成績開放查詢及申請列印/",
    ],
    [
      "課程大綱查詢",
      "https://info.stu.edu.tw/ACA/teacher/Syllabus/MainCoursequery.asp",
    ],
    ["暑修資訊", "https://www.aca.stu.edu.tw/暑期開課/"],
    ["在學證明", null],
    ["行事曆(學生)", "https://www.aca.stu.edu.tw/行事曆｜calendar/"],
    [
      "教學意見調查系統",
      "https://www.aca.stu.edu.tw/2019/06/13/教學意見反應管道宣導/",
    ],
    ["學生選課系統", "https://www.aca.stu.edu.tw/選課資訊/"],
    ["Moodle數位教材網", "https://dtm.stu.edu.tw/login/index.php"],
    ["TronClass創課（遠距教學）", "https://tc.stu.edu.tw/"],
    [
      "一般安全衛生教育",
      "https://elearning.stu.edu.tw/course/index.php?categoryid=25",
    ],
  ]),
  group("生活資訊", [
    ["校園公車", "https://things.stu.edu.tw/交通車資訊/"],
    ["停車證申辦", "https://things.stu.edu.tw/停車證申辦流程/"],
    ["場地借用", "https://info.stu.edu.tw/swd/placeBorrow/qryClassroom.asp"],
    ["學生餐廳", "https://about.stu.edu.tw/#menu2"],
    ["宿舍申請", "https://omh.sao.stu.edu.tw/申請-更換-退宿/"],
    ["學生請假", "https://life.sao.stu.edu.tw/請假流程說明/"],
    ["學生兵役", "https://life.sao.stu.edu.tw/學生兵役/"],
    ["校外賃居", "https://life.sao.stu.edu.tw/校外賃居/"],
    ["線上報修", "https://infosys.stu.edu.tw/WebRpg/Login/AspLogin/1"],
    ["校園安全", "https://www.ssc.stu.edu.tw/"],
    ["校園友善地圖", null],
    ["社團介紹", "https://activity.sao.stu.edu.tw/活力社團介紹/"],
    ["學生團體保險", "https://health.sao.stu.edu.tw/學生團體保險/"],
    ["學生健康檢查", "https://health.sao.stu.edu.tw/健康檢查/"],
    ["線上預約諮商", "https://share.google/1XnqrRTKQrXy7DPCM"],
    ["全校分機表", "https://www.stu.edu.tw/分機表/"],
  ]),
  group("獎助學金資源", [
    ["獎助學金資訊", "https://life.sao.stu.edu.tw/獎助學金/"],
    ["教育部學雜費減免", "https://life.sao.stu.edu.tw/教育部學雜費減免/"],
    ["急難慰助金", "https://life.sao.stu.edu.tw/急難救助/"],
    ["弱勢助學", "https://life.sao.stu.edu.tw/弱勢助學/"],
    ["就學貸款", "https://life.sao.stu.edu.tw/就學貸款/"],
    ["完善就學勵學金專區", "https://www.sao.stu.edu.tw/高教勵學金-"],
    [
      "行政院減免學雜費拉近方案",
      "https://life.sao.stu.edu.tw/行政院減免學雜費拉近方案/",
    ],
  ]),
  group("註冊及繳費", [
    ["網路註冊", "https://www.aca.stu.edu.tw/註冊繳費資訊/"],
    ["註冊繳費專區資訊", "https://cash.stu.edu.tw/服務項目/"],
    ["繳費列印及查詢", "https://cash.stu.edu.tw/服務項目/"],
    ["學雜費標準", "https://www.acc.stu.edu.tw/學費計算/學雜費專區/"],
    ["住宿收費標準", "https://omh.sao.stu.edu.tw/房型-價目一覽/"],
  ]),
  group("畢業資訊", [
    [
      "學士班畢業檢核",
      "https://www.aca.stu.edu.tw/2025/09/07/請同學上網查看畢業學分檢核表/",
    ],
    ["畢業生離校", "https://www.aca.stu.edu.tw/畢業離校-leaving/"],
    [
      "學士班成績優異提前畢業",
      "https://www.aca.stu.edu.tw/提前畢業-graduate-in-advance/",
    ],
    ["畢業典禮", "https://activity.sao.stu.edu.tw/樹德科技大學畢業典禮官網/"],
  ]),
  group("學術資源", [
    ["圖書館服務時間", "https://lis.stu.edu.tw/115-08-26-9/"],
    ["圖書館館藏目錄", "https://webpac.stu.edu.tw/webopac/"],
    ["電子資源資料庫", "https://stars.stu.edu.tw/stuhyint/index.jsp"],
    ["論文原創性比對系統", "https://lis.stu.edu.tw/115-08-26-3/"],
    ["研究生學術倫理教育專區", "https://ethics.moe.edu.tw/"],
    [
      "博碩士論文查詢",
      "https://ndltd.ncl.edu.tw/cgi-bin/gs32/gsweb.cgi/login?o=dnclcdr&extralimit=asc=%22%E6%A8%B9%E5%BE%B7%E7%A7%91%E6%8A%80%E5%A4%A7%E5%AD%B8%22&extralimitunit=%E6%A8%B9%E5%BE%B7%E7%A7%91%E6%8A%80%E5%A4%A7%E5%AD%B8&searchmode=basic",
    ],
    ["電子資源整合查詢系統", "https://stars.stu.edu.tw/stuhyint/index.jsp"],
  ]),
];
