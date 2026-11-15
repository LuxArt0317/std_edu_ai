import type {AffairsAccount} from './affairsWorkspace.js';
import type {ElearningCatalogPageSelection} from './elearningCatalogPageIntent.js';
export {selectElearningCatalogPage} from './elearningCatalogPageIntent.js';
export type ElearningCatalogPageEvidence =
  | {state:'sign_in'|'unavailable';selection:ElearningCatalogPageSelection}
  | {
    state:'ok'|'empty_page';emptyReason:'past_last_page'|'no_matching_courses'|null;
    selection:ElearningCatalogPageSelection;total:number;pageCount:number;listedCount:number;
    courses:Array<{title:string;url:string}>;
  };
export function readElearningCatalogPage(
  account:(AffairsAccount&{requestDeadline?:number})|null,
  options:{question:string;route?:string;deadline?:number}
):Promise<ElearningCatalogPageEvidence|null>;
