export type ClubAttendanceBrowserMode='record'|'multipart'|'empty'|'foreign'|'read-failure';
export type ClubAttendanceObservationScope={ownerId:string;runId:string;origin:string;sourceRevision:string;nonce:string;mode:ClubAttendanceBrowserMode};
export type ClubAttendanceBrowserObservation={
  record(tool:'clubAttendance'|'charges',attempt:number,rawReads:unknown[],success:boolean):void;
  verified(attempt:number):void;
  finish(result:unknown):string|null;
};
export const clubAttendanceBrowserObservationEvent:'evaluation-club-attendance';
export function createClubAttendanceBrowserProbe(scope:ClubAttendanceObservationScope,request:unknown,key:string,now?:number):{
  binding:ClubAttendanceObservationScope&{issuedAt:number;requestDigest:string};body:Record<string,unknown>;
};
export function openClubAttendanceBrowserObservation(options:{body:unknown;identity?:{id:string;email?:string;runMarker:unknown};correlationId:string},
  env?:NodeJS.ProcessEnv,now?:number):ClubAttendanceBrowserObservation|null;
export function verifyClubAttendanceBrowserObservation(options:{receipt:unknown;binding:unknown;correlationId:unknown;body:unknown},key:string):{
  correlationId:string;reads:unknown[];checked:number[];responseDigest:string;
}|null;
