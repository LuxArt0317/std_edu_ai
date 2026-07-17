import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type User } from 'npm:@supabase/supabase-js@2.110.5'

const allowedRoles = new Set([
  'admin',
  'president',
  'vice_president',
  'dean',
  'registrar',
  'department_head',
  'faculty',
  'advisor',
  'admissions',
  'finance',
  'support',
  'librarian',
  'student',
])

const allowedOrigins = new Set([
  'https://stu.best',
  'https://www.stu.best',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

function response(request: Request, status: number, body: Record<string, unknown>) {
  const origin = request.headers.get('origin') ?? ''
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }
  if (allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers.Vary = 'Origin'
  }
  return new Response(JSON.stringify(body), { status, headers })
}

async function findUserByEmail(admin: ReturnType<typeof createClient>, email: string): Promise<User | null> {
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (error) throw error
    const match = data.users.find((user) => user.email?.toLowerCase() === email)
    if (match) return match
    if (data.users.length < 200) return null
  }
  throw new Error('The Auth directory is too large for bounded email lookup.')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    const origin = request.headers.get('origin') ?? ''
    if (!allowedOrigins.has(origin)) return response(request, 403, { error: 'Origin is not allowed.' })
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      },
    })
  }

  if (request.method !== 'POST') return response(request, 405, { error: 'Method not allowed.' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return response(request, 503, { error: 'Provisioning is not configured.' })

  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return response(request, 401, { error: 'Authentication is required.' })

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: identity, error: identityError } = await admin.auth.getUser(token)
  if (
    identityError ||
    identity.user?.app_metadata.role !== 'owner' ||
    identity.user?.app_metadata.platform_owner !== true
  ) {
    return response(request, 403, {
      error: 'Only the protected platform owner can provision accounts.',
    })
  }

  let input: Record<string, unknown>
  try {
    input = await request.json()
  } catch {
    return response(request, 400, {
      error: 'A JSON request body is required.',
    })
  }

  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  const password = typeof input.password === 'string' ? input.password : ''
  const role = typeof input.role === 'string' ? input.role : ''
  const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : ''

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return response(request, 400, { error: 'A valid email is required.' })
  }
  if (password.length < 24 || password.length > 128) {
    return response(request, 400, {
      error: 'The temporary password must contain 24 to 128 characters.',
    })
  }
  if (!allowedRoles.has(role)) {
    return response(request, 400, {
      error: 'The requested role is not provisionable.',
    })
  }
  if (fullName.length < 2 || fullName.length > 120) {
    return response(request, 400, {
      error: 'A full name between 2 and 120 characters is required.',
    })
  }

  try {
    const existing = await findUserByEmail(admin, email)
    const appMetadata = {
      ...(existing?.app_metadata ?? {}),
      role,
      platform_owner: false,
    }
    const attributes = {
      email,
      password,
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: {
        ...(existing?.user_metadata ?? {}),
        full_name: fullName,
      },
    }
    const result = existing
      ? await admin.auth.admin.updateUserById(existing.id, attributes)
      : await admin.auth.admin.createUser(attributes)

    if (result.error || !result.data.user) throw result.error ?? new Error('Auth did not return a user.')
    return response(request, existing ? 200 : 201, {
      id: result.data.user.id,
      email,
      role,
      status: existing ? 'updated' : 'created',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Account provisioning failed.'
    return response(request, 500, { error: message })
  }
})
