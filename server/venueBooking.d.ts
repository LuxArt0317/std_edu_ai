import type {AffairsAccount} from './affairsWorkspace.js';
type Query=Record<string,string|string[]|undefined>;
export const venueActions:string[];
export function serveVenue(request:{method?:string;query?:Query},response:{status:(status:number)=>{json:(data:unknown)=>void};setHeader:(name:string,value:string)=>void}):Promise<void>;
export function readVenueRequests(account:AffairsAccount,query:Query):Promise<unknown>;
export function changeVenueRequest(account:AffairsAccount,action:string,payload:unknown):Promise<unknown>;
