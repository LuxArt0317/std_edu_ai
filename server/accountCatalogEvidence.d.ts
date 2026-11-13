import type {SyllabusAccount,loadSyllabusSearch,loadSyllabusDetail} from './syllabusSearch.js';
export const catalogEvidenceRequirements:Readonly<{migration:'20261112170000';mounted:true;readOnly:true}>;
export const catalogEvidenceMaxBytes:18000;
export type CatalogEvidenceQuery={id?:string;search_scope?:'current'|'historical';keyword?:string;term?:string;department?:string;themes?:string;page?:string;page_size?:string;sort?:string;direction?:'asc'|'desc'};
export type CatalogEvidenceResult={
  readState:'ok'|'empty'|'partial'|'unavailable';reason:null|string;
  evidence:{id:'account:courseCatalog';title:string;url:string;urls:string[];content:string};
};
export function isCatalogEvidenceQuestion(question:string,route?:string,history?:Array<{role:string;content:string}>):boolean;
/** Accepts the exact /12-3 syllabus-page URL contract and legacy /12-4 links.
 * Explicit URL and structured search selectors must agree. Exact-ID details
 * retain validated URL filters as navigation context, never as offering facts.
 * Captures read credentials, caller identity and selectors before awaiting.
 */
export function readCatalogEvidence(account:SyllabusAccount,input:{query?:CatalogEvidenceQuery;route?:string;question?:string;deadline:number},dependencies?:{search?:typeof loadSyllabusSearch;detail?:typeof loadSyllabusDetail}):Promise<CatalogEvidenceResult>;
