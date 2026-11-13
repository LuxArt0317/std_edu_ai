export const courseSubstitutionPath: '/school-affairs/services/12-8';
export const substitutionSource: string;
export const substitutionYears: readonly string[];
export const substitutionTracks: readonly string[];
export function substitutionTrack(key: unknown): string | undefined;
export function substitutionDepartmentCode(value: unknown): value is string;
export function substitutionCourseCode(value: unknown): value is string;

export interface SubstitutionDepartment {
  code: string;
  name: string;
}
export interface SubstitutionCourse {
  code: string;
  name: string;
  credits: string;
  detailStatus: 'listed' | 'none' | 'unlisted';
  groups: Array<{ label: string; courses: Array<{
    code: string; name: string; credits: string; required: string; notes: string;
  }> }>;
}
export interface SubstitutionResult {
  year: string;
  track: string;
  department: SubstitutionDepartment;
  source: 'live' | 'snapshot';
  checkedOn: string;
  courses: SubstitutionCourse[];
}

export function courseSubstitutionQuestion(question:string,route?:string):{code:string;year:string;trackKey:string;departmentCode:string}|null;
