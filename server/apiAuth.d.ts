export type ApiUser = {
  id: string
  email: string
  role: string
  isOwner: boolean
}

export type AuthenticatedApiRequest = {
  headers: Record<string, string | string[] | undefined>
}

export type ApiAuthResult =
  | { ok: true; user: ApiUser }
  | { ok: false; status: 401 | 503; message: string }

export function verifySupabaseRequest(request: AuthenticatedApiRequest): Promise<ApiAuthResult>
