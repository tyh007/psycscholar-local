import { createClient } from '@supabase/supabase-js'

function getAuthClient(request: Request) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Supabase auth env vars are missing on the server.')
  }

  const authorization = request.headers.get('authorization')

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: authorization
      ? {
          headers: {
            Authorization: authorization
          }
        }
      : undefined
  })
}

export async function requireRequestUser(request: Request) {
  const client = getAuthClient(request)
  const {
    data: { user },
    error
  } = await client.auth.getUser()

  if (error || !user) {
    throw new Error('Unauthorized')
  }

  return user
}
