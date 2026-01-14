import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

export default function Dashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [projects, setProjects] = useState([])
  const [newProjectName, setNewProjectName] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminChecked, setAdminChecked] = useState(false)

  const canCreate = useMemo(() => adminChecked && isAdmin, [adminChecked, isAdmin])

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const loadProjects = async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('id,name,created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      setProjects([])
      return
    }

    setProjects(data || [])
  }

  const checkAdmin = async () => {
    setAdminChecked(false)

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()

    if (userErr || !user) {
      setIsAdmin(false)
      setAdminChecked(true)
      return
    }

    const { data, error } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      setIsAdmin(false)
      setAdminChecked(true)
      return
    }

    setIsAdmin(!!data)
    setAdminChecked(true)
  }

  useEffect(() => {
    let mounted = true

    const init = async () => {
      if (!mounted) return
      setLoading(true)
      setError(null)

      await checkAdmin()
      await loadProjects()

      if (!mounted) return
      setLoading(false)
    }

    init()

    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const createProject = async (e) => {
    e.preventDefault()

    if (!canCreate) {
      setError('Non hai i permessi per creare progetti.')
      return
    }

    const name = newProjectName.trim()
    if (!name) {
      setError('Inserisci un nome progetto')
      return
    }

    setSaving(true)
    setError(null)

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()

    if (userErr || !user) {
      setSaving(false)
      setError('Sessione non valida. Effettua di nuovo il login.')
      navigate('/login', { replace: true })
      return
    }

    const { data: createdProjects, error: createErr } = await supabase
      .from('projects')
      .insert([{ name, created_by: user.id }])
      .select('id,name,created_at')
      .limit(1)

    if (createErr) {
      setSaving(false)
      setError(createErr.message)
      return
    }

    const project = createdProjects?.[0]
    if (!project?.id) {
      setSaving(false)
      setError('Errore: progetto non creato correttamente')
      return
    }

    const { error: memberErr } = await supabase
      .from('project_members')
      .insert([{ project_id: project.id, user_id: user.id, role: 'owner' }])

    if (memberErr) {
      setSaving(false)
      setError(memberErr.message)
      return
    }

    const { error: sitesErr } = await supabase
      .from('project_sites')
      .insert([{ project_id: project.id, domains: [] }])

    if (sitesErr) {
      setSaving(false)
      setError(sitesErr.message)
      return
    }

    setNewProjectName('')
    await loadProjects()
    setSaving(false)
  }

  // IMPORTANT: finché non abbiamo verificato admin, non renderizzare il contenuto
  if (!adminChecked) {
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
            <p>Caricamento...</p>
          </div>
        </div>
      </div>
    )
  }

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

          {!isAdmin && (
            <div className="progress-section" style={{ marginBottom: 20 }}>
              <p className="progress-text">Accesso limitato: non puoi creare progetti.</p>
            </div>
          )}

          {isAdmin && (
            <div className="form-section" style={{ marginBottom: 20 }}>
              <div className="input-group" style={{ marginBottom: 12 }}>
                <label htmlFor="projectName">Nuovo progetto</label>
                <input
                  id="projectName"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  disabled={saving}
                  style={{
                    width: '100%',
                    padding: 12,
                    border: '2px solid #e5e7eb',
                    borderRadius: 8,
                    fontSize: '0.95rem',
                  }}
                />
                <small>Il progetto sarà visibile solo ai membri autorizzati.</small>
              </div>

              <button
                className="search-button"
                onClick={createProject}
                disabled={saving || !newProjectName.trim()}
              >
                {saving ? '⏳ Creazione...' : '➕ Crea progetto'}
              </button>
            </div>
          )}

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
