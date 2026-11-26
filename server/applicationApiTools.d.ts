import type {AffairsAccount} from './affairsWorkspace.js';
export class ApplicationApiToolError extends Error{status:number;constructor(message:string,status?:number);}
export function requireApiToolCaller(account:unknown):AffairsAccount;
export function applicationApiOperations(catalog?:any[]):any[];
export function searchApplicationApis(query?:string,options?:any):any[];
export function describeApplicationApi(id:string,options?:any):any;
export function validateApplicationApiCall(input:unknown,options?:any):any;
export function redactApiToolValue(value:unknown,account?:any,budget?:number):any;
export function invokeApplicationApi(account:AffairsAccount|null,input:unknown,options?:any):Promise<any>;
export function proposeApplicationApiAction(account:AffairsAccount,input:unknown,options?:any):Promise<any>;
export function confirmApplicationApiAction(account:AffairsAccount,input:{requestId:string;confirmationToken:string},options?:any):Promise<any>;
