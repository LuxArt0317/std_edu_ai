import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);
const email = "winsonbaring10+admissions@gmail.com";
const credential = spawnSync(
  "/usr/bin/security",
  ["find-internet-password", "-w", "-s", "www.stu.best", "-a", email],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
);
if (credential.status !== 0 || !credential.stdout.trim())
  throw new Error("Missing protected admissions verification credential.");

const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const session = await client.auth.signInWithPassword({ email, password: credential.stdout.trim() });
if (session.error || session.data.user?.app_metadata.role !== "admissions")
  throw session.error || new Error("Admissions verification identity failed.");

const candidate = await client.from("admission_leads").select("*").neq("stage", "closed").limit(1).single();
if (candidate.error) throw candidate.error;
const original = candidate.data;
const marker = `Pipeline verification ${Date.now()}`;
let restored = false;
try {
  const move = await client.from("admission_leads").update({
    stage: "application",
    probability: 55,
    email: original.email || "pipeline-verification@stu.best",
    phone: original.phone || "+886-verify",
    next_step: marker,
    owner_id: session.data.user.id,
    last_activity_at: new Date().toISOString(),
  }).eq("id", original.id).select("stage,probability,email,phone,next_step,owner_id").single();
  if (move.error) throw move.error;
  if (move.data.stage !== "application" || move.data.probability !== 55 || move.data.next_step !== marker || move.data.owner_id !== session.data.user.id)
    throw new Error("Validated admissions transition did not persist its complete destination state.");
} finally {
  const rollback = await client.from("admission_leads").update({
    stage: original.stage,
    probability: original.probability,
    email: original.email,
    phone: original.phone,
    next_step: original.next_step,
    owner_id: original.owner_id,
    last_activity_at: original.last_activity_at,
  }).eq("id", original.id);
  if (rollback.error) throw rollback.error;
  restored = true;
}

console.log(JSON.stringify({ admissionsRole: true, stageMove: true, requiredFields: true, accountableOwner: true, rollback: restored }));
