import type {AffairsAccount} from './affairsWorkspace.js';
import type {ProgramRegistration,ProgramRegistrationAction,parseProgramRegistrationReceipt} from './programRegistrationContract.js';
type Account = AffairsAccount & {requestDeadline?:number};
export function loadProgramRegistrations(account:Account):Promise<ProgramRegistration[]>;
export function changeProgramRegistration(account:Account,payload:unknown):Promise<ReturnType<typeof parseProgramRegistrationReceipt>>;
export function answerProgramRegistrations(account:Account,lang:'en'|'zh'):Promise<Record<string,unknown>>;
export type {ProgramRegistrationAction};
