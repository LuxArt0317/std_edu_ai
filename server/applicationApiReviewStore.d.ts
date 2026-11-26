export function signApiReview(record:any):any;
export function validApiReview(record:any):boolean;
export function signApiReceipt(userId:string,requestId:string,receipt:any):any;
export function verifiedApiReceipt(userId:string,requestId:string,signed:any):any;
export function apiReviewRpc(account:any,name:string,payload:any,deadline?:number):Promise<any>;
