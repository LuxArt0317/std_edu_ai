export type ProviderFailure={retryable:boolean;failureClass:"network"|"timeout"|"rate_limit"|"provider_5xx"|"provider_4xx";failureCode:string};
export function classifyProviderFailure(status:number|undefined,error?:{name?:string}):ProviderFailure;
export function retryDelayMs(attempt:number,random?:()=>number):number;
export function estimatedEmbeddingCost(tokens:number,ratePerMillion:number):number;
export function safeTelemetryCode(value:unknown,fallback?:string):string;
