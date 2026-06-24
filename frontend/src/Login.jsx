// frontend/src/Login.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import {
  clearPasswordSetup,
  markPasswordSetup,
  PENDING_INVITE_KEY,
  readSetupMode,
} from './authPasswordSetup'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  /** Dopo click sul link invito/recovery: sessione da hash; qui si imposta la password */
  const [inviteSetup, setInviteSetup] = useState(false)
  const [setupMode, setSetupMode] = useState('invite')
  const [invitePw, setInvitePw] = useState('')
  const [invitePw2, setInvitePw2] = useState('')
  const [inviteSaving, setInviteSaving] = useState(false)

  const [forgotMode, setForgotMode] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return
      if (event === 'PASSWORD_RECOVERY') {
        markPasswordSetup('recovery')
        setSetupMode('recovery')
        setInviteSetup(true)
      }
    })

    ;(async () => {
      const qs0 = new URLSearchParams(window.location.search)
      const forceSetup = qs0.get('setup') === '1'

      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(PENDING_INVITE_KEY) === '1') {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (cancelled) return
        if (session?.user) {
          setSetupMode(readSetupMode())
          setInviteSetup(true)
          return
        }
        clearPasswordSetup()
      }

      const hash = window.location.hash.replace(/^#/, '')
      if (hash) {
        const p = new URLSearchParams(hash)
        const access_token = p.get('access_token')
        const refresh_token = p.get('refresh_token')
        const linkType = p.get('type')

        if (access_token && refresh_token) {
          const { error: sessErr } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          })
          if (cancelled) return
          if (sessErr) {
            setError(sessErr.message)
            return
          }
          window.history.replaceState(null, document.title, window.location.pathname + window.location.search)

          if (forceSetup || linkType === 'invite' || linkType === 'signup' || linkType === 'recovery') {
            const mode = linkType === 'recovery' ? 'recovery' : 'invite'
            markPasswordSetup(mode)
            setSetupMode(mode)
            setInviteSetup(true)
            return
          }

          navigate('/search', { replace: true })
          return
        }

        const errDesc = p.get('error_description')
        const errCode = p.get('error')
        if (errDesc || errCode) {
          const raw = errDesc || errCode || ''
          try {
            setError(decodeURIComponent(String(raw).replace(/\+/g, ' ')))
          } catch {
            setError(raw)
          }
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (cancelled) return
      const pendingInvite =
        typeof sessionStorage !== 'undefined' && sessionStorage.getItem(PENDING_INVITE_KEY) === '1'
      if (session?.user && (pendingInvite || forceSetup || qs0.get('recovery') === '1')) {
        if (!pendingInvite) markPasswordSetup(qs0.get('recovery') === '1' ? 'recovery' : 'invite')
        setSetupMode(readSetupMode())
        setInviteSetup(true)
        return
      }
      if (session?.user && !pendingInvite) {
        navigate('/search', { replace: true })
        return
      }

      const qs = new URLSearchParams(window.location.search)
      const qErr = qs.get('error_description') || qs.get('error')
      if (qErr && !cancelled) {
        try {
          setError(decodeURIComponent(String(qErr).replace(/\+/g, ' ')))
        } catch {
          setError(qErr)
        }
      }
    })()

    return () => {
      cancelled = true
      authListener?.subscription?.unsubscribe()
    }
  }, [navigate])

  const saveInvitePassword = async (e) => {
    e.preventDefault()
    setError(null)
    if (invitePw.length < 8) {
      setError('La password deve essere di almeno 8 caratteri.')
      return
    }
    if (invitePw !== invitePw2) {
      setError('Le password non coincidono.')
      return
    }

    setInviteSaving(true)
    const { error: updErr } = await supabase.auth.updateUser({ password: invitePw })
    setInviteSaving(false)

    if (updErr) {
      setError(updErr.message)
      return
    }

    clearPasswordSetup()
    navigate('/search', { replace: true })
  }

  const requestPasswordReset = async (e) => {
    e.preventDefault()
    setError(null)
    const trimmed = email.trim()
    if (!trimmed) {
      setError('Inserisci la tua email.')
      return
    }

    setForgotLoading(true)
    const redirectTo = `${window.location.origin}/login?recovery=1`
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo })
    setForgotLoading(false)

    if (resetErr) {
      setError(resetErr.message)
      return
    }

    setForgotSent(true)
  }

  const backToLogin = () => {
    setForgotMode(false)
    setForgotSent(false)
    setError(null)
  }

  const signIn = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    navigate('/search', { replace: true })
    setLoading(false)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f9fafb',
      }}
    >
      <div
        style={{
          width: 360,
          background: 'white',
          padding: 24,
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        <h2 style={{ marginBottom: 16, textAlign: 'center' }}>Login</h2>

        <p style={{ marginBottom: 16, fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 1.45 }}>
          Accesso solo su invito: non è possibile creare un account da qui.
          Se hai ricevuto un invito, apri il link nell&apos;email: ti faremo impostare la password qui sotto.
        </p>

        {error && (
          <div className="error-message" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        {inviteSetup && (
          <form onSubmit={saveInvitePassword} style={{ marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>
              {setupMode === 'recovery' ? 'Reimposta password' : 'Imposta password'}
            </h3>
            <p style={{ marginBottom: 12, fontSize: 13, color: '#6b7280', lineHeight: 1.45 }}>
              {setupMode === 'recovery'
                ? 'Scegli una nuova password per il tuo account.'
                : 'Scegli una password per entrare anche dalla pagina Login nei prossimi accessi.'}
            </p>
            <div className="input-group">
              <label>Nuova password</label>
              <input
                type="password"
                value={invitePw}
                onChange={(e) => setInvitePw(e.target.value)}
                autoComplete="new-password"
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 6,
                  border: '1px solid #e5e7eb',
                }}
                required
                minLength={8}
              />
            </div>
            <div className="input-group" style={{ marginTop: 12 }}>
              <label>Ripeti password</label>
              <input
                type="password"
                value={invitePw2}
                onChange={(e) => setInvitePw2(e.target.value)}
                autoComplete="new-password"
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 6,
                  border: '1px solid #e5e7eb',
                }}
                required
                minLength={8}
              />
            </div>
            <button type="submit" className="search-button" style={{ marginTop: 16 }} disabled={inviteSaving}>
              {inviteSaving
                ? '⏳'
                : setupMode === 'recovery'
                  ? 'Salva nuova password e continua'
                  : 'Salva password e continua'}
            </button>
          </form>
        )}

        {!inviteSetup && forgotMode && !forgotSent && (
          <form onSubmit={requestPasswordReset}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>Password dimenticata?</h3>
            <p style={{ marginBottom: 12, fontSize: 13, color: '#6b7280', lineHeight: 1.45 }}>
              Inserisci l&apos;email con cui sei stato invitato. Ti invieremo un link per reimpostare la password.
            </p>
            <div className="input-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 6,
                  border: '1px solid #e5e7eb',
                }}
                required
              />
            </div>
            <button type="submit" className="search-button" style={{ marginTop: 16 }} disabled={forgotLoading}>
              {forgotLoading ? '⏳' : 'Invia link di reset'}
            </button>
            <button
              type="button"
              onClick={backToLogin}
              style={{
                marginTop: 12,
                width: '100%',
                padding: 0,
                border: 'none',
                background: 'none',
                color: '#2563eb',
                fontSize: 13,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Torna al login
            </button>
          </form>
        )}

        {!inviteSetup && forgotMode && forgotSent && (
          <div>
            <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>Controlla la tua email</h3>
            <p style={{ marginBottom: 12, fontSize: 13, color: '#6b7280', lineHeight: 1.45 }}>
              Se l&apos;indirizzo <strong>{email.trim()}</strong> è registrato, riceverai a breve un link per
              reimpostare la password. Controlla anche la cartella spam.
            </p>
            <button type="button" className="search-button" onClick={backToLogin}>
              Torna al login
            </button>
          </div>
        )}

        {!inviteSetup && !forgotMode && (
        <form onSubmit={signIn}>
          <div className="input-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: 10,
                borderRadius: 6,
                border: '1px solid #e5e7eb',
              }}
              required
            />
          </div>

          <div className="input-group" style={{ marginTop: 12 }}>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: 10,
                borderRadius: 6,
                border: '1px solid #e5e7eb',
              }}
              required
            />
            <div style={{ marginTop: 8, textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setForgotMode(true)
                }}
                style={{
                  padding: 0,
                  border: 'none',
                  background: 'none',
                  color: '#2563eb',
                  fontSize: 13,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Password dimenticata?
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="search-button"
            style={{ marginTop: 16 }}
            disabled={loading}
          >
            {loading ? '⏳' : 'Accedi'}
          </button>
        </form>
        )}
      </div>
    </div>
  )
}
