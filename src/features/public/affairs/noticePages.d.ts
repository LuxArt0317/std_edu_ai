type SchoolServiceNotice = {
  id: string;
  route: string;
  resultingRoute: string;
  title: string;
  englishTitle: string;
  returnTitle: [string,string];
};
export const teachingReportNotice: SchoolServiceNotice;
export const exchangeReceiptNotice: SchoolServiceNotice;
export const schoolServiceNotices: SchoolServiceNotice[];
export const exchangeGrantPath: '/school-affairs/services/23-1';
export function schoolServiceNoticeForRoute(route:unknown): SchoolServiceNotice|undefined;
