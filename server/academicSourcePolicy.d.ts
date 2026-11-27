export function academicSourceRecords<T>(value:T,key?:string,depth?:number):T;
export function academicSourceViews<T extends {id:string;columns:string[];rows:string[][];total:number}>(views?:T[]):T[];
