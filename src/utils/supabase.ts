import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const hasSupabaseConfig = Boolean(supabaseUrl && supabasePublishableKey)

export const supabaseStatusMessage = !supabaseUrl
  ? 'Supabase is not configured. Set `VITE_SUPABASE_URL` in the Vercel project environment variables.'
  : !supabasePublishableKey
    ? 'Supabase is not configured. Set `VITE_SUPABASE_PUBLISHABLE_KEY` in the Vercel project environment variables.'
    : ''

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl!, supabasePublishableKey!)
  : null

export type TodoRecord = {
  id: number | string
  name: string
}

export async function fetchTodos() {
  if (!supabase) {
    return { data: [] as TodoRecord[], error: new Error(supabaseStatusMessage) }
  }

  try {
    const { data, error } = await supabase
      .from('todos')
      .select('id, name')
      .order('id', { ascending: true })

    if (error) {
      return { data: [] as TodoRecord[], error: new Error(error.message) }
    }

    return { data: (data ?? []) as TodoRecord[], error: null }
  } catch (error) {
    return {
      data: [] as TodoRecord[],
      error:
        error instanceof Error
          ? error
          : new Error('Supabase request failed unexpectedly.'),
    }
  }
}
