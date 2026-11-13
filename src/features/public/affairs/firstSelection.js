export const firstSelectionPath = '/school-affairs/services/6-1';
export const firstSelectionFeesPath = firstSelectionPath + '/fees';
export const firstSelectionScope = 'first-selection-notice';
export const firstSelectionSource = 'https://info.stu.edu.tw/aca/student/SelectCourse/SelNote.asp';
export const firstSelectionFeeSource = 'https://info.stu.edu.tw/aca/student/SelectCourse/FirstCourseLogin.asp';

export const firstSelectionPhases = Object.freeze(['I', 'II', 'III']);
const localPaths = [firstSelectionPath, firstSelectionFeesPath];

export function firstSelectionQuestion(question, route = '') {
  if (/\b(?:my|mine|our|eligible|eligibility|qualify|am i|can i|could i|selected|enrolled|registered|password|access_token|refresh_token|history|records?)\b|我的|我能|我可|我有|資格|已選|紀錄|記錄|密碼/iu.test(question)) return null;

  const path = route.split(/[?#]/u, 1)[0].replace(/\/$/u, '');
  const topic = /\b(?:initial|first)[ -]+(?:course[ -]+)?(?:selection|registration)\b|初選/iu.test(question);
  if (!topic && (!localPaths.includes(path) || !/\b(?:this|that|it|schedule|notice|window|phase|period)\b|這|本頁|公告|時程|階段/iu.test(question))) return null;

  if (/\b(?:fees?|tuition|payment|charges?)\b|費用|收費|繳費|學雜費|學費/iu.test(question)) return topic || path === firstSelectionFeesPath ? 'fees' : null;
  if (/\b(?:when|windows?|dates?|schedule|deadlines?|open|close|start|end|periods?)\b|何時|幾點|時間|日期|時程|開始|截止|開放/iu.test(question)) return 'schedule';
  return null;
}

export function firstSelectionDate(instant, locale = 'zh-Hant-TW') {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit',
    minute: '2-digit', hourCycle: 'h23',
  }).format(instant);
}

export function firstSelectionTableDate(instant) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant).map(({type, value}) => [type, value]));
  const hour = Number(parts.hour);
  return Number(parts.month) + '/' + Number(parts.day) + (hour < 12 ? '上午' : '下午') + String(hour % 12 || 12).padStart(2, '0') + ':' + parts.minute;
}
