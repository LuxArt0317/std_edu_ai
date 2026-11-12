export const actionPlanSchema:Record<string,any>;
export const actionInstructions:string;
export function prepareAccountAction(plan:Record<string,any>|undefined,question:string,snapshot:Record<string,any>):{action?:{kind:string;label:string;payload:Record<string,string>;requestId:string;url:string};clarification?:string};
