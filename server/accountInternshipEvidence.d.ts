import type {InternshipHistory} from './internshipEvidenceIntent.js';
import type {InternshipEvidenceResult} from './internshipEvidenceContract.js';
export {internshipEvidenceMaxBytes,unavailableInternshipEvidence} from './internshipEvidenceContract.js';
export type InternshipEvidenceAccount={url:string;key:string;token:string;user:{id:string};requestDeadline?:number};
export type InternshipEvidenceOptions={question?:unknown;route?:string;history?:InternshipHistory;deadline?:number};
export function readInternshipEvidence(account:InternshipEvidenceAccount,options?:InternshipEvidenceOptions,
  dependencies?:{fetchImpl?:typeof fetch;observeRead?:(read:unknown)=>void}):Promise<InternshipEvidenceResult>;
