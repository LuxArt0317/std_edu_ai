import catalog from './catalog.json' with {type:'json'};

export const leavePath = '/school-affairs/services/leave';
export const internshipPath = '/school-affairs/services/internship';
export const officialLeaveUrl = 'https://infosys.stu.edu.tw/StuLeave/Login/AspLoginStu';
export const officialInternshipUrl = 'https://infosys.stu.edu.tw/StuPractice/Login/Signin';
export const officialWifiUrl = 'https://help.ecc.stu.edu.tw/wireless-setting/';
export const wifiGuidePath = '/school-sites/help.ecc.stu.edu.tw/wireless-setting/';
export const officialRegistrarUrl = 'https://www.aca.stu.edu.tw/%E6%9C%8D%E5%8B%99%E5%B0%8D%E8%B1%A1-services/';
export const accountQueryByService = Object.freeze({
  '11-1':'enrollments',
  '11-2':'timetable',
  '13-1':'grades',
  '14-1':'attendance',
  '15-1':'credits',
  '15-2':'credits',
  '17-1':'student',
  '39-1':'fees',
});

export function officialServiceUrl(sourcePath) {
  return /^https?:\/\//i.test(sourcePath) ? sourcePath : 'https://' + sourcePath;
}

export function serviceDestination(program) {
  switch (program.title) {
    case '學校首頁': return '/';
    case 'mySTU': return '/student-sso';
    case '已收藏消息查詢': return '/school-affairs/bookmarks';
    case '通知訊息查詢': return '/school-affairs/notifications';
  }
  const source = officialServiceUrl(program.sourcePath);
  if (source.toLowerCase() === officialLeaveUrl.toLowerCase())
    return program.kind === 'query' ? leavePath + '/history' : leavePath;
  if (/\/stupractice\/login\//i.test(new URL(source).pathname)) return internshipPath;
  if (new URL(source).hostname === 'dtm.stu.edu.tw') return '/dtm';
  return '/school-affairs/services/' + program.id;
}

export const schoolServiceEntries = catalog.flatMap(([group, kind, section, links], row) =>
  links.map(([title, sourcePath], index) => {
    const entry = {id:(row + 1) + '-' + (index + 1), group, kind, section, title, sourcePath};
    return {...entry, officialUrl:officialServiceUrl(sourcePath), localUrl:serviceDestination(entry)};
  })
);

export function studentServiceByKey(key) {
  if (key === 'leave') return {
    id:key, group:'sao', kind:'input', section:'學生請假', title:'學生請假', sourcePath:officialLeaveUrl,
    localUrl:leavePath, officialUrl:officialLeaveUrl,
  };
  if (key === 'internship') return {
    id:key, group:'sao', kind:'portal', section:'校外實習', title:'學生校外實習管理系統', sourcePath:officialInternshipUrl,
    localUrl:internshipPath, officialUrl:officialInternshipUrl,
  };
  return schoolServiceEntries.find(entry => entry.id === key && entry.localUrl === '/school-affairs/services/' + key);
}
