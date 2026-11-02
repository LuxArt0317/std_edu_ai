import {
  clientResearchEnvironment,
  researchSession,
} from "../helpers/client-research-session.mjs";
import { createClient } from "@supabase/supabase-js";

function required(result, message) {
  if (result.error) throw new Error(`${message}: ${result.error.message}`);
  if (!result.data) throw new Error(`${message}: no row returned`);
  return result.data;
}
Object.assign(process.env, await clientResearchEnvironment());
const session = await researchSession("owner");
const owner = session.db;
const auth = {
  data: { user: session.user, session: session.session },
  error: null,
};
const suffix = `ROUTE${Date.now().toString(36).toUpperCase()}`;
const now = new Date().toISOString();
const base = process.env.RESEARCH_BASE_URL || "https://stdeduai.vercel.app";
let sourceId = "",
  siteId = "",
  buildingId = "",
  floorId = "";
let placeIds = [];
let nodeIds = [];
let edgeIds = [];
try {
  sourceId = required(
    await owner
      .from("knowledge_sources")
      .insert({
        name: `Route fixture ${suffix}`,
        source_type: "map",
        canonical_url: `https://www.stu.edu.tw/route-fixture/${suffix.toLowerCase()}`,
        official_domain: true,
        authority_level: "primary_official",
        owner_profile_id: auth.data.user.id,
        default_audience_scope: "public",
        default_language: "mixed",
        crawl_policy: "manual",
        robots_reviewed_at: now,
        terms_reviewed_at: now,
        active: true,
      })
      .select("id")
      .single(),
    "source",
  ).id;
  siteId = required(
    await owner
      .from("campus_sites")
      .insert({
        code: suffix,
        name_zh: `路線驗證校區 ${suffix}`,
        name_en: `Route verification ${suffix}`,
        official_source_id: sourceId,
        verified_at: now,
      })
      .select("id")
      .single(),
    "site",
  ).id;
  buildingId = required(
    await owner
      .from("campus_buildings")
      .insert({
        site_id: siteId,
        code: `B${suffix}`,
        name_zh: "路線驗證大樓",
        name_en: "Route Verification Building",
        official_source_id: sourceId,
        verified_at: now,
      })
      .select("id")
      .single(),
    "building",
  ).id;
  floorId = required(
    await owner
      .from("campus_floors")
      .insert({
        building_id: buildingId,
        level: 1,
        label_zh: "一樓",
        label_en: "Level 1",
      })
      .select("id")
      .single(),
    "floor",
  ).id;
  const placeRows = required(
    await owner
      .from("campus_places")
      .insert([
        {
          site_id: siteId,
          building_id: buildingId,
          floor_id: floorId,
          code: `FROM${suffix}`,
          name_zh: "測試起點",
          name_en: "Test Origin",
          place_type: "entrance",
          wheelchair_accessible: true,
          official_source_id: sourceId,
          verified_at: now,
          status: "active",
          closure_reason: null,
        },
        {
          site_id: siteId,
          building_id: buildingId,
          floor_id: floorId,
          code: `TO${suffix}`,
          name_zh: "測試目的地",
          name_en: "Test Destination",
          place_type: "service",
          wheelchair_accessible: true,
          official_source_id: sourceId,
          verified_at: now,
          status: "active",
          closure_reason: null,
        },
        {
          site_id: siteId,
          building_id: buildingId,
          floor_id: floorId,
          code: `CLOSED${suffix}`,
          name_zh: "暫停服務處",
          name_en: "Closed Service",
          place_type: "service",
          wheelchair_accessible: true,
          official_source_id: sourceId,
          verified_at: now,
          status: "temporarily_closed",
          closure_reason: "Route verification closure",
        },
      ])
      .select("id,code"),
    "places",
  );
  placeIds = placeRows.map((row) => row.id);
  const origin = placeRows[0],
    destination = placeRows[1];
  const nodeRows = required(
    await owner
      .from("campus_nodes")
      .insert([
        {
          site_id: siteId,
          building_id: buildingId,
          floor_id: floorId,
          place_id: origin.id,
          node_type: "entrance",
        },
        {
          site_id: siteId,
          building_id: buildingId,
          floor_id: floorId,
          node_type: "stairs",
        },
        {
          site_id: siteId,
          building_id: buildingId,
          floor_id: floorId,
          node_type: "ramp",
        },
        {
          site_id: siteId,
          building_id: buildingId,
          floor_id: floorId,
          place_id: destination.id,
          node_type: "destination",
        },
      ])
      .select("id"),
    "nodes",
  );
  nodeIds = nodeRows.map((row) => row.id);
  const [a, stairs, ramp, b] = nodeIds;
  const directions = (label) => ({
    instruction_zh: `前往${label}`,
    instruction_en: `Take ${label}`,
    instruction_reverse_zh: `反向${label}`,
    instruction_reverse_en: `Reverse ${label}`,
  });
  const edgeRows = required(
    await owner
      .from("campus_edges")
      .insert([
        {
          from_node_id: a,
          to_node_id: stairs,
          distance_m: 5,
          estimated_seconds: 5,
          bidirectional: false,
          environment: "indoor",
          traversal_type: "stairs",
          wheelchair_suitable: false,
          ...directions("樓梯"),
          verified_at: now,
        },
        {
          from_node_id: stairs,
          to_node_id: b,
          distance_m: 5,
          estimated_seconds: 5,
          bidirectional: false,
          environment: "indoor",
          traversal_type: "stairs",
          wheelchair_suitable: false,
          ...directions("目的地"),
          verified_at: now,
        },
        {
          from_node_id: a,
          to_node_id: ramp,
          distance_m: 8,
          estimated_seconds: 8,
          bidirectional: false,
          environment: "covered",
          traversal_type: "ramp",
          wheelchair_suitable: true,
          ...directions("坡道"),
          verified_at: now,
        },
        {
          from_node_id: ramp,
          to_node_id: b,
          distance_m: 8,
          estimated_seconds: 8,
          bidirectional: false,
          environment: "indoor",
          traversal_type: "walk",
          wheelchair_suitable: true,
          ...directions("目的地"),
          verified_at: now,
        },
      ])
      .select("id"),
    "edges",
  );
  edgeIds = edgeRows.map((row) => row.id);
  const directoryResponse = await fetch(`${base}/api/campus-route`);
  if (!directoryResponse.ok)
    throw new Error(`directory HTTP ${directoryResponse.status}`);
  const directory = await directoryResponse.json();
  if (
    !directory.places.some((place) => place.code === origin.code) ||
    !directory.places.some((place) => place.code === `CLOSED${suffix}`)
  )
    throw new Error("Verified/closure directory entries missing.");
  const route = async (from, to, wheelchair) => {
    const response = await fetch(`${base}/api/campus-route`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ origin: from, destination: to, wheelchair }),
    });
    return { response, body: await response.json() };
  };
  const walking = await route(origin.code, destination.code, false);
  if (
    !walking.response.ok ||
    walking.body.steps.some((step) => !step.edgeId) ||
    walking.body.steps.map((step) => step.traversalType).join(",") !==
      "stairs,stairs"
  )
    throw new Error("Shortest walking route mismatch.");
  const accessible = await route(origin.code, destination.code, true);
  if (
    !accessible.response.ok ||
    accessible.body.steps.some(
      (step) => step.traversalType === "stairs" || !step.wheelchairSuitable,
    )
  )
    throw new Error("Accessible route leaked stairs/unsuitable edge.");
  const reverse = await route(destination.code, origin.code, false);
  if (reverse.response.status !== 409 || reverse.body.status !== "unreachable")
    throw new Error("Directed connector was traversed backwards.");
  console.log(
    JSON.stringify({
      directoryVerified: true,
      closureVisible: true,
      walkingSteps: walking.body.steps.length,
      accessibleSteps: accessible.body.steps.length,
      accessibleStairs: 0,
      directedReverseRejected: true,
      deterministic:
        JSON.stringify(
          (await route(origin.code, destination.code, true)).body.steps,
        ) === JSON.stringify(accessible.body.steps),
      cleanupExpected: true,
    }),
  );
} finally {
  if (edgeIds.length)
    await owner.from("campus_edges").delete().in("id", edgeIds);
  if (nodeIds.length)
    await owner.from("campus_nodes").delete().in("id", nodeIds);
  if (placeIds.length)
    await owner.from("campus_places").delete().in("id", placeIds);
  if (floorId) await owner.from("campus_floors").delete().eq("id", floorId);
  if (buildingId)
    await owner.from("campus_buildings").delete().eq("id", buildingId);
  if (siteId) await owner.from("campus_sites").delete().eq("id", siteId);
  if (sourceId)
    await owner.from("knowledge_sources").delete().eq("id", sourceId);
  await owner.auth.signOut({ scope: "local" });
}
