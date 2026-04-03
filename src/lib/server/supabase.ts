import { createClient } from '@supabase/supabase-js'

function getEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`)
  }
  return value
}

export function createServiceRoleClient() {
  return createClient(
    getEnv('SUPABASE_URL'),
    getEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  )
}
