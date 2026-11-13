import type {AffairsAccount} from './affairsWorkspace.js';

export type DtmDashboardLayoutBlock={id:'important'|'navigation'|'contacts';visible:boolean;region:'side-pre'|'side-post'|'content';weight:number};
export type DtmDashboardLayoutSnapshot={version:number;blocks:DtmDashboardLayoutBlock[];updatedAt:string|null};
export type DtmDashboardLayoutKind='save_dtm_dashboard_layout'|'reset_dtm_dashboard_layout';
export type DtmDashboardLayoutPayload={request_id:string;expected_version:number;blocks?:DtmDashboardLayoutBlock[]};
export type DtmDashboardLayoutAction=
  |{kind:'save_dtm_dashboard_layout';payload:{request_id:string;expected_version:number;blocks:DtmDashboardLayoutBlock[]}}
  |{kind:'reset_dtm_dashboard_layout';payload:{request_id:string;expected_version:number}};
export type DtmDashboardLayoutAccount=AffairsAccount & {requestDeadline?:number};
export const dtmDashboardLayoutKinds:readonly DtmDashboardLayoutKind[];
export const dtmDashboardLayoutMaxPayloadBytes:2048;
export const dtmDashboardLayoutReadSource:Readonly<{table:string;select:string;order:string}>;
export class DtmDashboardLayoutError extends Error{status:number;constructor(message:string,status?:number);}
/** Fresh canonical defaults; not evidence that a read succeeded. */
export function dtmDashboardLayoutDefaults():DtmDashboardLayoutSnapshot;
export function dtmDashboardLayoutPayloadBytes(value:unknown):number;
export function validateDtmDashboardLayoutPayload(kind:unknown,value:unknown):string|null;
export function parseDtmDashboardLayout(value:unknown):DtmDashboardLayoutSnapshot;
export function loadDtmDashboardLayout(account:DtmDashboardLayoutAccount):Promise<DtmDashboardLayoutSnapshot>;
export function executeDtmDashboardLayoutAction(account:DtmDashboardLayoutAccount,kind:DtmDashboardLayoutKind,value:unknown):Promise<DtmDashboardLayoutSnapshot>;
