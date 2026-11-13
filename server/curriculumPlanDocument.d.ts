type DocumentRequest = {method?:string;query?:Record<string,string|string[]|undefined>};
type DocumentResponse = {
  status:(code:number)=>DocumentResponse;
  json:(body:unknown)=>void;
  setHeader:(name:string,value:string)=>void;
  end?:(data:Buffer)=>void;
};
export function serveCurriculumPlan(request:DocumentRequest,response:DocumentResponse,fetchPlan?:typeof fetch):Promise<void>;
