export type ApplicationApiRoute={slug:string;aliasOf?:string;fixedQuery?:Record<string,string>;path:string;description:string;methods:string[];readMethods:string[];disabledReason:string|null;sourceHash:string;queryFields:string[];scopeHints:string[];kindHints?:string[];querySchema:Record<string,any>;bodySchema:Record<string,any>};
export const applicationApiCatalog:ApplicationApiRoute[];
export function loadApplicationApiHandler(slug:string):Promise<(request:any,response:any)=>Promise<void>>;
