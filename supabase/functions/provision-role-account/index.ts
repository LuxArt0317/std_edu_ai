import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type User } from "npm:@supabase/supabase-js@2.110.5";

const allowedRoles = new Set([
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
]);

const allowedOrigins = new Set([
  "https://stu.best",
  "https://www.stu.best",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function response(
  request: Request,
  status: number,
  body: Record<string, unknown>,
) {
  const origin = request.headers.get("origin") ?? "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function findUserByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<User | null> {
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const match = data.users.find(
      (user) => user.email?.toLowerCase() === email,
    );
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  throw new Error("The Auth directory is too large for bounded email lookup.");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin") ?? "";
    if (!allowedOrigins.has(origin))
      return response(request, 403, { error: "Origin is not allowed." });
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      },
    });
  }

  if (request.method !== "POST")
    return response(request, 405, { error: "Method not allowed." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey)
    return response(request, 503, { error: "Provisioning is not configured." });

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token)
    return response(request, 401, { error: "Authentication is required." });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: identity, error: identityError } =
    await admin.auth.getUser(token);
  if (
    identityError ||
    identity.user?.app_metadata.role !== "owner" ||
    identity.user?.app_metadata.platform_owner !== true
  ) {
    return response(request, 403, {
      error: "Only the protected platform owner can provision accounts.",
    });
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return response(request, 400, {
      error: "A JSON request body is required.",
    });
  }

  const email =
    typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const role = typeof input.role === "string" ? input.role : "";
  const fullName =
    typeof input.fullName === "string" ? input.fullName.trim() : "";
  const action = typeof input.action === "string" ? input.action : "provision";
  const targetId = typeof input.targetId === "string" ? input.targetId : "";
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";

  if (action === "directory") {
    try {
      const accounts: Array<Record<string, unknown>> = [];
      for (let page = 1; page <= 25; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({
          page,
          perPage: 200,
        });
        if (error) throw error;
        accounts.push(
          ...data.users.map((user) => ({
            id: user.id,
            email: user.email ?? "",
            createdAt: user.created_at,
            lastSignInAt: user.last_sign_in_at ?? null,
            invitedAt: user.invited_at ?? null,
            confirmedAt: user.confirmed_at ?? null,
            bannedUntil: user.banned_until ?? null,
          })),
        );
        if (data.users.length < 200) break;
      }
      return response(request, 200, { accounts });
    } catch (error) {
      return response(request, 500, {
        error:
          error instanceof Error
            ? error.message
            : "The Auth directory could not be loaded.",
      });
    }
  }

  if (action === "revoke_sessions") {
    if (
      !/^[0-9a-f-]{36}$/i.test(targetId) ||
      reason.length < 12 ||
      reason.length > 500
    ) {
      return response(request, 400, {
        error:
          "A target account and a reason between 12 and 500 characters are required.",
      });
    }
    try {
      const { data: target, error: targetError } =
        await admin.auth.admin.getUserById(targetId);
      if (targetError || !target.user)
        throw targetError ?? new Error("Account not found.");
      if (
        target.user.app_metadata.platform_owner === true ||
        target.user.app_metadata.role === "owner"
      ) {
        return response(request, 403, {
          error: "The protected owner sessions cannot be revoked here.",
        });
      }
      const { data: revokedCount, error: revokeError } = await admin.rpc(
        "revoke_platform_sessions",
        {
          p_target_profile_id: targetId,
          p_acted_by: identity.user.id,
          p_reason: reason,
        },
      );
      if (revokeError) throw revokeError;
      return response(request, 200, {
        id: targetId,
        revokedCount: Number(revokedCount ?? 0),
      });
    } catch (error) {
      return response(request, 500, {
        error:
          error instanceof Error ? error.message : "Session revocation failed.",
      });
    }
  }

  if (action === "resend_invitation") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      return response(request, 400, { error: "A valid email is required." });
    try {
      const existing = await findUserByEmail(admin, email);
      if (!existing) return response(request, 404, { error: "Account not found." });
      if (existing.confirmed_at)
        return response(request, 409, { error: "This account is already confirmed. Use password reset instead." });
      const { error } = await admin.auth.resend({ type: "signup", email, options: { emailRedirectTo: "https://www.stu.best/crm" } });
      if (error) throw error;
      await admin.from("account_access_audit").insert({ target_profile_id: existing.id, acted_by: identity.user.id, action: "invitation_resent", reason: "Protected owner resent the pending institutional invitation.", details: { email } }).throwOnError();
      return response(request, 200, { id: existing.id, email, status: "invitation_resent" });
    } catch (error) {
      return response(request, 500, { error: error instanceof Error ? error.message : "Invitation could not be resent." });
    }
  }

  if (action === "invite") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      return response(request, 400, { error: "A valid email is required." });
    if (!allowedRoles.has(role)) return response(request, 400, { error: "The requested role is not provisionable." });
    if (fullName.length < 2 || fullName.length > 120) return response(request, 400, { error: "A full name between 2 and 120 characters is required." });
    try {
      if (await findUserByEmail(admin, email)) return response(request, 409, { error: "An account with this email already exists." });
      const invited = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName }, redirectTo: "https://www.stu.best/crm" });
      if (invited.error || !invited.data.user) throw invited.error ?? new Error("Auth did not return the invited user.");
      const updated = await admin.auth.admin.updateUserById(invited.data.user.id, { app_metadata: { role, platform_owner: false } });
      if (updated.error) throw updated.error;
      await admin.from("account_access_audit").insert({ target_profile_id: invited.data.user.id, acted_by: identity.user.id, action: "invitation_sent", reason: "Protected owner invited a new institutional account.", details: { role, email } }).throwOnError();
      return response(request, 201, { id: invited.data.user.id, email, role, status: "invited" });
    } catch (error) {
      return response(request, 500, { error: error instanceof Error ? error.message : "Invitation failed." });
    }
  }

  if (action !== "provision") {
    if (!["activate", "suspend", "archive", "restore"].includes(action)) {
      return response(request, 400, {
        error: "The account lifecycle action is invalid.",
      });
    }
    if (
      !/^[0-9a-f-]{36}$/i.test(targetId) ||
      reason.length < 12 ||
      reason.length > 500
    ) {
      return response(request, 400, {
        error:
          "A target account and a reason between 12 and 500 characters are required.",
      });
    }
    try {
      const { data: target, error: targetError } =
        await admin.auth.admin.getUserById(targetId);
      if (targetError || !target.user)
        throw targetError ?? new Error("Account not found.");
      if (
        target.user.app_metadata.platform_owner === true ||
        target.user.app_metadata.role === "owner"
      ) {
        return response(request, 403, {
          error: "The protected owner account cannot be changed.",
        });
      }
      const nextStatus =
        action === "suspend"
          ? "suspended"
          : action === "archive"
            ? "archived"
            : "active";
      const { data: currentProfile, error: profileError } = await admin
        .from("profiles")
        .select("account_status")
        .eq("id", targetId)
        .single();
      if (profileError) throw profileError;
      const previousStatus = currentProfile.account_status ?? "active";
      const authUpdate = await admin.auth.admin.updateUserById(targetId, {
        ban_duration: nextStatus === "active" ? "none" : "876000h",
      });
      if (authUpdate.error) throw authUpdate.error;
      const { error: updateError } = await admin
        .from("profiles")
        .update({
          account_status: nextStatus,
          status_changed_at: new Date().toISOString(),
          status_changed_by: identity.user.id,
          status_reason: reason,
        })
        .eq("id", targetId);
      if (updateError) throw updateError;
      const { error: auditError } = await admin
        .from("account_lifecycle_audit")
        .insert({
          target_profile_id: targetId,
          changed_by: identity.user.id,
          previous_status: previousStatus,
          new_status: nextStatus,
          reason,
        });
      if (auditError) throw auditError;
      return response(request, 200, { id: targetId, status: nextStatus });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Account lifecycle change failed.";
      return response(request, 500, { error: message });
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return response(request, 400, { error: "A valid email is required." });
  }
  if (password.length < 24 || password.length > 128) {
    return response(request, 400, {
      error: "The temporary password must contain 24 to 128 characters.",
    });
  }
  if (!allowedRoles.has(role)) {
    return response(request, 400, {
      error: "The requested role is not provisionable.",
    });
  }
  if (fullName.length < 2 || fullName.length > 120) {
    return response(request, 400, {
      error: "A full name between 2 and 120 characters is required.",
    });
  }

  try {
    const existing = await findUserByEmail(admin, email);
    const appMetadata = {
      ...(existing?.app_metadata ?? {}),
      role,
      platform_owner: false,
    };
    const attributes = {
      email,
      password,
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: {
        ...(existing?.user_metadata ?? {}),
        full_name: fullName,
      },
    };
    const result = existing
      ? await admin.auth.admin.updateUserById(existing.id, attributes)
      : await admin.auth.admin.createUser(attributes);

    if (result.error || !result.data.user)
      throw result.error ?? new Error("Auth did not return a user.");
    if (existing) {
      const { error: auditError } = await admin
        .from("account_access_audit")
        .insert({
          target_profile_id: result.data.user.id,
          acted_by: identity.user.id,
          action: "credentials_rotated",
          reason: "Protected owner rotated temporary account credentials.",
          details: { role },
        });
      if (auditError) throw auditError;
    }
    return response(request, existing ? 200 : 201, {
      id: result.data.user.id,
      email,
      role,
      status: existing ? "updated" : "created",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Account provisioning failed.";
    return response(request, 500, { error: message });
  }
});
