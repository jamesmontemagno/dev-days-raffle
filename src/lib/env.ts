const value = (input: string | undefined) => input?.trim() ?? ''

export const env = {
  supabaseUrl: value(import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: value(import.meta.env.VITE_SUPABASE_ANON_KEY),
  adminPasswordHash: value(import.meta.env.VITE_ADMIN_PASSWORD_HASH).toLowerCase(),
  eventName: value(import.meta.env.VITE_EVENT_NAME) || 'Dev Days Raffle',
  eventTagline: value(import.meta.env.VITE_EVENT_TAGLINE) || 'Enter once. Cheer loudly. Win big.',
}

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)
export const isAdminPasswordConfigured = Boolean(env.adminPasswordHash)
