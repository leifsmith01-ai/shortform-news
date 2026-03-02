import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// Holds the current Clerk JWT so the accessToken callback can return it.
// Updated by setSupabaseToken() in UserInitialiser (App.tsx).
let _clerkToken = ''

export function setSupabaseToken(token: string) {
  _clerkToken = token
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  accessToken: () => Promise.resolve(_clerkToken),
})
