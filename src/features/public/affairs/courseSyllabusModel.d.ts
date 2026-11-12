export type CourseSyllabus={
  level:string;language:string;teaching_mode:string;office_hours:string;objectives:string;materials:string;references:string;advice:string;certifications:string;
  grading:{weight:number|null;methods:string[]}[];capabilities:(number|null)[];meanings:number[];sdgs:number[];
  weeks:{date:string;content:string;notes:string}[];
};
export const syllabusTextFields:Record<string,[string,number]>;
export function newCourseSyllabus():CourseSyllabus;
export function normalizeCourseSyllabus(value:unknown):CourseSyllabus;
