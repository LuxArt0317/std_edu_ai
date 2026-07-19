import {calculateCampusRoute, resolvePlace, type CampusAlias, type CampusEdge, type CampusNode, type CampusPlace} from "../server/campusRouting.js";
import {operationalCorrelation,recordResearchOperation,safeOperationalCode} from "../server/researchOperations.js";

type ApiRequest={method?:string;body?:unknown};
type ApiResponse={status:(code:number)=>ApiResponse;json:(body:unknown)=>void;setHeader:(name:string,value:string)=>void};
type PlaceRecord=CampusPlace&{description_zh:string;description_en:string;contact_phone:string|null;contact_email:string|null;closure_reason:string|null};
type DirectoryData={sites:Array<Record<string,unknown>>;buildings:Array<Record<string,unknown>>;floors:Array<Record<string,unknown>>;places:PlaceRecord[];sources:Array<Record<string,unknown>>};
type GraphData=DirectoryData&{aliases:CampusAlias[];nodes:CampusNode[];edges:CampusEdge[]};
type TimedCache<T>={expiresAt:number;value:Promise<T>}|null;
let directoryCache:TimedCache<DirectoryData>=null;let graphCache:TimedCache<GraphData>=null;

export const config={maxDuration:30};
function headers(request:ApiRequest,response:ApiResponse){response.setHeader("Cache-Control",request.method==="GET"?"public, max-age=60, stale-while-revalidate=300":"no-store, max-age=0");response.setHeader("Content-Type","application/json; charset=utf-8");response.setHeader("X-Content-Type-Options","nosniff");}
async function rest(url:string,key:string,path:string){const result=await fetch(`${url.replace(/\/$/,"")}/rest/v1/${path}`,{headers:{apikey:key,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(10_000)});if(!result.ok)throw new Error(`Campus data unavailable (${result.status}).`);return result.json();}
function cached<T>(current:TimedCache<T>,load:()=>Promise<T>,assign:(value:TimedCache<T>)=>void){const now=Date.now();if(current&&current.expiresAt>now)return current.value;const value=load().catch((error)=>{assign(null);throw error});assign({expiresAt:now+60_000,value});return value;}
function loadDirectory(url:string,key:string){return cached(directoryCache,async()=>{const[sites,buildings,floors,places,sources]=await Promise.all([
  rest(url,key,"campus_sites?select=id,code,name_zh,name_en,verified_at&active=eq.true&verified_at=not.is.null"),
  rest(url,key,"campus_buildings?select=id,site_id,code,name_zh,name_en,verified_at&active=eq.true&verified_at=not.is.null"),
  rest(url,key,"campus_floors?select=id,building_id,level,label_zh,label_en"),
  rest(url,key,"campus_places?select=id,site_id,building_id,floor_id,code,name_zh,name_en,place_type,room,wheelchair_accessible,contact_phone,contact_email,description_zh,description_en,official_source_id,verified_at,status,closure_reason&status=neq.inactive&verified_at=not.is.null&order=name_en.asc&limit=500"),
  rest(url,key,"knowledge_sources?select=id,name,canonical_url,authority_level&active=eq.true&default_audience_scope=eq.public&limit=500"),
]);return{sites,buildings,floors,places,sources} as DirectoryData},value=>{directoryCache=value});}
function loadGraph(url:string,key:string){return cached(graphCache,async()=>{const[directory,aliases,nodes,edges]=await Promise.all([loadDirectory(url,key),rest(url,key,"campus_place_aliases?select=place_id,language,alias&limit=2000"),rest(url,key,"campus_nodes?select=id,site_id,building_id,floor_id,place_id,node_type,active&active=eq.true&limit=5000"),rest(url,key,"campus_edges?select=id,from_node_id,to_node_id,distance_m,estimated_seconds,bidirectional,environment,traversal_type,wheelchair_suitable,instruction_zh,instruction_en,instruction_reverse_zh,instruction_reverse_en,opens_at,closes_at,status,verified_at&status=eq.active&verified_at=not.is.null&limit=10000")]);return{...directory,aliases,nodes,edges} as GraphData},value=>{graphCache=value});}
function parse(body:unknown){let value=body;if(typeof body==="string"){try{value=JSON.parse(body);}catch{return null;}}if(!value||typeof value!=="object"||Array.isArray(value))return null;const item=value as Record<string,unknown>;const origin=typeof item.origin==="string"?item.origin.trim():"";const destination=typeof item.destination==="string"?item.destination.trim():"";if(origin.length<1||origin.length>160||destination.length<1||destination.length>160)return null;return{origin,destination,wheelchair:item.wheelchair===true,language:item.language==="en"?"en":"zh-Hant" as "en"|"zh-Hant"};}
function taipeiClock(){return new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date());}

export default async function handler(request:ApiRequest,response:ApiResponse){
  headers(request,response);
  if(!["GET","POST"].includes(request.method||"")){response.setHeader("Allow","GET, POST");response.status(405).json({error:"Method not allowed"});return;}
  const url=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL;const key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key){response.status(503).json({error:"Campus navigation is not configured."});return;}
  const started=Date.now();let correlationHash=operationalCorrelation(request.method||"unknown");
  const finish=async(status:number,payload:unknown,outcome:"success"|"failure"|"degraded"|"denied",errorCode:string|null,itemCount:number|null=null)=>{await recordResearchOperation({url,key,component:"campus_route",operation:"route",outcome,errorCode,httpStatus:status,latencyMs:Date.now()-started,itemCount,correlationHash,metadata:{result_count:itemCount,fallback_used:outcome!=="success"}});response.status(status).json(payload);};
  try{
    const data=request.method==="GET"?await loadDirectory(url,key):await loadGraph(url,key);const{sites,buildings,floors,places,sources}=data;
    const eligibleSites=new Set(sites.map((item)=>item.id));const eligibleBuildings=new Set(buildings.filter((item)=>eligibleSites.has(item.site_id)).map((item)=>item.id));
    const eligiblePlaces=places.filter((place)=>eligibleSites.has(place.site_id)&&(!place.building_id||eligibleBuildings.has(place.building_id)));
    const publicPlaces=eligiblePlaces.map((place)=>({...place,building:buildings.find((item)=>item.id===place.building_id)||null,floor:floors.find((item)=>item.id===place.floor_id)||null,source:sources.find((item)=>item.id===place.official_source_id)||null}));
    if(request.method==="GET"){await finish(200,{places:publicPlaces,verifiedOnly:true,physicalValidation:"pending_official_walkthrough"},"success",null,publicPlaces.length);return;}
    const{aliases,nodes,edges}=data as GraphData;
    const input=parse(request.body);if(!input){await finish(400,{error:"Select a valid origin and destination."},"denied","INVALID_ROUTE_INPUT");return;}
    correlationHash=operationalCorrelation(`${input.origin}:${input.destination}:${input.wheelchair}`);
    const origin=resolvePlace(input.origin,eligiblePlaces,aliases);const destination=resolvePlace(input.destination,eligiblePlaces,aliases);
    if(origin.status!=="resolved"||destination.status!=="resolved"){await finish(409,{status:"needs_selection",origin:{status:origin.status,matches:origin.matches.slice(0,8)},destination:{status:destination.status,matches:destination.matches.slice(0,8)}},"degraded","ROUTE_NEEDS_SELECTION");return;}
    if(origin.place!.status!=="active"||destination.place!.status!=="active"){await finish(409,{status:"closed",error:"The selected place is temporarily closed.",origin:origin.place,destination:destination.place},"degraded","ROUTE_PLACE_CLOSED");return;}
    const eligibleNodeIds=new Set(nodes.filter((node)=>eligibleSites.has(node.site_id)&&(!node.building_id||eligibleBuildings.has(node.building_id))).map((node)=>node.id));
    const route=calculateCampusRoute({originPlaceId:origin.place!.id,destinationPlaceId:destination.place!.id,nodes:nodes.filter((node)=>eligibleNodeIds.has(node.id)),edges:edges.filter((edge)=>eligibleNodeIds.has(edge.from_node_id)&&eligibleNodeIds.has(edge.to_node_id)),wheelchair:input.wheelchair,clock:taipeiClock()});
    const status=route.status==="routed"||route.status==="same_place"?200:409;
    await finish(status,{origin:publicPlaces.find((place)=>place.id===origin.place!.id),destination:publicPlaces.find((place)=>place.id===destination.place!.id),wheelchair:input.wheelchair,language:input.language,...route,disclaimer:"Routes use verified digital records. Follow posted signs and accessibility notices; physical walkthrough validation is pending."},status===200?"success":"degraded",status===200?null:"ROUTE_UNAVAILABLE",route.steps?.length??0);
  }catch(error){await finish(503,{error:error instanceof Error?error.message:"Campus navigation is temporarily unavailable."},"failure",safeOperationalCode(error instanceof Error?error.message:"CAMPUS_ROUTE_FAILURE"));}
}
