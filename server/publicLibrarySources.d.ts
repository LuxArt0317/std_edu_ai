export type LibraryAnswerLanguage='en'|'zh-Hant';
export type LibraryWeekdayHours={mondayThroughThursday:string;friday:string};
export type OfficialLibraryLead={id:string;url:string;titleEn:string;titleZh:string;kind:'library-service'};
export function findOfficialLibraryServiceLeads(question:string):OfficialLibraryLead[];
export function isOfficialLibraryLead(value:unknown):boolean;
export function isOfficialLibraryHoursLead(value:unknown):boolean;
export function libraryAnswerLanguage(question:string):LibraryAnswerLanguage;
export function libraryAnswerMatchesLanguage(answer:unknown,language:LibraryAnswerLanguage):boolean;
