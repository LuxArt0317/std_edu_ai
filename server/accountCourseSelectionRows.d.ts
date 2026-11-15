import type {CourseSelectionFilter} from './courseSelection.js';
import type {CourseSelectionRecords} from '../src/services/courseSelection.ts';
export type CourseSelectionReadScope=CourseSelectionFilter&{timetable:boolean};
export const courseSelectionTable:string;
export const courseSelectionOrder:string;
export function courseSelectionQuery(scope:CourseSelectionReadScope):Record<string,string>;
export function mapOwnedCourseSelection(rows:unknown,owner:string,scope:CourseSelectionReadScope):CourseSelectionRecords['records'];
