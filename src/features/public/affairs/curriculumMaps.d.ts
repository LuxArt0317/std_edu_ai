export type CurriculumMapEntry = {
  id: string;
  label: string;
  heading: string;
  selection: string;
  overview: string;
  years: string[];
  tracks: {value:string;label:string}[];
};
export type CurriculumMapResult = {
  title: string;
  tables: string[][][];
  semesters: {label:string;courses:{title:string;category:'department'|'required'|'elective'|'other'}[]}[];
};
export const curriculumMapPath: '/school-affairs/services/12-7';
export const curriculumMapColleges: {label:string;entries:CurriculumMapEntry[]}[];
export function curriculumMapEntry(id:string): CurriculumMapEntry|undefined;
export function curriculumMapSource(entry:CurriculumMapEntry,page:'career'|'abtab'|'seccontent'):string;
