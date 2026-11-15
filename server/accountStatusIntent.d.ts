export type AccountStatusIntent='state'|'email'|'displayName';
export function accountStatusIntent(question:unknown,route?:unknown):AccountStatusIntent|null;
