import {teachingAssistantPath} from './studentServices.js';

export const exchangeGrantPath='/school-affairs/services/23-1';

export const teachingReportNotice={
  id:'teaching-report',
  route:teachingAssistantPath+'/report',
  resultingRoute:teachingAssistantPath,
  title:'目前無法開啟學習單。',
  englishTitle:'The learning report cannot be opened right now.',
  returnTitle:['教學助理管理系統','Teaching Assistant Management'],
};

export const exchangeReceiptNotice={
  id:'exchange-receipts',
  route:exchangeGrantPath+'/receipts',
  resultingRoute:exchangeGrantPath,
  title:'目前沒有可列印的印領清冊。',
  englishTitle:'There is currently no receipt list to print.',
  returnTitle:['助學金申請管理系統','Grant Application Management'],
};

export const schoolServiceNotices=[teachingReportNotice,exchangeReceiptNotice];

export function schoolServiceNoticeForRoute(route){
  if(typeof route!=='string')return undefined;
  return schoolServiceNotices.find(notice=>notice.route===route.replace(/\/$/u,''));
}
