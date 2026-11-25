export type ClientDispatchCase = {
  id:string;
  domain:string;
  route:string;
  question:string;
  mode:'record'|'multipart'|'empty'|'foreign'|'read-failure';
  expected:{requiredLinks:string[]};
};

export function discoverClientDispatchSurfaces(options?:{read?:(path:string)=>Promise<string>}):Promise<{questions:ClientDispatchCase[]}>;
