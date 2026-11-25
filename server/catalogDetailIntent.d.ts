export type CatalogDetailRoute={id:string;syllabus:boolean;path:string};
export type CatalogDetailSelection=CatalogDetailRoute&{fields:string[];gradingRow:number|null;enrollment:boolean};
export function catalogDetailRoute(value:unknown):CatalogDetailRoute|null;
export function catalogDetailGuestRoute(value:unknown):string;
export function catalogDetailIntent(question:unknown,route:unknown):CatalogDetailSelection|null;
