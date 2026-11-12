export type ResearchComponent="public_shell"|"retrieval"|"model"|"citation"|"campus_route"|"study"|"ingestion"|"evaluation";
export type ResearchOutcome="success"|"failure"|"degraded"|"denied";
export function operationalCorrelation(value:unknown,salt?:string):string;
export function safeOperationalCode(value:unknown,fallback?:string):string;
export function safeOperationalMetadata(value?:unknown):Record<string,number|boolean|null>;
export function recordResearchOperation(input:{deadline?:number;url?:string;key?:string;component:ResearchComponent;operation:string;outcome:ResearchOutcome;errorCode?:string|null;httpStatus?:number|null;latencyMs:number;itemCount?:number|null;correlationHash:string;metadata?:Record<string,unknown>}):Promise<boolean>;
