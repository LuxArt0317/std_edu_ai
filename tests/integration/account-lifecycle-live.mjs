import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);

function credential(email) {
  const result = spawnSync(
    "/usr/bin/security",
    ["find-internet-password", "-w", "-s", "www.stu.best", "-a", email],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  if (result.status !== 0 || !result.stdout.trim())
    throw new Error(`Missing protected credential for ${email}`);
  return result.stdout.trim();
}

const make = () =>
  createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const ownerEmail = "winsonbaring10@gmail.com";
const studentEmail = "winsonbaring10+student@gmail.com";
const owner = make();
const student = make();
const { data: ownerAuth, error: ownerError } =
  await owner.auth.signInWithPassword({
    email: ownerEmail,
    password: credential(ownerEmail),
  });
const { data: studentAuth, error: studentError } =
  await student.auth.signInWithPassword({
    email: studentEmail,
    password: credential(studentEmail),
  });
if (ownerError || studentError || !ownerAuth.user || !studentAuth.user)
  throw ownerError || studentError || new Error("Lifecycle identities failed.");

const targetId = studentAuth.user.id;
let validationError;
try {
  const suspended = await owner.functions.invoke("provision-role-account", {
    body: {
      action: "suspend",
      targetId,
      reason: "Reversible automated account lifecycle verification.",
    },
  });
  if (suspended.error || suspended.data?.status !== "suspended")
    throw suspended.error || new Error("Suspension was not confirmed.");
  const blockedClient = make();
  const blocked = await blockedClient.auth.signInWithPassword({
    email: studentEmail,
    password: credential(studentEmail),
  });
  if (!blocked.error) throw new Error("Suspended account still signed in.");
} catch (error) {
  validationError = error;
}
const restored = await owner.functions.invoke("provision-role-account", {
  body: {
    action: "activate",
    targetId,
    reason: "Restore after reversible automated lifecycle verification.",
  },
});
if (restored.error || restored.data?.status !== "active")
  throw restored.error || new Error("Account restoration failed.");
if (validationError) throw validationError;

const recoveredClient = make();
const recovered = await recoveredClient.auth.signInWithPassword({
  email: studentEmail,
  password: credential(studentEmail),
});
if (recovered.error || !recovered.data.session)
  throw recovered.error || new Error("Reactivated account could not sign in.");

const { data: profile, error: profileError } = await owner
  .from("profiles")
  .select("account_status")
  .eq("id", targetId)
  .single();
if (profileError || profile.account_status !== "active")
  throw profileError || new Error("Profile status did not return to active.");

await owner.auth.signOut();
await recoveredClient.auth.signOut();
console.log(
  JSON.stringify({
    suspendedLoginBlocked: true,
    restoredLoginSucceeded: true,
    finalStatus: profile.account_status,
  }),
);
