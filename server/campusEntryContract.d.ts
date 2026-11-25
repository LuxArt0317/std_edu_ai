import type {VerificationCandidate} from './answerVerification.js';
export type CampusEntrySelection={path:string;kind:string;topic:string;returnTo?:string};
export function privateCampusTransitionPath(route:unknown):string|null;
export function campusEntryIntent(question:unknown,route:unknown):CampusEntrySelection|null;
export function answerCampusEntry(question:string,selection:CampusEntrySelection,signedIn:boolean):VerificationCandidate;
