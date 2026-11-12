import type { PortalProgram } from './model';

export const leavePath: string;
export const internshipPath: string;
export const officialLeaveUrl: string;
export const officialInternshipUrl: string;
export const officialWifiUrl: string;
export const wifiGuidePath: string;
export const officialRegistrarUrl: string;
export type AccountQuery = 'enrollments'|'timetable'|'grades'|'attendance'|'credits'|'student'|'fees';
export const accountQueryByService: Readonly<Partial<Record<string,AccountQuery>>>;
export type SchoolServiceEntry = PortalProgram & {officialUrl:string;localUrl:string};
export const schoolServiceEntries: SchoolServiceEntry[];
export function officialServiceUrl(sourcePath:string):string;
export function serviceDestination(program:PortalProgram):string;
export function studentServiceByKey(key:string):SchoolServiceEntry|undefined;
