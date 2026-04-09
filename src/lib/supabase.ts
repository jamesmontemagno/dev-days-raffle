import { createClient } from '@supabase/supabase-js'
import { env, isSupabaseConfigured } from './env'

export const supabase = isSupabaseConfigured
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: false,
      },
    })
  : null
