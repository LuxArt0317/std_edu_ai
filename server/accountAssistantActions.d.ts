export function prepareAccountAction(question:string,snapshot:Record<string,any>,options?:{requestId?:string}):{
  action?:{kind:string;label:string;payload:Record<string,string>;requestId:string;url:string};clarification?:string;
};
