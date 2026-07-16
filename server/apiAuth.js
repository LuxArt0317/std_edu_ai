function headerValue(value) {
  return Array.isArray(value) ? value[0] : value
}

export async function verifySupabaseRequest(request) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY
  if (!supabaseUrl || !publishableKey) {
    return { ok: false, status: 503, message: 'Authentication service is not configured.' }
  }

  const authorization = headerValue(request.headers.authorization)
  if (!authorization?.startsWith('Bearer ') || authorization.length < 32) {
    return { ok: false, status: 401, message: 'An authenticated STU Nexus session is required.' }
  }

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: {
        apikey: publishableKey,
        Authorization: authorization,
      },
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) return { ok: false, status: 401, message: 'The STU Nexus session is invalid or expired.' }
    const payload = await response.json()
    const appMetadata = payload.app_metadata && typeof payload.app_metadata === 'object' ? payload.app_metadata : {}
    const id = typeof payload.id === 'string' ? payload.id : ''
    const email = typeof payload.email === 'string' ? payload.email : ''
    const role = typeof appMetadata.role === 'string' ? appMetadata.role : 'student'
    if (!id) return { ok: false, status: 401, message: 'The STU Nexus session is invalid.' }
    return { ok: true, user: { id, email, role, isOwner: appMetadata.platform_owner === true || role === 'owner' } }
  } catch {
    return { ok: false, status: 503, message: 'Authentication service is temporarily unavailable.' }
  }
}
