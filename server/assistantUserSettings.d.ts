export function withUserAssistantSettings<T extends (...args:any[])=>any>(handler:T,options?:{catalog?:()=>Promise<unknown>;validate?:(model:string)=>Promise<unknown>}):T;
