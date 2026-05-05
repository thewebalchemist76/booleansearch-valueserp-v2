// frontend/src/Login.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

const PENDING_INVITE_KEY = 'pending_invite_password'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  /** Dopo click sul link invito: sessione creata da hash; qui si imposta la password per i login futuri */
  const [inviteSetup, setInviteSetup] = useState(false)
  const [invitePw, setInvitePw] = useState('')
  const [invitePw2, setInvitePw2] = useState('')
  const [inviteSaving, setInviteSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const qs0 = new URLSearchParams(window.location.search)
      const forceSetup = qs0.get('setup') === '1'

      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(PENDING_INVITE_KEY) === '1') {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (cancelled) return
        if (session?.user) {
          setInviteSetup(true)
          return
        }
        sessionStorage.removeItem(PENDING_INVITE_KEY)
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
            sessionStorage.setItem(PENDING_INVITE_KEY, '1')
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
      if (session?.user && (pendingInvite || forceSetup)) {
        sessionStorage.setItem(PENDING_INVITE_KEY, '1')
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

    sessionStorage.removeItem(PENDING_INVITE_KEY)
    navigate('/search', { replace: true })
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
            <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>Imposta password</h3>
            <p style={{ marginBottom: 12, fontSize: 13, color: '#6b7280', lineHeight: 1.45 }}>
              Scegli una password per entrare anche dalla pagina Login nei prossimi accessi.
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
              {inviteSaving ? '⏳' : 'Salva password e continua'}
            </button>
          </form>
        )}

        {!inviteSetup && (
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
