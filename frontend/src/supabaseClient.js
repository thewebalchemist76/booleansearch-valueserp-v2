import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase env vars')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Gli inviti Supabase usano ancora token nell’hash (#access_token=…); pkce rompe quel flusso.
    flowType: 'implicit',
  },
})

/** Chiamata Edge Function con fetch così il body JSON di errore è sempre leggibile (invoke maschera spesso il messaggio). */
export async function invokeEdgeFunction(functionName, payload) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      status: 0,
      data: { error: 'Mancano VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY nel frontend.' },
    }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token

  const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify(payload ?? {}),
  })

  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { error: text || res.statusText || `HTTP ${res.status}` }
  }

  return { ok: res.ok, status: res.status, data }
}
