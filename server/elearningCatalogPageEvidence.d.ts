import type {AffairsAccount} from './affairsWorkspace.js';
export type ElearningCatalogPageSelection={
  path:string;
  categoryId:number|null;
  query:string;
  page:number;
  mode:'list'|'total-count'|'page-count'|'both';
};
export type ElearningCatalogPageEvidence =
  | {state:'sign_in'|'unavailable';selection:ElearningCatalogPageSelection}
  | {
    state:'ok'|'empty_page';emptyReason:'past_last_page'|'no_matching_courses'|null;
    selection:ElearningCatalogPageSelection;total:number;pageCount:number;listedCount:number;
    courses:Array<{title:string;url:string}>;
  };
export function selectElearningCatalogPage(question:unknown,route?:unknown):ElearningCatalogPageSelection|null;
export function readElearningCatalogPage(
  account:(AffairsAccount&{requestDeadline?:number})|null,
  options:{question:string;route?:string;deadline?:number}
):Promise<ElearningCatalogPageEvidence|null>;
