export const facultyTrainingRoutes:{faculty:string;exchange:string;notice:string};
export type FacultyTrainingSections={faculty:{heading:string;serviceLinks:Array<{label:string;href:string}>};exchange:{purpose:string;courseItems:string[];conditions:string[];examples:string[]};notice:{title:string;topic:string;description:string;audienceInvitation:string;date:string;time:string;location:string;publicationLabel:string;organizer:{unit:string;phone:string};registrationLinks:Array<{label:string;href:string}>}};
export function extractFacultyTrainingSources(input:{facultyHtml:string;exchangeHtml:string;noticeHtml:string}):FacultyTrainingSections;
export function importFacultyTrainingSource():Promise<unknown>;
