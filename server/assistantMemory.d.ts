export function memoryEntry(question:string,result:any):any;
export function openAssistantMemory(account:any,options?:{disabled?:boolean;fetcher?:typeof fetch}):Promise<null|{count:number;clear:()=>Promise<any>;context:(question:string,history:Array<{role:string;content:string}>)=>Array<{role:string;content:string}>;remember:(question:string,result:any)=>Promise<void>}>;
