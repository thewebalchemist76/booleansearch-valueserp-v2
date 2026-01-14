// frontend/src/Dashboard.jsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from './supabaseClient'

function normalizeDomains(input) {
  const lines = (input || '')
    .split(/\r?\n|,|;/g)
    .map((s) => s.trim())
    .filter(Boolean)

  const cleaned = lines
    .map((raw) => raw.toLowerCase())
    .map((raw) => raw.replace(/^[\s"'`]+|[\s"'`]+$/g, ''))
    .map((raw) => raw.replace(/^https?:\/\//, ''))
    .map((raw) => raw.replace(/^www\./, ''))
    .map((raw) => raw.split('/')[0])
    .map((raw) => raw.split('?')[0])
    .map((raw) => raw.split('#')[0])
    .map((raw) => raw.replace(/:\d+$/, ''))
    .filter((d) => d && d.includes('.'))
    .map((d) => d.replace(/\.$/, ''))

  return Array.from(new Set(cleaned))
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { projectId } = useParams()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [projects, setProjects] = useState([])
  const [newProjectName, setNewProjectName] = useState('')

  const [isAdmin, setIsAdmin] = useState(false)
  const [adminChecked, setAdminChecked] = useState(false)

  const [selectedProjectId, setSelectedProjectId] = useState(projectId || null)
  const [domainsText, setDomainsText] = useState('')
  const [sitesRowId, setSitesRowId] = useState(null)
  const [domainsLoading, setDomainsLoading] = useState(false)

  const canCreate = useMemo(() => adminChecked && isAdmin, [adminChecked, isAdmin])

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
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

  const openProject = (id) => {
    setSelectedProjectId(id)
    navigate(`/dashboard/${id}`, { replace: true })
  }

  const loadDomainsForProject = async (pid) => {
    if (!pid) return
    setDomainsLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('project_sites')
      .select('project_id,domains')
      .eq('project_id', pid)
      .maybeSingle()

    if (error) {
      setDomainsLoading(false)
      setSitesRowId(null)
      setDomainsText('')
      setError(error.message)
      return
    }

    // Se non esiste, crealo
    if (!data) {
      const { data: created, error: insErr } = await supabase
        .from('project_sites')
        .insert([{ project_id: pid, domains: [] }])
        .select('project_id,domains')
        .maybeSingle()

      if (insErr) {
        setDomainsLoading(false)
        setSitesRowId(null)
        setDomainsText('')
        setError(insErr.message)
        return
      }

      setSitesRowId(created?.project_id ?? pid)
      setDomainsText('')
      setDomainsLoading(false)
      return
    }

    setSitesRowId(data.project_id ?? pid)
    const domains = Array.isArray(data.domains) ? data.domains : []
    setDomainsText(domains.join('\n'))
    setDomainsLoading(false)
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

  useEffect(() => {
    if (!adminChecked) return
    if (!isAdmin) return
    if (!selectedProjectId) return
    loadDomainsForProject(selectedProjectId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminChecked, isAdmin, selectedProjectId])

  useEffect(() => {
    if (projectId && projectId !== selectedProjectId) {
      setSelectedProjectId(projectId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

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
    openProject(project.id)
    setSaving(false)
  }

  const saveDomains = async () => {
    if (!isAdmin) return
    if (!selectedProjectId) {
      setError('Seleziona un progetto.')
      return
    }

    setSaving(true)
    setError(null)

    const domains = normalizeDomains(domainsText)

    // se non c'è row, creala (project_sites PK = project_id)
    const { error: upsertErr } = await supabase
      .from('project_sites')
      .upsert([{ project_id: selectedProjectId, domains }], { onConflict: 'project_id' })

    if (upsertErr) {
      setSaving(false)
      setError(upsertErr.message)
      return
    }

    setSitesRowId(selectedProjectId)
    setDomainsText(domains.join('\n'))
    setSaving(false)
  }

  const deleteProject = async () => {
    if (!isAdmin) return
    if (!selectedProjectId) {
      setError('Seleziona un progetto.')
      return
    }

    const proj = projects.find((p) => p.id === selectedProjectId)
    const label = proj?.name ? ` "${proj.name}"` : ''
    const ok = window.confirm(`Eliminare il progetto${label}? Questa azione è irreversibile.`)
    if (!ok) return

    setSaving(true)
    setError(null)

    const { error } = await supabase.from('projects').delete().eq('id', selectedProjectId)
    if (error) {
      setSaving(false)
      setError(error.message)
      return
    }

    setSelectedProjectId(null)
    setSitesRowId(null)
    setDomainsText('')
    navigate('/dashboard', { replace: true })

    await loadProjects()
    setSaving(false)
  }

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

  if (!isAdmin) {
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
            <div className="progress-section" style={{ marginBottom: 20 }}>
              <p className="progress-text">Accesso limitato: non puoi gestire i progetti.</p>
            </div>
            <button className="search-button" onClick={() => navigate('/search', { replace: true })}>
              Vai alla ricerca
            </button>
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

          {loading ? (
            <p>Caricamento...</p>
          ) : projects.length === 0 ? (
            <p>Nessun progetto trovato.</p>
          ) : (
            <div className="results-table-container" style={{ marginBottom: 18 }}>
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Nome progetto</th>
                    <th>Creato</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr
                      key={p.id}
                      className="success-row"
                      style={{ cursor: 'pointer', opacity: saving ? 0.7 : 1 }}
                      onClick={() => !saving && openProject(p.id)}
                    >
                      <td>
                        {p.name}
                        {selectedProjectId === p.id ? ' (selezionato)' : ''}
                      </td>
                      <td>{new Date(p.created_at).toLocaleString('it-IT')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Dettaglio progetto: DOMINI (solo TL/Admin) */}
          {selectedProjectId && (
            <div className="form-section" style={{ marginTop: 10 }}>
              <div className="results-header" style={{ marginBottom: 10 }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Domini del progetto</h3>
                <button
                  className="download-button"
                  onClick={deleteProject}
                  disabled={saving}
                  title="Elimina progetto"
                >
                  🗑️ Elimina
                </button>
              </div>

              <div className="input-group" style={{ marginBottom: 10 }}>
                <label htmlFor="domains">Inserisci un dominio per riga</label>
                <textarea
                  id="domains"
                  value={domainsText}
                  onChange={(e) => setDomainsText(e.target.value)}
                  disabled={saving || domainsLoading}
                  rows={10}
                  style={{
                    width: '100%',
                    padding: 12,
                    border: '2px solid #e5e7eb',
                    borderRadius: 8,
                    fontSize: '0.95rem',
                    resize: 'vertical',
                  }}
                />
                <small>
                  Verranno ripuliti automaticamente: http/https, www, path, query, porte. Duplicati rimossi.
                </small>
              </div>

              <button className="search-button" onClick={saveDomains} disabled={saving || domainsLoading}>
                {saving ? '⏳ Salvataggio...' : '💾 Salva domini'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
