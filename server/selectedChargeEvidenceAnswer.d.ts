import type {VerificationEvidence} from './answerVerification.js';
import type {SupplementalAnswerCandidate} from './supplementalAccountAnswers.js';
export const selectedChargeAnswerLimits:Readonly<{sourceBytes:70000;answerCharacters:8000;resultBytes:24000;viewRows:12}>;
/** Pure formatting of one bounded account:charges source. No reads, writes,
 * authorization, record selection or model calls. Use the same evidence for
 * independent review; an answered limitation is not a verification verdict.
 * Complete means the successful selected local scope fits this display, never
 * institutional completeness. Numeric aggregates retain exact currency groups.
 * Malformed/inconsistent evidence throws TypeError; impossible budgets throw
 * RangeError. Stored identity, dates, contacts and row IDs are never projected. */
export function formatSelectedChargeEvidence(evidence:VerificationEvidence,options?:{language?:'en'|'zh-TW';includeAuthorityLimit?:boolean;exactBalance?:boolean}):SupplementalAnswerCandidate;
