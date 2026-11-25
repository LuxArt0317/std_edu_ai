export type ElearningMetadataRoute={path:string;view:'categories'|'category'|'notice';id:number|null};
export type ElearningMetadataSelection=ElearningMetadataRoute&{mode:'category-index'|'category-title'|'category-children'|'notice-summary'|'notice-deadline'|'notice-transition';label:string|null};
export function elearningMetadataRoute(route:unknown):ElearningMetadataRoute|null;
export function selectElearningMetadata(question:unknown,route:unknown):ElearningMetadataSelection|null;
export function isElearningMetadataQuestion(question:unknown,route:unknown):boolean;
export function elearningMetadataGuestRoute(route:unknown):string;
