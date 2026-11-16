type VenueProbeScope={ownerId:string;runId:string;origin:string;sourceRevision:string;nonce:string};
type VenueProbeRequest={question:string;route:string;history:Array<{role:string;content:string}>;stream:boolean;consentedResearchUse:false};
type VenueProbeBinding=VenueProbeScope&{issuedAt:number;requestDigest:string};
type VenueReadProof={readDigest:string;evidenceDigest:string};
export type VenueObservation={record(readback:{ownerId:string},evidence:unknown):void;nativeVerified():void;finish(body:unknown,expectsRead:boolean):string|null};
export const venueObservationHeader:'X-Venue-Observation';
export const venueBrowserObservationEvent:'evaluation-venue-observation';
export function createVenueProbe(scope:VenueProbeScope,request:VenueProbeRequest,key:string,now?:number):{
  binding:VenueProbeBinding;body:VenueProbeRequest&{evaluationVenueProbe:string};
};
export function openVenueObservation(input:{body:unknown;identity?:{id:string;email?:string;runMarker?:unknown};
  correlationId:string},env?:Record<string,string|undefined>,now?:number):VenueObservation|null;
export function verifyVenueObservation(input:{receipt:string|null;binding:VenueProbeBinding;correlationId:string|null;body:unknown},key:string):{
  binding:VenueProbeBinding;correlationId:string;read:VenueReadProof|null;verificationMethod:'native-exact'|'none';responseDigest:string;
}|null;
