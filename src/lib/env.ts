const value = (input: string | undefined) => input?.trim() ?? ''

export const env = {
  supabaseUrl: value(import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: value(import.meta.env.VITE_SUPABASE_ANON_KEY),
  adminPasswordHash: value(import.meta.env.VITE_ADMIN_PASSWORD_HASH).toLowerCase(),
  eventName: value(import.meta.env.VITE_EVENT_NAME) || 'GitHub Copilot Dev Days Giveaway',
  eventTagline:
    value(import.meta.env.VITE_EVENT_TAGLINE) ||
    'Check in, join the draw, and let Copilot Dev Days decide who takes home the next prize.',
}

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)
export const isAdminPasswordConfigured = Boolean(env.adminPasswordHash)
