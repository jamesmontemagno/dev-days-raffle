const value = (input: string | undefined) => input?.trim() ?? ''

export const env = {
  supabaseUrl: value(import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: value(import.meta.env.VITE_SUPABASE_ANON_KEY),
  adminPasswordHash: value(import.meta.env.VITE_ADMIN_PASSWORD_HASH).toLowerCase(),
  repoUrl: value(import.meta.env.VITE_REPO_URL) || 'https://github.com/jamesmontemagno/dev-days-raffle',
  eventName: value(import.meta.env.VITE_EVENT_NAME) || 'GitHub Copilot Dev Days Giveaway',
  eventTagline:
    value(import.meta.env.VITE_EVENT_TAGLINE) ||
    'Check in, join the draw, and let Copilot Dev Days decide who takes home the next prize.',
  localNamesFile: value(import.meta.env.VITE_LOCAL_NAMES_FILE),
}

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)
export const isAdminPasswordConfigured = Boolean(env.adminPasswordHash)
export const isLocalFileMode = Boolean(!isSupabaseConfigured && env.localNamesFile)
