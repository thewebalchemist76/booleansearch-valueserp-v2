// frontend/src/Login.jsx
import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

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

  const signUp = async () => {
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setError(error.message)
    } else {
      setError('Account creato. Ora puoi accedere.')
    }

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

        <button
          onClick={signUp}
          className="download-button"
          style={{ marginTop: 12, width: '100%' }}
          disabled={loading}
        >
          Crea account
        </button>
      </div>
    </div>
  )
}
