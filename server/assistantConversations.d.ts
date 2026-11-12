type Request={method?:string;headers:Record<string,string|string[]|undefined>;body?:unknown;query?:Record<string,string|string[]|undefined>};
type Response={status:(code:number)=>Response;json:(body:unknown)=>void;setHeader:(name:string,value:string)=>void};
export default function handler(req:Request,res:Response):Promise<void>;
