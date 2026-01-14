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
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  const signUp = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div className="form-section">
      <h2 style={{ marginBottom: 12 }}>Login</h2>
      {error && <div className="error-message">⚠️ {error}</div>}

      <form onSubmit={signIn}>
        <div className="input-group">
          <label>Email</label>
          <textarea rows={1} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="input-group">
          <label>Password</label>
          <textarea rows={1} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        <button className="search-button" disabled={loading || !email || !password}>
          {loading ? '⏳ ...' : 'Accedi'}
        </button>

        <button
          type="button"
          className="download-button"
          style={{ marginTop: 12, width: '100%' }}
          onClick={signUp}
          disabled={loading || !email || !password}
        >
          Crea account
        </button>
      </form>
    </div>
  )
}
