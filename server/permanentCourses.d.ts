export function servePermanentCourses(request: {method?:string;query?:Record<string,string|string[]|undefined>},
  response:{status:(status:number)=>{json:(data:unknown)=>void};setHeader:(name:string,value:string)=>void}):Promise<void>;
