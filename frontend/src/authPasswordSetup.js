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
