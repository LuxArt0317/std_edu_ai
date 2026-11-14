export const healthExaminationPath='/school-affairs/services/36-1';
export const healthCardUrl='https://info.stu.edu.tw/SAO/PEC/CARD/out/nwStudentQuestionnaireP1.asp';
export const healthExaminationScope='health-examinations';
export const healthReportBucket='affairs-health-reports';
export const healthPageSize=25;
export const healthReportLimit=10485760;
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;
export const healthReportId=value=>typeof value==='string'&&uuid.test(value);
export function validHealthReportUrl(url, origin, userId, reportId) {
  const tokens = url.searchParams.getAll('token');
  return url.origin === new URL(origin).origin && !url.username && !url.password && !url.hash &&
    url.pathname === '/storage/v1/object/sign/' + healthReportBucket + '/' + userId + '/' + reportId + '.pdf' &&
    tokens.length === 1 && [...url.searchParams.keys()].length === 1 && /^[a-z0-9_.-]{32,4096}$/iu.test(tokens[0]);
}
export function validHealthExaminations(value,userId){
  return value?.userId===userId&&Number.isSafeInteger(value.total)&&value.total>=0&&Array.isArray(value.rows)&&
    value.rows.length<=healthPageSize&&value.rows.length<=value.total&&value.rows.every(row=>row&&Object.keys(row).length===6&&
      healthReportId(row.id)&&typeof row.report_available==='boolean'&&
      [['examination_code',80],['student_number',80],['student_name',240],['class_label',240]].every(([key,max])=>
        typeof row[key]==='string'&&row[key].trim().length>0&&row[key].length<=max));
}
export function healthExaminationQuestion(question){
  const text=question.normalize('NFKC');
  return /健檢(?:報告|紀錄|結果)|學生健康(?:檢查|資料卡)|\b(?:health|medical) (?:check[- ]?up|exam(?:ination)?) (?:reports?|records?|results?)\b|\bstudent health card\b/iu.test(text);
}
export function healthExaminationGuide(question, signedIn = false) {
  const zh = /[\u3400-\u9fff]/u.test(question);
  const card = /學生健康資料卡|\bstudent health card\b/iu.test(question);
  const url = card ? healthCardUrl : signedIn ? healthExaminationPath :
    '/school-affairs/login?next=' + encodeURIComponent(healthExaminationPath);
  const title = card ? (zh ? '校方學生健康資料卡' : 'University student health card') :
    signedIn ? (zh ? '查看健檢紀錄' : 'Open health examination records') :
      (zh ? '登入後查看健檢紀錄' : 'Sign in to view health examination records');
  const detail = card
    ? (zh ? '此資料卡由校方提供，需使用校方帳戶登入。' : 'Use your university account to open the health card.')
    : (zh ? '健檢紀錄及已上傳的報告可在登入後查看。申請紙本請洽健康促進中心（分機 2108）。'
      : 'Use this page to view records and attached reports. For a printed report, contact the Health Promotion Center at extension 2108.');
  return {
    status: card || !signedIn ? 'handoff' : 'answered',
    answer: '[' + title + '](' + url + ')\n\n' + detail,
    citations: [{ chunkId: 'directory:health-examinations', title, url, claim: detail, sourceName: 'School Affairs',
      locator: null, effectiveAt: null, reviewedAt: null }],
    suggestedQuestions: [],
    grounding: { source: 'directory', webSearched: false },
  };
}
