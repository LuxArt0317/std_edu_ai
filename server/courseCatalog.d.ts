import type {AffairsAccount} from './affairsWorkspace.js';
import type {CatalogResult,CourseOffering} from '../src/features/public/affairs/courseCatalogModel.js';
export function normalizeCatalogQuery(query?:Record<string,string|string[]|undefined>):Record<string,unknown>;
export function normalizeCourseOffering(record:unknown):Record<string,unknown>;
export function loadCourseCatalog(account:AffairsAccount,query?:Record<string,string|string[]|undefined>):Promise<CatalogResult>;
export function manageCourseCatalog(account:AffairsAccount,kind:string,payload:unknown):Promise<{id:string;version:number;kind:string;summary:string}>;
