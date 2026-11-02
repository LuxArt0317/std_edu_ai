import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { parseEnv } from "node:util";
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import { deploymentEnvironment } from "../../../scripts/deployment-env.mjs";
const env = deploymentEnvironment();
const config = JSON.parse(await readFile("deployment.json", "utf8"));
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL;
if (new URL(url).hostname !== `${config.supabase.projectRef}.supabase.co`)
  throw new Error("QA target does not match the client deployment.");
export const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const key =
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const statePath = "artifacts/tutorials/private-state.json";
export async function database() {
  return postgres(env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL, {
    max: 1,
    connect_timeout: 15,
    ssl: {
      rejectUnauthorized: true,
      ca: await readFile("supabase/certs/prod-ca-2021.crt", "utf8"),
    },
    onnotice: () => {},
  });
}
export async function createFixtures() {
  try {
    const existing = JSON.parse(await readFile(statePath, "utf8"));
    if (existing.ready) {
      const verified = await admin.auth.admin.getUserById(
        existing.users.owner.id,
      );
      if (!verified.error) return existing;
    }
    await cleanupFixtures();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir("artifacts/tutorials", { recursive: true, mode: 0o700 });
  const state = {
    marker: `VIDEO77-${Date.now()}`,
    users: {},
    ids: {},
    createdUsers: [],
  };
  const save = () =>
    writeFile(statePath, JSON.stringify(state), { mode: 0o600 });
  await save();
  try {
    const owner = parseEnv(await readFile(".env.owner.local", "utf8"));
    const roles = [
      "owner",
      "admin",
      "president",
      "vice_president",
      "dean",
      "registrar",
      "department_head",
      "faculty",
      "advisor",
      "admissions",
      "finance",
      "support",
      "librarian",
      "student",
    ];
    for (const role of roles) {
      const password =
        role === "owner"
          ? owner.CRM_ADMIN_PASSWORD
          : randomBytes(28).toString("base64url") + "aA1!";
      const email =
        role === "owner"
          ? owner.CRM_ADMIN_EMAIL
          : `luxart0317+${state.marker.toLowerCase()}-${role}@gmail.com`;
      if (role !== "owner") {
        const created = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          app_metadata: { role, must_change_password: false },
          user_metadata: { full_name: `${state.marker} ${role}` },
        });
        if (created.error)
          throw new Error(`Fixture account ${role}: ${created.error.message}`);
        state.createdUsers.push(created.data.user.id);
        await save();
        const profile = await admin
          .from("profiles")
          .update({ role, account_status: "active" })
          .eq("id", created.data.user.id);
        if (profile.error)
          throw new Error(`Fixture profile ${role}: ${profile.error.message}`);
      }
      const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const login = await client.auth.signInWithPassword({ email, password });
      if (login.error)
        throw new Error(`Fixture login ${role}: ${login.error.message}`);
      state.users[role] = {
        id: login.data.user.id,
        session: login.data.session,
      };
      await save();
    }
    const sql = await database();
    try {
      for (const kind of [
        "department",
        "program",
        "term",
        "course",
        "section",
        "student",
        "plan",
      ])
        state.ids[kind] = randomUUID();
      await sql.begin(async (tx) => {
        await tx`insert into public.departments(id,code,name) values (${state.ids.department},${state.marker},${state.marker + " Department"})`;
        await tx`insert into public.academic_programs(id,department_id,code,name,level,duration_years) values (${state.ids.program},${state.ids.department},${state.marker},${state.marker + " Program"},'bachelor',4)`;
        await tx`update public.profiles set department_id=${state.ids.department},program_id=${state.ids.program} where id in (${state.users.faculty.id},${state.users.student.id})`;
        await tx`insert into public.academic_terms(id,code,name,starts_on,ends_on,status) values (${state.ids.term},${state.marker},${state.marker + " Term"},'2026-01-01','2027-12-31','active')`;
        await tx`insert into public.courses(id,department_id,program_id,code,title) values (${state.ids.course},${state.ids.department},${state.ids.program},${state.marker},${state.marker + " Teaching Course"})`;
        await tx`insert into public.course_sections(id,course_id,term_id,section_code,faculty_id,capacity,status) values (${state.ids.section},${state.ids.course},${state.ids.term},'QA',${state.users.faculty.id},20,'active')`;
        await tx`insert into public.students(id,profile_id,student_number,full_name,program,program_id,year_level,advisor_id,email) values (${state.ids.student},${state.users.student.id},${state.marker},${state.marker + " Student"},${state.marker},${state.ids.program},1,${state.users.faculty.id},${state.users.student.session.user.email})`;
        await tx`insert into public.section_enrollments(section_id,student_profile_id,student_id) values (${state.ids.section},${state.users.student.id},${state.ids.student})`;
        const source = {
          programCode: state.marker,
          programName: state.marker + " Program",
          effectiveYear: 2026,
          durationYears: 4,
          subjects: [
            {
              code: state.marker,
              title: "Verified QA subject",
              yearLevel: 1,
              semester: 1,
              units: 3,
              category: "core",
              prerequisiteCodes: [],
            },
          ],
          blocks: [],
        };
        await tx`insert into public.curriculum_plans(id,program_id,effective_year,status,idempotency_key,created_by,source_payload) values (${state.ids.plan},${state.ids.program},2026,'draft',${state.marker},${state.users.owner.id},${source})`;
      });
      state.ready = true;
      await save();
    } finally {
      await sql.end({ timeout: 5 });
    }
    return state;
  } catch (error) {
    await save();
    await cleanupFixtures().catch(() => {});
    throw error;
  }
}
export async function cleanupFixtures() {
  let state;
  try {
    state = JSON.parse(await readFile(statePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (
    !Array.isArray(state.createdUsers) ||
    state.createdUsers.includes(state.users.owner?.id)
  )
    throw new Error(
      "Invalid disposable-account ledger; protected owner cannot be cleaned up",
    );
  let removedFiles = 0;
  if (state.ids.section) {
    for (const bucket of ["lms-files", "learning-media"]) {
      async function removePrefix(prefix) {
        const result = await admin.storage
          .from(bucket)
          .list(prefix, { limit: 1000 });
        if (result.error)
          throw new Error(
            `QA storage cleanup ${bucket}: ${result.error.message}`,
          );
        for (const item of result.data) {
          const name = `${prefix}/${item.name}`;
          if (!item.id) await removePrefix(name);
          else {
            const removed = await admin.storage.from(bucket).remove([name]);
            if (removed.error)
              throw new Error(`QA file cleanup: ${removed.error.message}`);
            removedFiles++;
          }
        }
      }
      await removePrefix(state.ids.section);
    }
  }
  const sql = await database();
  try {
    await sql.begin(async (tx) => {
      // Only audit entries created by the disposable video accounts are removable here.
      if (state.createdUsers.length)
        await tx`delete from public.controlled_action_audit where actor_id in ${tx(state.createdUsers)}`;
      if (state.ids.section) {
        const requests =
          await tx`select id from public.curriculum_change_requests where section_id=${state.ids.section}`;
        const requestIds = requests.map((row) => row.id);
        if (requestIds.length)
          await tx`delete from public.notifications where action_url in ${tx(requestIds.map((id) => "/crm?curriculum_request=" + id))}`;
        if (requestIds.length)
          await tx`delete from public.controlled_action_audit where entity_type='curriculum_change_request' and entity_id in ${tx(requestIds)}`;
        await tx`delete from public.curriculum_change_requests where section_id=${state.ids.section}`;
        await tx`delete from public.attendance_sessions where section_id=${state.ids.section}`;
        await tx`delete from public.assessments where section_id=${state.ids.section}`;
        await tx`delete from public.learning_modules where section_id=${state.ids.section}`;
        await tx`delete from public.course_sections where id=${state.ids.section}`;
      }
      if (state.ids.student) {
        const cases =
          await tx`select id from public.cases where student_id=${state.ids.student}`;
        if (cases.length)
          await tx`delete from public.controlled_action_audit where entity_type='case' and entity_id in ${tx(cases.map((item) => item.id))}`;
        await tx`delete from public.crm_tasks where student_id=${state.ids.student}`;
        await tx`delete from public.cases where student_id=${state.ids.student}`;
        await tx`delete from public.students where id=${state.ids.student}`;
      }
      if (state.ids.plan)
        await tx`delete from public.curriculum_plans where id=${state.ids.plan}`;
      if (state.ids.course)
        await tx`delete from public.courses where id=${state.ids.course}`;
      if (state.ids.term)
        await tx`delete from public.academic_terms where id=${state.ids.term}`;
      if (state.createdUsers.length)
        await tx`update public.profiles set program_id=null,department_id=null where id in ${tx(state.createdUsers)}`;
      if (state.ids.program)
        await tx`delete from public.academic_programs where id=${state.ids.program}`;
      await tx`delete from public.departments where code=${state.marker + "U"}`;
      if (state.ids.department)
        await tx`delete from public.departments where id=${state.ids.department}`;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
  for (const id of state.createdUsers) {
    if (id === state.users.owner?.id)
      throw new Error("Refusing to delete protected owner");
    const existing = await admin.auth.admin.getUserById(id);
    if (existing.error?.status === 404) continue;
    if (existing.error)
      throw new Error("Cannot verify disposable account before cleanup");
    const result = await admin.auth.admin.deleteUser(id);
    if (result.error)
      throw new Error(
        `Could not clean up a QA account: ${result.error.message}`,
      );
  }
  await writeFile(
    "artifacts/tutorials/cleanup.json",
    JSON.stringify(
      {
        marker: state.marker,
        removedAccounts: state.createdUsers.length,
        fixtureRecordsRemoved: true,
        removedFiles,
        secretsRemoved: true,
      },
      null,
      2,
    ),
  );
  await unlink(statePath);
}
