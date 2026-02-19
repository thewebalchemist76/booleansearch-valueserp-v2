// frontend/src/Searches.jsx – Tutte le ricerche: tabella con paginazione, filtri, sort, download
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import './App.css'

const PAGE_SIZE = 10
const SORT_ASC = 'asc'
const SORT_DESC = 'desc'

export default function Searches() {
  const navigate = useNavigate()
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [projects, setProjects] = useState([])

  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState(SORT_DESC)
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterProjectId, setFilterProjectId] = useState('')
  const [filterText, setFilterText] = useState('')

  const loadProjects = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: memberRows } = await supabase.from('project_members').select('project_id').eq('user_id', user.id)
    const ids = (memberRows || []).map((r) => r.project_id).filter(Boolean)
    if (ids.length === 0) {
      setProjects([])
      return
    }
    const { data: projs } = await supabase.from('projects').select('id,name').in('id', ids).order('name')
    setProjects(projs || [])
  }, [])

  const loadExports = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let q = supabase
        .from('search_exports')
        .select('*', { count: 'exact', head: true })

      if (filterDateFrom) {
        q = q.gte('created_at', filterDateFrom + 'T00:00:00.000Z')
      }
      if (filterDateTo) {
        q = q.lte('created_at', filterDateTo + 'T23:59:59.999Z')
      }
      if (filterProjectId) {
        q = q.eq('project_id', filterProjectId)
      }
      if (filterText.trim()) {
        q = q.or(`project_name.ilike.%${filterText.trim()}%,search_summary.ilike.%${filterText.trim()}%`)
      }

      const { count: countVal } = await q
      setTotal(countVal ?? 0)

      const from = (page - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      let listQuery = supabase
        .from('search_exports')
        .select('*')
        .order(sortBy, { ascending: sortOrder === SORT_ASC })
        .range(from, to)

      if (filterDateFrom) listQuery = listQuery.gte('created_at', filterDateFrom + 'T00:00:00.000Z')
      if (filterDateTo) listQuery = listQuery.lte('created_at', filterDateTo + 'T23:59:59.999Z')
      if (filterProjectId) listQuery = listQuery.eq('project_id', filterProjectId)
      if (filterText.trim()) listQuery = listQuery.or(`project_name.ilike.%${filterText.trim()}%,search_summary.ilike.%${filterText.trim()}%`)

      const { data, error: err } = await listQuery
      if (err) throw err
      setList(data || [])
    } catch (e) {
      setError(e.message)
      setList([])
    } finally {
      setLoading(false)
    }
  }, [page, sortBy, sortOrder, filterDateFrom, filterDateTo, filterProjectId, filterText])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    loadExports()
  }, [loadExports])

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortOrder((o) => (o === SORT_ASC ? SORT_DESC : SORT_ASC))
    } else {
      setSortBy(col)
      setSortOrder(SORT_DESC)
    }
    setPage(1)
  }

  const handleDownload = async (row) => {
    try {
      const { data, error: err } = await supabase.storage.from('search-exports').createSignedUrl(row.file_path, 120)
      if (err) throw err
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank')
      }
    } catch (e) {
      setError('Download non disponibile: ' + e.message)
    }
  }

  const formatDate = (iso) => {
    if (!iso) return '-'
    const d = new Date(iso)
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1>📋 Tutte le ricerche</h1>
              <p className="subtitle">Elenco degli export generati con download</p>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <a href="/search" className="download-button" style={{ textDecoration: 'none' }}>
                ← Ricerca
              </a>
              <button className="download-button" onClick={() => { supabase.auth.signOut(); navigate('/login', { replace: true }) }}>
                Logout
              </button>
            </div>
          </div>
        </header>

        <div className="form-section" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>Filtri</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.9rem', color: '#6b7280' }}>Da data</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1) }}
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.9rem', color: '#6b7280' }}>A data</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => { setFilterDateTo(e.target.value); setPage(1) }}
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.9rem', color: '#6b7280' }}>Progetto</label>
              <select
                value={filterProjectId}
                onChange={(e) => { setFilterProjectId(e.target.value); setPage(1) }}
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
              >
                <option value="">Tutti</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.9rem', color: '#6b7280' }}>Cerca (progetto / articoli)</label>
              <input
                type="text"
                placeholder="Testo..."
                value={filterText}
                onChange={(e) => { setFilterText(e.target.value); setPage(1) }}
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
            </div>
          </div>
        </div>

        {error && <div className="error-message">⚠️ {error}</div>}

        <div className="results-section">
          {loading ? (
            <p className="progress-text">Caricamento...</p>
          ) : list.length === 0 ? (
            <div className="progress-text">
              <p>Nessuna ricerca salvata. Ogni ricerca completata viene salvata automaticamente.</p>
              <p style={{ marginTop: 12, fontSize: '0.9rem', color: '#6b7280' }}>
                Se hai appena fatto una ricerca e qui è vuoto, sulla pagina Ricerca dovresti vedere un messaggio di errore in rosso sotto i risultati: indica cosa non va (es. tabella o bucket Supabase non creati). Esegui lo script <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>supabase/search_exports_setup.sql</code> in Supabase → SQL Editor.
              </p>
            </div>
          ) : (
            <>
              <div className="results-header">
                <h2>Export ({total})</h2>
              </div>
              <div className="results-table-container">
                <table className="results-table">
                  <thead>
                    <tr>
                      <th onClick={() => handleSort('created_at')} style={{ cursor: 'pointer' }}>
                        Data {sortBy === 'created_at' && (sortOrder === SORT_ASC ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleSort('project_name')} style={{ cursor: 'pointer' }}>
                        Progetto {sortBy === 'project_name' && (sortOrder === SORT_ASC ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleSort('article_count')} style={{ cursor: 'pointer' }}>
                        Articoli {sortBy === 'article_count' && (sortOrder === SORT_ASC ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleSort('domain_count')} style={{ cursor: 'pointer' }}>
                        Domini {sortBy === 'domain_count' && (sortOrder === SORT_ASC ? '↑' : '↓')}
                      </th>
                      <th>File</th>
                      <th>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((row) => (
                      <tr key={row.id}>
                        <td>{formatDate(row.created_at)}</td>
                        <td>{row.project_name || '-'}</td>
                        <td>{row.article_count ?? '-'}</td>
                        <td>{row.domain_count ?? '-'}</td>
                        <td>{row.file_name || '-'}</td>
                        <td>
                          <button
                            type="button"
                            className="download-button"
                            style={{ padding: '6px 12px', fontSize: '0.9rem' }}
                            onClick={() => handleDownload(row)}
                          >
                            📥 Scarica
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
                <span className="progress-text">
                  Pagina {page} di {totalPages} ({total} totali)
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="download-button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ← Precedente
                  </button>
                  <button
                    className="download-button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Successiva →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
