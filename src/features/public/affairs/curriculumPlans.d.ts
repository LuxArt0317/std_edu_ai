export type CurriculumCell = string | {text:string;code:string};
export type CurriculumTable = {
  program:string;
  archive:boolean;
  source:string;
  hash:string;
  rows:CurriculumCell[][];
};
export type CurriculumDocument = {text:string;code:string;department:string;year:string;program:string;archive:boolean};
export const curriculumPlansPath: '/school-affairs/services/12-5';
export const curriculumProgramLabels: Record<string,string>;
export const curriculumPrograms: {code:string;label:string}[];
export function curriculumTable(program?:string,archive?:boolean): CurriculumTable|undefined;
export function curriculumDocument(code:string): CurriculumDocument|undefined;
export function curriculumDocumentSource(code:string): string|undefined;
export function curriculumProgramPath(program:string,archive?:boolean): string;
