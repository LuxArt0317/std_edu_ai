export const courseSubstitutionPath = '/school-affairs/services/12-8';
export const substitutionSource = 'https://info.stu.edu.tw/ACA/student/qryCOURSEKD/qryCourseKindAdmit.asp';
export const substitutionYears = ["115", "114", "113", "112", "111", "110", "109", "108", "107", "106", "105", "104", "103", "102", "101", "100", "099", "098", "097", "096", "095", "094", "093", "092", "091", "090", "089", "088"];
export const substitutionTracks = ["四技日間部", "二技日間部", "四技進修部", "二技在職專班", "二技進修部", "碩士班", "碩士在職專班", "博士班", "進修二專", "產學四技學士專班", "二專日間部", "雙軌訓練旗艦計畫", "二專進修部", "五專日間部", "大學先修班"];

export function substitutionTrack(key) {
  return typeof key === 'string' && /^(?:[1-9]|1[0-5])$/.test(key) ? substitutionTracks[Number(key)-1] : undefined;
}

export function substitutionDepartmentCode(value) {
  return typeof value === 'string' && /^[A-Z0-9]{1,8}$/.test(value);
}

export function substitutionCourseCode(value) {
  return typeof value === 'string' && /^[A-Z0-9-]{1,24}$/.test(value);
}

export function courseSubstitutionQuestion(question,route='') {
  const normalized=question.normalize('NFKC').trim();
  const match=/^course substitutions? for ([A-Z0-9-]+),\s*cohort (\d{3}),\s*track (\d{1,2}),\s*department ([A-Z0-9]+)[?.!]*$/i.exec(normalized)
    || /^替代科目[：: ]*([A-Z0-9-]+)[,， ]+屆別\s*(\d{3})[,， ]+學制\s*(\d{1,2})[,， ]+開課單位\s*([A-Z0-9]+)[?。！]*$/i.exec(normalized);
  const inResult=/^\/school-affairs\/services\/12-8\/results\/(\d{3})\/(\d{1,2})\/([A-Z0-9]+)$/.exec(route);
  const onPage=/^(?:course substitutions? for|replacement courses? for|what (?:can replace|replaces)) ([A-Z0-9-]+)[?.!]*$/i.exec(normalized)
    || /^([A-Z0-9-]+)\s*(?:的)?替代科目(?:有哪些|是什麼)?[?？。！]*$/i.exec(normalized);
  const fields=match?.slice(1) ?? (inResult && onPage ? [onPage[1],...inResult.slice(1)] : null);
  if (!fields) return null;
  const [original,year,trackKey,department]=fields;
  const code=original.toUpperCase(),departmentCode=department.toUpperCase();
  return substitutionCourseCode(code) && substitutionYears.includes(year) && substitutionTrack(trackKey) &&
    substitutionDepartmentCode(departmentCode) ? {code,year,trackKey,departmentCode} : null;
}
