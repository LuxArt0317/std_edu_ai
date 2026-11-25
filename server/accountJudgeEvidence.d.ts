import type {AffairsAccount} from './affairsWorkspace.js';
import type {VerificationEvidence} from './answerVerification.js';
export const accountJudgeMethodVersion:'account-source-context-v1';
export function resolveAccountJudgeEvidence(account:AffairsAccount|null,run:Record<string,any>,caseSnapshot:Record<string,any>|null,options?:{deadline?:number;loadCharges?:typeof import('./affairsWorkspace.js').loadOwnAffairsCharges;loadLeaves?:typeof import('./accountStudentLeaveEvidence.js').readStudentLeaveEvidence}):Promise<{evidence:VerificationEvidence[];summary:Record<string,any>}>;
export function accountJudgeCaseSnapshot(state:Record<string,any>,run:Record<string,any>):Record<string,any>|null;
