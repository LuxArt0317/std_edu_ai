export type AccountStatusIntent='state'|'email'|'displayName'|'identity';
export function accountStatusIntent(question:unknown,route?:unknown):AccountStatusIntent|null;
