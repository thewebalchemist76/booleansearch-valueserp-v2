import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [projects, setProjects] = useState([])

  const logout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  useEffect(() => {
    let mounted = true

    const load = async () => {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase
        .from('projects')
        .select('id,name,created_at')
        .order('created_at', { ascending: false })

      if (!mounted) return

      if (error) {
        setError(error.message)
        setProjects([])
      } else {
        setProjects(data || [])
      }

      setLoading(false)
    }

    load()

    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="app">
      <div className="container">
        <div className="results-section">
          <div className="results-header">
            <h2>Dashboard</h2>
            <button className="download-button" onClick={logout}>
              Logout
            </button>
          </div>

          {error && <div className="error-message">⚠️ {error}</div>}

          {loading ? (
            <p>Caricamento...</p>
          ) : projects.length === 0 ? (
            <p>Nessun progetto trovato.</p>
          ) : (
            <div className="results-table-container">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Nome progetto</th>
                    <th>Creato</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id} className="success-row">
                      <td>{p.name}</td>
                      <td>{new Date(p.created_at).toLocaleString('it-IT')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
