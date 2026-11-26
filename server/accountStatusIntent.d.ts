export type AccountStatusIntent='state'|'email'|'displayName'|'identity';
export function accountStatusIntent(question:unknown,route?:unknown):AccountStatusIntent|null;
export function accountStatusContextQuestion(question:string,history?:Array<{role:string;content:string}>):string|null;
