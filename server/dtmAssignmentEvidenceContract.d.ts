import type {DtmAssignmentEvidenceResult} from './accountDtmAssignmentEvidence.js';
import type {DtmAssignmentSelection} from './dtmAssignmentEvidenceIntent.js';
export const dtmAssignmentEvidenceMaxBytes:12000;
export function dtmAssignmentEnvelope(state:DtmAssignmentEvidenceResult['readState'],reason:string|null,selection:DtmAssignmentSelection|null,details?:Record<string,unknown>):DtmAssignmentEvidenceResult;
export function unavailableDtmAssignmentEvidence(reason:string):DtmAssignmentEvidenceResult;
export function parseDtmAssignmentEvidence(result:unknown):Record<string,any>|null;
