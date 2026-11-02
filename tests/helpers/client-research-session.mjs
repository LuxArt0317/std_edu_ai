import { readFile, writeFile } from "node:fs/promises";
let sessionWrites = Promise.resolve();
import { parseEnv } from "node:util";
import { deploymentEnvironment } from "../../scripts/deployment-env.mjs";
import { statePath, admin } from "../e2e/client-fixtures.mjs";
import { createClient } from "@supabase/supabase-js";
import { clientForRole } from "./role-client.mjs";

/** Never resolve original-project Keychain accounts or fall back to a different host. */
export async function clientResearchEnvironment() {
  const config = JSON.parse(await readFile("deployment.json", "utf8")),
    env = deploymentEnvironment();
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL;
  if (new URL(url).hostname !== config.supabase.projectRef + ".supabase.co")
    throw Error("Research QA target differs from deployment.json");
  const owner = parseEnv(await readFile(".env.owner.local", "utf8"));
  if (
    owner.CRM_ADMIN_EMAIL.toLowerCase() !==
    config.supabase.ownerEmail.toLowerCase()
  )
    throw Error("Research QA owner differs from client configuration");
  for (const name of [
    "RESEARCH_PUBLIC_BASE",
    "KNOWLEDGE_ACQUISITION_ORIGIN",
    "INGESTION_API_ORIGIN",
    "RESEARCH_BASE_URL",
  ])
    if (
      env[name] &&
      new URL(env[name]).origin !== new URL(config.vercel.productionUrl).origin
    )
      throw Error("Research QA API target differs from client deployment");
  return {
    ...env,
    VITE_SUPABASE_URL: url,
    VITE_SUPABASE_PUBLISHABLE_KEY:
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}
export async function researchSession(role = "owner") {
  const environment = await clientResearchEnvironment();
  let state;
  try {
    state = JSON.parse(await readFile(statePath, "utf8"));
  } catch {
    throw Error(
      "Run the serialized client research suite to create disposable role fixtures first.",
    );
  }
  if (!state.users[role])
    throw Error("Missing disposable research role: " + role);
  let db;
  if (role === "owner") db = await clientForRole(state, role);
  else {
    if (!state.createdUsers.includes(state.users[role].id))
      throw Error("Refusing to authenticate a non-fixture account");
    const found = await admin.auth.admin.getUserById(state.users[role].id);
    if (found.error || found.data.user?.app_metadata.role !== role)
      throw Error("Disposable role changed");
    const link = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: found.data.user.email,
    });
    if (link.error || !link.data.properties?.hashed_token)
      throw Error("Cannot create an isolated fixture session");
    db = createClient(
      environment.VITE_SUPABASE_URL,
      environment.VITE_SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const verified = await db.auth.verifyOtp({
      token_hash: link.data.properties.hashed_token,
      type: "magiclink",
    });
    if (verified.error)
      throw Error("Cannot verify the isolated fixture session");
  }
  const { data, error } = await db.auth.getUser();
  if (error || data.user?.app_metadata.role !== role)
    throw Error("Research role authorization could not be verified: " + role);
  const session = (await db.auth.getSession()).data.session;
  if (!session) throw Error("Missing verified research session");
  sessionWrites = sessionWrites.then(async () => {
    const latest = JSON.parse(await readFile(statePath, "utf8"));
    if (latest.users[role].id !== data.user.id)
      throw Error("Research fixture identity changed");
    latest.users[role].session = session;
    await writeFile(statePath, JSON.stringify(latest), { mode: 0o600 });
  });
  await sessionWrites;
  return { db, user: data.user, session };
}
