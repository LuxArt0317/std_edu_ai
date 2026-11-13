type Request = {method?:string;query?:Record<string,string|string[]|undefined>};
type Response = {status:(code:number)=>Response;json:(body:unknown)=>void;setHeader:(name:string,value:string)=>void};
export function serveCurriculumMap(request:Request,response:Response,fetchMap?:typeof fetch):Promise<void>;
