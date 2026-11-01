import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { calculateCampusRoute,resolvePlace } from "../../server/campusRouting.js";

const places=[
  {id:"p-a",site_id:"site",building_id:"building",floor_id:"floor",code:"ENT",name_zh:"正門",name_en:"Main Entrance",place_type:"entrance",room:null,status:"active",wheelchair_accessible:true,verified_at:"2026-07-19",official_source_id:"source"},
  {id:"p-b",site_id:"site",building_id:"building",floor_id:"floor",code:"REG",name_zh:"註冊組",name_en:"Registrar",place_type:"office",room:"101",status:"active",wheelchair_accessible:true,verified_at:"2026-07-19",official_source_id:"source"},
];
const aliases=[{place_id:"p-b",language:"en",alias:"Registration Office"}];
const nodes=[
  {id:"n-a",site_id:"site",building_id:"building",floor_id:"floor",place_id:"p-a",active:true,node_type:"entrance"},
  {id:"n-stairs",site_id:"site",building_id:"building",floor_id:"floor",place_id:null,active:true,node_type:"stairs"},
  {id:"n-ramp",site_id:"site",building_id:"building",floor_id:"floor",place_id:null,active:true,node_type:"ramp"},
  {id:"n-b",site_id:"site",building_id:"building",floor_id:"floor",place_id:"p-b",active:true,node_type:"destination"},
];
function edge(id:string,from:string,to:string,seconds:number,kind:string,wheelchair:boolean,bidirectional=true,status="active",verified_at:string|null="2026-07-19") { return {id,from_node_id:from,to_node_id:to,distance_m:seconds,estimated_seconds:seconds,bidirectional,environment:"indoor",traversal_type:kind,wheelchair_suitable:wheelchair,instruction_zh:`前往 ${id}`,instruction_en:`Take ${id}`,instruction_reverse_zh:`反向 ${id}`,instruction_reverse_en:`Reverse ${id}`,opens_at:null,closes_at:null,status,verified_at}; }

test("bilingual aliases resolve exact authoritative places and ambiguity is explicit",()=>{
  assert.equal(resolvePlace("Registration Office",places,aliases).place?.id,"p-b");
  assert.equal(resolvePlace("註冊組",places,aliases).place?.id,"p-b");
  assert.equal(resolvePlace("unknown",places,aliases).status,"not_found");
  const duplicate=[...places,{...places[1],id:"p-c",code:"REG2"}];
  assert.equal(resolvePlace("Registrar",duplicate,aliases).status,"ambiguous");
});

test("shortest routes are deterministic and directed connectors are never reversed",()=>{
  const edges=[edge("stairs","n-a","n-stairs",5,"stairs",false,false),edge("stairs-end","n-stairs","n-b",5,"stairs",false,false),edge("ramp","n-a","n-ramp",8,"ramp",true,false),edge("ramp-end","n-ramp","n-b",8,"walk",true,false)];
  const first=calculateCampusRoute({originPlaceId:"p-a",destinationPlaceId:"p-b",nodes,edges});
  const second=calculateCampusRoute({originPlaceId:"p-a",destinationPlaceId:"p-b",nodes,edges});
  assert.deepEqual(first,second); assert.deepEqual(first.steps.map((step)=>step.edgeId),["stairs","stairs-end"]);
  const reverse=calculateCampusRoute({originPlaceId:"p-b",destinationPlaceId:"p-a",nodes,edges});
  assert.equal(reverse.status,"unreachable");
});

test("accessible routing excludes stairs, unsuitable, closed, unverified, and out-of-hours edges",()=>{
  const edges=[edge("stairs","n-a","n-stairs",5,"stairs",false),edge("stairs-end","n-stairs","n-b",5,"stairs",false),edge("ramp","n-a","n-ramp",8,"ramp",true),edge("ramp-end","n-ramp","n-b",8,"walk",true),edge("closed","n-a","n-b",1,"walk",true,true,"temporarily_closed"),edge("unverified","n-a","n-b",1,"walk",true,true,"active",null)];
  const route=calculateCampusRoute({originPlaceId:"p-a",destinationPlaceId:"p-b",nodes,edges,wheelchair:true});
  assert.equal(route.status,"routed"); assert.deepEqual(route.steps.map((step)=>step.edgeId),["ramp","ramp-end"]); assert.ok(route.steps.every((step)=>step.wheelchairSuitable&&step.traversalType!=="stairs"));
  const timed={...edge("timed","n-a","n-b",1,"walk",true),opens_at:"08:00",closes_at:"09:00"};
  assert.equal(calculateCampusRoute({originPlaceId:"p-a",destinationPlaceId:"p-b",nodes,edges:[timed],clock:"10:00"}).status,"unreachable");
});

test("public campus UI and API expose verified directory, text directions, and honest validation state",()=>{
  const app=fs.readFileSync("src/App.tsx","utf8"); const api=fs.readFileSync("api/campus-route.ts","utf8"); const migration=fs.readFileSync("supabase/migrations/20260719074200_accessible_campus_route_directions.sql","utf8");
  for(const marker of ["校園導覽與無障礙路線","<ol>","campusRoute.steps","只使用無障礙路線","實地步行驗證完成前","官方來源","<Dialog open onOpenChange={setCampusOpen}>","<DialogContent","campusLaunchRef.current?.focus"] ) assert.ok(app.includes(marker),`missing UI marker ${marker}`);
  for(const marker of ["verified_at=not.is.null","status=eq.active","needs_selection","temporarily closed","physicalValidation","pending_official_walkthrough"]) assert.ok(api.includes(marker),`missing API marker ${marker}`);
  assert.match(migration,/instruction_reverse_zh[\s\S]*set not null/);
});

test("campus directory avoids graph overfetch and coalesces one-minute data reads",()=>{
  const api=fs.readFileSync("api/campus-route.ts","utf8");
  for(const marker of ["loadDirectory(url,key)","loadGraph(url,key)","expiresAt:now+60_000","request.method===\"GET\"?await loadDirectory(url,key):await loadGraph(url,key)"]) assert.ok(api.includes(marker),`missing performance boundary ${marker}`);
  assert.match(api,/function loadDirectory[\s\S]*campus_places[\s\S]*knowledge_sources/);
  assert.match(api,/function loadGraph[\s\S]*campus_place_aliases[\s\S]*campus_nodes[\s\S]*campus_edges/);
});
