// frontend/src/Login.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (cancelled) return
      if (session?.user) {
        navigate('/search', { replace: true })
        return
      }

      const hash = window.location.hash.replace(/^#/, '')
      if (hash) {
        const p = new URLSearchParams(hash)
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

  const signIn = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) setError(error.message)
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
          Se hai ricevuto un invito, usa il link nell&apos;email oppure accedi qui dopo aver impostato la password.
        </p>

        {error && (
          <div className="error-message" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

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
      </div>
    </div>
  )
}
