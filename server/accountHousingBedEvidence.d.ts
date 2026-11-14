import type {VerificationEvidence} from './answerVerification.js';
export const housingBedEvidencePath:'/school-affairs/services/34-1';
export const housingBedEvidenceLimits:Readonly<{rows:200;periodBatch:20;readBytes:131072;responseBytes:16384;deadlineMs:8000}>;
export type HousingBedField='academicYear'|'semester'|'bedNumber'|'dormitory'|'bunk'|'accommodationFee'|'deposit'|'subsidyAmount';
export type HousingBedTerm={academicYear:number|null;semester:1|2|null};
export type HousingBedEvidenceAccount={url:string;key:string;token:string;user:{id:string};requestDeadline?:number};
export type HousingBedEvidenceOptions={fields?:HousingBedField[];term?:HousingBedTerm|null;deadline?:number};
export type HousingBedEvidenceRecord={academicYear:number|null;semester:1|2|null;bedNumber:string;dormitory?:string;bunk?:'upper'|'lower'|null;accommodationFee?:number|null;deposit?:number|null;subsidyAmount?:number|null};
export type HousingBedEvidencePayload={collection:'housingBed';checkedAt:string;selection:{fields:HousingBedField[];term:HousingBedTerm|null}|null;
  readState:'ok'|'empty'|'partial'|'unavailable';reason:string|null;complete:boolean;excerpted:boolean;
  counts:{available:number|null;returned:number|null;matching:number|null;included:number;omitted:number|null;unread:number|null;unresolvedPeriods:number|null};
  records:HousingBedEvidenceRecord[];provenance:{sourceMode:'local_demo';officialUniversityData:false;synchronized:false};
  capability:{bedMetadata:true;currentResidence:false;payment:false;currency:false;applications:false;documents:false;write:false};rules:string};
export type HousingBedEvidenceResult={readState:HousingBedEvidencePayload['readState'];reason:string|null;evidence:VerificationEvidence&{id:'account:housing';provenance:'local_demo'}};
export function unavailableHousingBedEvidence(reason:string):HousingBedEvidenceResult;
/** Caller must already be authenticated by the API. No question/owner selector
 * is accepted here. Anchors academicYear, semester and bedNumber are mandatory;
 * default extra fields are dormitory and bunk. Money is fetched only on opt-in.
 * Each call performs one bounded own-assignment read pass and reads only its
 * referenced periods. Hidden/missing parent metadata yields partial evidence;
 * assignment read failure never means absence. The graph owns retries.
 */
export function readHousingBedEvidence(account:HousingBedEvidenceAccount,options?:HousingBedEvidenceOptions,
  dependencies?:{fetchImpl?:typeof fetch}):Promise<HousingBedEvidenceResult>;
