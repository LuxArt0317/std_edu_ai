export type HousingApplicationTerm={academicYear:number|null;semester:1|2|null};
export type HousingApplicationAccount={url:string;key:string;token:string;user:{id:string};requestDeadline?:number};
export type HousingApplicationEvidenceResult={readState:'ok'|'empty'|'partial'|'unavailable';reason:string|null;evidence:{id:'account:housingApplications';title:string;url:string;urls:string[];provenance:'local_demo';content:string}};
export const housingApplicationEvidencePath:'/school-affairs/services/26-1';
export const housingApplicationEvidenceLimits:Readonly<{rows:200;periodBatch:20;readBytes:131072;responseBytes:16384;deadlineMs:8000}>;
export function unavailableHousingApplicationEvidence(reason:unknown):HousingApplicationEvidenceResult;
export function readHousingApplicationEvidence(account:HousingApplicationAccount,options?:{term?:HousingApplicationTerm|null;deadline?:number},dependencies?:{fetchImpl?:typeof fetch}):Promise<HousingApplicationEvidenceResult>;
