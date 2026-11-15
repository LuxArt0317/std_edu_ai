export type LibraryAnswerLanguage='en'|'zh-Hant';
export type OfficialLibraryLead={id:string;url:string;titleEn:string;titleZh:string;kind:'library-service'};
export function findOfficialLibraryServiceLeads(question:string):OfficialLibraryLead[];
export function isOfficialLibraryLead(value:unknown):boolean;
export function libraryAnswerLanguage(question:string):LibraryAnswerLanguage;
export function libraryAnswerMatchesLanguage(answer:unknown,language:LibraryAnswerLanguage):boolean;
