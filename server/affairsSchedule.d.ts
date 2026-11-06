export type ScheduledSubject = {code:string;title:string;term:string;termStartsOn:string;termEndsOn:string;status:string;weekday:number|null;startsAt:string;endsAt:string;room:string};
export function studyCalendar<T extends ScheduledSubject>(courses:T[],instant?:string):{today:T[];current:T[];upcoming:T[];historical:T[];next:{course:T;day:string}|null;day:string;timeZone:string};
