import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadPreferences,savePreferences,defaultPreferences} from "../../src/features/public/affairs/preferences";
test("public chat cannot import Nexus auth while knowledge QA explicitly requires it", () => {
  const service = readFileSync("src/services/researchAssistant.ts", "utf8");
  const publicPart = service.slice(
    service.indexOf("export async function askCampusAssistant"),
    service.indexOf("export async function askKnowledgeAnswer"),
  );
  assert.doesNotMatch(
    publicPart,
    /getSession|school-assistant|Authorization|utils\/supabase/,
  );
  assert.match(publicPart, /research-assistant/);
  const manager = service.slice(
    service.indexOf("export async function askKnowledgeAnswer"),
  );
  assert.match(manager, /knowledge-manager/);
  assert.match(manager, /getSession/);
  const publicUi = readFileSync(
    "src/features/public/PublicAssistant.tsx",
    "utf8",
  );
  assert.doesNotMatch(publicUi, /onAuthStateChange|utils\/supabase/);
  assert.match(publicUi, /school-affairs\/login/);
});

test("School Affairs account preferences cannot bleed across identities or inherit demo settings",()=>{
 const values = new Map<string,string>();
 const previous=Object.getOwnPropertyDescriptor(globalThis,"localStorage");
 Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>values.set(key,value)}});
 try {
   savePreferences({...defaultPreferences,theme:"pink"});
   savePreferences({...defaultPreferences,theme:"dark"},"account-a");
   assert.equal(loadPreferences("account-a").value.theme,"dark");
   assert.equal(loadPreferences("account-b").value.theme,"blue");
   assert.equal(loadPreferences().value.theme,"pink");
 }finally{if(previous)Object.defineProperty(globalThis,"localStorage",previous);else delete (globalThis as any).localStorage;}
});

test("School Affairs assistant uses its own JWT and read-only mode, never Nexus storage",()=>{
 const service=readFileSync("src/services/schoolAffairsAssistant.ts","utf8");
 assert.match(service,/affairsClient.auth.getSession/);assert.match(service,/mode:'qa'/);
 assert.doesNotMatch(service,/utils\/supabase|stu-nexus-auth/);
 const shell=readFileSync("src/features/public/PublicSite.tsx","utf8");assert.match(shell,/key=\{user\?\.id \|\| "anonymous"\}/);
});

test("normal Nexus sign-out also leaves independently authenticated School Affairs sessions active",()=>{
 const source=readFileSync("src/features/crm/authService.ts","utf8");
 const logout=source.slice(source.indexOf("export async function signOutCrm"),source.indexOf("export function canUseCrm"));
 assert.match(logout,/signOut\(\{ scope: 'local' \}\)/);
});
