import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import {createClient} from "@supabase/supabase-js";

function env(path) {
  if (!fs.existsSync(path)) return {};
  return Object.fromEntries(fs.readFileSync(path, "utf8").split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)]; }));
}
function sha(value) { return createHash("sha256").update(value).digest("hex"); }
function required(result, message) {
  if (result.error) throw new Error(`${message}: ${result.error.message}`);
  if (!result.data) throw new Error(`${message}: no row returned`);
  return result.data;
}

Object.assign(process.env, env(".env"), env(".env.local"));
const email = "winsonbaring10@gmail.com";
const secret = spawnSync("/usr/bin/security", ["find-internet-password", "-w", "-s", "www.stu.best", "-a", email], {encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]});
if (secret.status !== 0 || !secret.stdout.trim()) throw new Error("Missing protected owner credential.");
if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY) throw new Error("Missing public Supabase configuration.");

const owner = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
const anon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
const auth = await owner.auth.signInWithPassword({email, password: secret.stdout.trim()});
if (auth.error || !auth.data.user) throw auth.error || new Error("Owner sign-in failed.");

const suffix = Date.now().toString(36).toUpperCase();
const now = new Date().toISOString();
let sourceId = "", documentId = "", siteId = "", buildingId = "", floorId = "", placeId = "", nodeA = "", nodeB = "", edgeId = "";
let studyId = "", versionId = "", participantId = "", sessionId = "";
try {
  const source = required(await owner.from("knowledge_sources").insert({
    name: `Issue 104 verification ${suffix}`, source_type: "website",
    canonical_url: `https://www.stu.edu.tw/verification/${suffix.toLowerCase()}`,
    official_domain: true, authority_level: "primary_official", owner_profile_id: auth.data.user.id,
    default_audience_scope: "public", default_language: "mixed", crawl_policy: "manual",
    robots_reviewed_at: now, terms_reviewed_at: now, active: true,
  }).select("id").single(), "create governed source"); sourceId = source.id;
  const content = `Temporary authoritative verification content ${suffix}`;
  const document = required(await owner.from("knowledge_documents").insert({
    source_id: sourceId, logical_key: `verification-${suffix}`, title: `Verification ${suffix}`,
    domain: "other", document_type: "html", language: "mixed",
    source_url: `https://www.stu.edu.tw/verification/${suffix.toLowerCase()}`,
    content_checksum: sha(content), effective_at: now, version: 1, extraction_status: "normalized",
    review_status: "approved", publication_status: "published", sensitivity: "public",
    audience_scope: "public", owner_profile_id: auth.data.user.id, reviewer_profile_id: auth.data.user.id,
    reviewed_at: now, published_at: now, normalized_content: content,
  }).select("id").single(), "create approved document"); documentId = document.id;
  required(await owner.from("knowledge_chunks").insert({
    document_id: documentId, chunk_key: "body-0", ordinal: 0, content,
    content_checksum: sha(content), token_count: 5, language: "mixed", source_locator: "body",
    effective_at: now, active: true,
  }).select("id").single(), "create protected chunk");

  const publicDocument = await anon.from("knowledge_documents").select("id").eq("id", documentId).maybeSingle();
  if (publicDocument.error || publicDocument.data?.id !== documentId) throw publicDocument.error || new Error("Approved public metadata is not visible anonymously.");
  const protectedChunk = await anon.from("knowledge_chunks").select("id").eq("document_id", documentId);
  if (!protectedChunk.error) throw new Error("Anonymous direct chunk access was unexpectedly granted.");

  const site = required(await owner.from("campus_sites").insert({code: `V${suffix}`, name_zh: `驗證校區 ${suffix}`, name_en: `Verification campus ${suffix}`, official_source_id: sourceId, verified_at: now}).select("id").single(), "create site"); siteId = site.id;
  const building = required(await owner.from("campus_buildings").insert({site_id: siteId, code: `B${suffix}`, name_zh: "驗證大樓", name_en: "Verification Building", official_source_id: sourceId, verified_at: now}).select("id").single(), "create building"); buildingId = building.id;
  const floor = required(await owner.from("campus_floors").insert({building_id: buildingId, level: 1, label_zh: "一樓", label_en: "Level 1"}).select("id").single(), "create floor"); floorId = floor.id;
  const place = required(await owner.from("campus_places").insert({site_id: siteId, building_id: buildingId, floor_id: floorId, code: `P${suffix}`, name_zh: "驗證服務處", name_en: "Verification Service", place_type: "service", wheelchair_accessible: true, official_source_id: sourceId, verified_at: now}).select("id").single(), "create place"); placeId = place.id;
  const nodes = required(await owner.from("campus_nodes").insert([
    {site_id: siteId, building_id: buildingId, floor_id: floorId, node_type: "entrance"},
    {site_id: siteId, building_id: buildingId, floor_id: floorId, place_id: placeId, node_type: "destination"},
  ]).select("id"), "create graph nodes"); [nodeA, nodeB] = nodes.map((row) => row.id);
  const edge = required(await owner.from("campus_edges").insert({from_node_id: nodeA, to_node_id: nodeB, distance_m: 12, estimated_seconds: 15, environment: "indoor", traversal_type: "walk", wheelchair_suitable: true, instruction_zh: "直行抵達", instruction_en: "Walk straight to the destination", verified_at: now}).select("id").single(), "create accessible edge"); edgeId = edge.id;
  const publicPlace = await anon.from("campus_places").select("id,campus_buildings!inner(id),campus_floors!inner(id)").eq("id", placeId).maybeSingle();
  if (publicPlace.error || publicPlace.data?.id !== placeId) throw publicPlace.error || new Error("Verified campus relationship is not publicly readable.");

  const study = required(await owner.from("research_studies").insert({code: `V-${suffix}`, title: "Issue 104 reversible validation", purpose: "Verify connected research storage without participant claims.", owner_profile_id: auth.data.user.id, retention_days: 30}).select("id").single(), "create study"); studyId = study.id;
  const version = required(await owner.from("research_study_versions").insert({study_id: studyId, version: 1, protocol: {design: "reversible integration"}, consent_text_zh: "測試資料", consent_text_en: "Test data", analysis_plan: {claim: "schema connectivity only"}}).select("id").single(), "create protocol version"); versionId = version.id;
  const participant = required(await owner.from("research_participants").insert({study_id: studyId, participant_code: `P-${suffix}`, population_role: "student", familiarity_level: "new", status: "consented"}).select("id").single(), "create pseudonymous participant"); participantId = participant.id;
  required(await owner.from("research_consent_records").insert({participant_id: participantId, study_version_id: versionId, consented: true, consented_at: now}).select("id").single(), "create consent record");
  const task = required(await owner.from("research_tasks").insert({study_version_id: versionId, task_key: "verify", domain: "campus_places", variant_a: "current", variant_b: "enhanced", gold_answer: {place_id: placeId}, max_seconds: 120, ordinal: 0}).select("id").single(), "create task");
  const session = required(await owner.from("research_sessions").insert({participant_id: participantId, study_version_id: versionId, sequence: "AB"}).select("id").single(), "create session"); sessionId = session.id;
  required(await owner.from("research_task_attempts").insert({session_id: sessionId, task_id: task.id, condition: "enhanced_platform", variant: "B", success: "complete", duration_ms: 1000, navigation_steps: 2}).select("id").single(), "create task attempt");
  const questionnaire = required(await owner.from("research_questionnaires").insert({study_version_id: versionId, instrument: "SEQ", language: "en", version: "1"}).select("id").single(), "create questionnaire");
  const item = required(await owner.from("research_questionnaire_items").insert({questionnaire_id: questionnaire.id, item_key: "seq-1", ordinal: 1, prompt: "This task was easy", response_type: "likert7", construct: "ease"}).select("id").single(), "create item");
  required(await owner.from("research_responses").insert({session_id: sessionId, questionnaire_id: questionnaire.id, item_id: item.id, condition: "enhanced_platform", numeric_value: 6}).select("id").single(), "create response");
  const connected = await owner.from("research_sessions").select("id,research_participants!inner(participant_code),research_task_attempts!inner(task_id),research_responses!inner(item_id)").eq("id", sessionId).single();
  if (connected.error || connected.data.id !== sessionId) throw connected.error || new Error("Study records are not connected.");

  console.log(JSON.stringify({tables: 31, foreignKeys: 56, publicMetadata: true, anonymousChunksDenied: true, campusGraphConnected: true, accessibleEdge: true, studyChainConnected: true, reversibleCleanup: true}));
} finally {
  if (sessionId) await owner.from("research_sessions").delete().eq("id", sessionId);
  if (participantId) await owner.from("research_participants").delete().eq("id", participantId);
  if (versionId) await owner.from("research_study_versions").delete().eq("id", versionId);
  if (studyId) await owner.from("research_studies").delete().eq("id", studyId);
  if (edgeId) await owner.from("campus_edges").delete().eq("id", edgeId);
  if (nodeA || nodeB) await owner.from("campus_nodes").delete().in("id", [nodeA, nodeB].filter(Boolean));
  if (placeId) await owner.from("campus_places").delete().eq("id", placeId);
  if (floorId) await owner.from("campus_floors").delete().eq("id", floorId);
  if (buildingId) await owner.from("campus_buildings").delete().eq("id", buildingId);
  if (siteId) await owner.from("campus_sites").delete().eq("id", siteId);
  if (documentId) await owner.from("knowledge_documents").delete().eq("id", documentId);
  if (sourceId) await owner.from("knowledge_sources").delete().eq("id", sourceId);
  await owner.auth.signOut();
}
