import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type User } from 'npm:@supabase/supabase-js@2.110.5'

const allowedOrigins = new Set([
  'https://stu.best',
  'https://www.stu.best',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])
const managerRoles = new Set(['owner', 'admin', 'registrar'])

function respond(request: Request, status: number, body: Record<string, unknown>) {
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
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const match = data.users.find((user) => user.email?.toLowerCase() === email)
    if (match) return match
    if (data.users.length < 200) return null
  }
  throw new Error('The Auth directory is too large for bounded email lookup.')
}

function text(input: Record<string, unknown>, key: string) {
  return typeof input[key] === 'string' ? input[key].trim() : ''
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    const origin = request.headers.get('origin') ?? ''
    if (!allowedOrigins.has(origin)) return respond(request, 403, { error: 'Origin is not allowed.' })
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      },
    })
  }
  if (request.method !== 'POST') return respond(request, 405, { error: 'Method not allowed.' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return respond(request, 503, { error: 'Student provisioning is not configured.' })

  const token = (request.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return respond(request, 401, { error: 'Authentication is required.' })

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: identity, error: identityError } = await admin.auth.getUser(token)
  const actorRole = identity.user?.app_metadata.role
  if (identityError || typeof actorRole !== 'string' || !managerRoles.has(actorRole)) {
    return respond(request, 403, { error: 'Only the owner, administrator, or registrar can create student accounts.' })
  }

  let input: Record<string, unknown>
  try { input = await request.json() }
  catch { return respond(request, 400, { error: 'A JSON request body is required.' }) }

  const email = text(input, 'email').toLowerCase()
  const password = typeof input.password === 'string' ? input.password : ''
  const fullName = text(input, 'fullName')
  const preferredName = text(input, 'preferredName')
  const studentNumber = text(input, 'studentNumber').toUpperCase()
  const program = text(input, 'program')
  const yearLevel = text(input, 'yearLevel')
  const phone = text(input, 'phone')
  const advisorId = text(input, 'advisorId') || null

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return respond(request, 400, { error: 'A valid email is required.' })
  if (password.length < 24 || password.length > 128) return respond(request, 400, { error: 'The temporary password must contain 24 to 128 characters.' })
  if (fullName.length < 2 || fullName.length > 120) return respond(request, 400, { error: 'A full name between 2 and 120 characters is required.' })
  if (!/^[A-Z0-9][A-Z0-9-]{3,31}$/.test(studentNumber)) return respond(request, 400, { error: 'Student number must contain 4 to 32 letters, numbers, or hyphens.' })
  if (program.length < 2 || program.length > 120) return respond(request, 400, { error: 'A valid academic program is required.' })
  if (yearLevel.length < 1 || yearLevel.length > 40) return respond(request, 400, { error: 'A valid year level is required.' })
  if (phone.length > 40 || preferredName.length > 120) return respond(request, 400, { error: 'A student field exceeds its allowed length.' })

  let createdUserId: string | null = null
  try {
    const { data: duplicateStudent, error: duplicateError } = await admin
      .from('students')
      .select('id, profile_id, student_number')
      .eq('student_number', studentNumber)
      .maybeSingle()
    if (duplicateError) throw duplicateError

    const existingUser = await findUserByEmail(admin, email)
    if (existingUser && existingUser.app_metadata.role && existingUser.app_metadata.role !== 'student') {
      return respond(request, 409, { error: 'That email belongs to a non-student account.' })
    }
    if (duplicateStudent?.profile_id && duplicateStudent.profile_id !== existingUser?.id) {
      return respond(request, 409, { error: 'That student number is already linked to another account.' })
    }

    const attributes = {
      email,
      password,
      email_confirm: true,
      app_metadata: { ...(existingUser?.app_metadata ?? {}), role: 'student', platform_owner: false },
      user_metadata: { ...(existingUser?.user_metadata ?? {}), full_name: fullName },
    }
    const authResult = existingUser
      ? await admin.auth.admin.updateUserById(existingUser.id, attributes)
      : await admin.auth.admin.createUser(attributes)
    if (authResult.error || !authResult.data.user) throw authResult.error ?? new Error('Auth did not return a user.')
    if (!existingUser) createdUserId = authResult.data.user.id

    const userId = authResult.data.user.id
    const { error: profileError } = await admin.from('profiles').upsert({
      id: userId,
      full_name: fullName,
      role: 'student',
      is_platform_owner: false,
      job_title: 'Student',
    }, { onConflict: 'id' })
    if (profileError) throw profileError

    const studentPayload = {
      profile_id: userId,
      student_number: studentNumber,
      full_name: fullName,
      preferred_name: preferredName || null,
      program,
      year_level: yearLevel,
      email,
      phone: phone || null,
      advisor_id: advisorId,
      tags: ['Portal student'],
    }
    const studentQuery = duplicateStudent
      ? admin.from('students').update(studentPayload).eq('id', duplicateStudent.id)
      : admin.from('students').insert(studentPayload)
    const { data: student, error: studentError } = await studentQuery.select('id, profile_id, student_number, full_name, program, year_level').single()
    if (studentError) throw studentError

    return respond(request, existingUser ? 200 : 201, { student, email, status: existingUser ? 'updated' : 'created' })
  } catch (error) {
    if (createdUserId) await admin.auth.admin.deleteUser(createdUserId).catch(() => undefined)
    return respond(request, 500, { error: error instanceof Error ? error.message : 'Student account creation failed.' })
  }
})
