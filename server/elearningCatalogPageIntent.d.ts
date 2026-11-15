export type ElearningCatalogPageRoute={
  path:string;
  categoryId:number|null;
  query:string;
  page:number;
};
export type ElearningCatalogPageSelection=ElearningCatalogPageRoute&{mode:'list'|'total-count'|'page-count'|'both'};
export function selectElearningCatalogPage(question:unknown,route?:unknown):ElearningCatalogPageSelection|null;
export function elearningCatalogPageRoute(route:unknown):ElearningCatalogPageRoute|null;
export function elearningCatalogGuestRoute(route:unknown):string;
export function isElearningCatalogPageQuestion(question:unknown,route?:unknown):boolean;
