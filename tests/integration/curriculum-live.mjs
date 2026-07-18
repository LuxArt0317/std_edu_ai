import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function readEnvironment(path) {
  if (!fs.existsSync(path)) return {};
  return Object.fromEntries(fs.readFileSync(path, "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}
Object.assign(process.env, readEnvironment(".env"), readEnvironment(".env.local"));

const email = "winsonbaring10+admin@gmail.com";
const secret = spawnSync("/usr/bin/security", ["find-internet-password", "-w", "-s", "www.stu.best", "-a", email], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
if (secret.status !== 0 || !secret.stdout.trim()) throw new Error("Missing protected admin credential.");
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: secret.stdout.trim() });
if (signInError) throw signInError;

const suffix = Date.now().toString(36).toUpperCase();
const programCode = `TCS${suffix.slice(-6)}`;
const subjects = Array.from({ length: 8 }, (_, index) => ({
  code: `${programCode}-${String(index + 1).padStart(2, "0")}`,
  title: `Transaction Test Subject ${index + 1}`,
  description: "Temporary reversible curriculum acceptance record.",
  units: 3,
  yearLevel: Math.floor(index / 2) + 1,
  semester: (index % 2) + 1,
  category: index < 2 ? "general_education" : "core",
  sortOrder: index + 1,
  prerequisiteCodes: index ? [`${programCode}-${String(index).padStart(2, "0")}`] : [],
}));
const payload = {
  programCode,
  programName: `Temporary Computer Science ${suffix}`,
  description: "Reversible live transaction test.",
  durationYears: 4,
  effectiveYear: 2199,
  subjects,
  blocks: [1, 2, 3, 4].map((year) => ({ yearLevel: year, blockCode: `${programCode}-${year}A`, capacity: 40 })),
};
const { data: departments, error: departmentError } = await supabase.from("departments").select("id").eq("status", "active").limit(1);
if (departmentError || !departments?.[0]) throw departmentError || new Error("No active department is available for curriculum verification.");
const departmentId = departments[0].id;
const key = `live-curriculum-${suffix}`;
const invalidProgramCode = `BAD${suffix.slice(-6)}`;
let planId;
let programId;
try {
  const invalidPayload = structuredClone(payload);
  invalidPayload.programCode = invalidProgramCode;
  invalidPayload.programName = `Rollback Test ${suffix}`;
  invalidPayload.subjects = invalidPayload.subjects.map((subject, index) => ({
    ...subject,
    code: `${invalidProgramCode}-${String(index + 1).padStart(2, "0")}`,
    prerequisiteCodes: index === 7 ? ["SUBJECT-DOES-NOT-EXIST"] : [],
  }));
  invalidPayload.blocks = invalidPayload.blocks.map((block) => ({ ...block, blockCode: `${invalidProgramCode}-${block.yearLevel}A` }));
  const invalid = await supabase.rpc("create_academic_curriculum", {
    p_department_id: departmentId,
    p_idempotency_key: `rollback-${suffix}`,
    p_payload: invalidPayload,
  });
  if (!invalid.error) throw new Error("Malformed curriculum unexpectedly succeeded.");
  const rolledBack = await supabase.from("academic_programs").select("id", { count: "exact", head: true }).eq("code", invalidProgramCode);
  if (rolledBack.error || rolledBack.count !== 0) throw rolledBack.error || new Error("Malformed curriculum left partial records behind.");

  const first = await supabase.rpc("create_academic_curriculum", { p_department_id: departmentId, p_idempotency_key: key, p_payload: payload });
  if (first.error) throw first.error;
  if (first.data.status !== "created" || first.data.subjects !== 8 || first.data.blocks !== 4 || first.data.prerequisites !== 7) throw new Error("Unexpected curriculum transaction totals.");
  planId = first.data.planId;
  programId = first.data.programId;
  const retry = await supabase.rpc("create_academic_curriculum", { p_department_id: departmentId, p_idempotency_key: key, p_payload: payload });
  if (retry.error || retry.data.status !== "reused" || retry.data.planId !== planId) throw retry.error || new Error("Idempotent retry failed.");
  const [planCourses, blocks] = await Promise.all([
    supabase.from("curriculum_plan_courses").select("id", { count: "exact", head: true }).eq("plan_id", planId),
    supabase.from("curriculum_block_templates").select("id", { count: "exact", head: true }).eq("plan_id", planId),
  ]);
  if (planCourses.error || planCourses.count !== 8 || blocks.error || blocks.count !== 4) throw new Error("Persisted curriculum counts do not match the transaction result.");
  console.log(JSON.stringify({ atomicCreate: true, atomicRollback: true, idempotentRetry: true, subjects: 8, prerequisites: 7, blocks: 4 }));
} finally {
  if (planId) await supabase.from("curriculum_plans").delete().eq("id", planId);
  if (programId) {
    await supabase.from("courses").delete().eq("program_id", programId);
    await supabase.from("academic_programs").delete().eq("id", programId);
  }
  await supabase.auth.signOut();
}
