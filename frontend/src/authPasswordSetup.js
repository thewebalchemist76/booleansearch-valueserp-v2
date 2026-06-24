export const PENDING_INVITE_KEY = 'pending_invite_password'
export const PENDING_SETUP_MODE_KEY = 'pending_password_setup_mode'

export function readSetupMode() {
  if (typeof sessionStorage === 'undefined') return 'invite'
  return sessionStorage.getItem(PENDING_SETUP_MODE_KEY) === 'recovery' ? 'recovery' : 'invite'
}

export function markPasswordSetup(mode) {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(PENDING_INVITE_KEY, '1')
    sessionStorage.setItem(PENDING_SETUP_MODE_KEY, mode)
  }
}

export function clearPasswordSetup() {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(PENDING_INVITE_KEY)
    sessionStorage.removeItem(PENDING_SETUP_MODE_KEY)
  }
}

export function isPasswordSetupPending() {
  if (typeof sessionStorage === 'undefined') return false
  return sessionStorage.getItem(PENDING_INVITE_KEY) === '1'
}

/** true se l'URL contiene token/hash di invito o reset (non solo ?recovery=1). */
export function isAuthCallbackUrl() {
  if (typeof window === 'undefined') return false

  const qs = new URLSearchParams(window.location.search)
  if (qs.get('setup') === '1') return true

  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return false

  const p = new URLSearchParams(hash)
  const linkType = p.get('type')
  if (linkType === 'invite' || linkType === 'signup' || linkType === 'recovery') return true
  return !!(p.get('access_token') && p.get('refresh_token'))
}

/** Rimuove flag di reset/invito rimasti dopo un flusso già completato. */
export function clearStalePasswordSetup(session) {
  if (!session?.user) return
  if (!isPasswordSetupPending()) return
  if (isAuthCallbackUrl()) return
  clearPasswordSetup()
}
