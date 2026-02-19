// frontend/src/Search.jsx
import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import './App.css'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'

const API_URL = import.meta.env.VITE_API_URL

export default function Search() {
  const navigate = useNavigate()

  const [domains, setDomains] = useState('')
  const [articles, setArticles] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)

  const [adminChecked, setAdminChecked] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  const [userId, setUserId] = useState(null)

  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [loadingDomains, setLoadingDomains] = useState(false)
  const [exportSaveError, setExportSaveError] = useState(null)
  const [exportSaveOk, setExportSaveOk] = useState(false)

  const TISCALI_REGIONS = [
    'valle-aosta',
    'piemonte',
    'lombardia',
    'trentino-alto-adige',
    'friuli-venezia-giulia',
    'emilia-romagna',
    'veneto',
    'liguria',
    'toscana',
    'umbria',
    'lazio',
    'marche',
    'abruzzo',
    'molise',
    'puglia',
    'campania',
    'basilicata',
    'calabria',
    'sicilia',
    'sardegna',
  ]

  const normalizeUrlJoin = (base, suffix) => {
    const b = String(base || '').replace(/\/+$/, '')
    const s = String(suffix || '').replace(/^\/+/, '')
    return `${b}/${s}`
  }

  const extractTiscaliArticoliSuffix = (url) => {
    if (!url) return null
    const m = String(url).match(/\/articoli\/.+$/)
    return m ? m[0].replace(/^\/+/, '') : null
  }

  useEffect(() => {
    let mounted = true

    const checkAdmin = async () => {
      setAdminChecked(false)

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser()

      if (!mounted) return

      if (userErr || !user) {
        setUserId(null)
        setIsAdmin(false)
        setAdminChecked(true)
        return
      }

      setUserId(user.id)

      // 1) check admin_users
      const { data: adminData, error: adminErr } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!mounted) return

      if (!adminErr && adminData) {
        setIsAdmin(true)
        setAdminChecked(true)
        return
      }

      // 2) check OWNER (project_members)
      const { data: ownerData, error: ownerErr } = await supabase
        .from('project_members')
        .select('project_id')
        .eq('user_id', user.id)
        .eq('role', 'owner')
        .limit(1)
        .maybeSingle()

      if (!mounted) return

      setIsAdmin(!ownerErr && !!ownerData)
      setAdminChecked(true)
    }

    checkAdmin()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const loadMemberProjects = async () => {
      if (!userId) return

      setLoadingProjects(true)
      setError(null)

      const { data: memberRows, error: memErr } = await supabase
        .from('project_members')
        .select('project_id')
        .eq('user_id', userId)

      if (!mounted) return

      if (memErr) {
        setProjects([])
        setSelectedProjectId('')
        setDomains('')
        setLoadingProjects(false)
        setError(memErr.message)
        return
      }

      const ids = (memberRows || []).map((r) => r.project_id).filter(Boolean)

      if (ids.length === 0) {
        setProjects([])
        setSelectedProjectId('')
        setDomains('')
        setLoadingProjects(false)
        return
      }

      const { data: projs, error: projErr } = await supabase
        .from('projects')
        .select('id,name,created_at')
        .in('id', ids)
        .order('created_at', { ascending: false })

      if (!mounted) return

      if (projErr) {
        setProjects([])
        setSelectedProjectId('')
        setDomains('')
        setLoadingProjects(false)
        setError(projErr.message)
        return
      }

      const list = projs || []
      setProjects(list)

      if (!selectedProjectId && list.length > 0) {
        setSelectedProjectId(list[0].id)
      }

      setLoadingProjects(false)
    }

    loadMemberProjects()

    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => {
    let mounted = true

    const loadDomainsFromProject = async () => {
      if (!selectedProjectId) {
        setDomains('')
        return
      }

      setLoadingDomains(true)
      setError(null)

      const { data, error: sitesErr } = await supabase
        .from('project_sites')
        .select('domains')
        .eq('project_id', selectedProjectId)
        .maybeSingle()

      if (!mounted) return

      if (sitesErr) {
        setDomains('')
        setLoadingDomains(false)
        setError(sitesErr.message)
        return
      }

      const list = Array.isArray(data?.domains) ? data.domains : []
      setDomains(list.join('\n'))
      setLoadingDomains(false)
    }

    loadDomainsFromProject()

    return () => {
      mounted = false
    }
  }, [selectedProjectId])

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const normalizeDomain = (domain) => {
    if (!domain) return ''
    let raw = String(domain).trim()

    raw = raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '')
    raw = raw.split('#')[0].split('?')[0]
    raw = raw.replace(/\/+$/g, '')

    const firstSlash = raw.indexOf('/')
    const host = (firstSlash === -1 ? raw : raw.slice(0, firstSlash)).toLowerCase()
    const path = firstSlash === -1 ? '' : raw.slice(firstSlash)

    // keep path only for youtube.com and dailymotion.com
    if (host === 'youtube.com' || host === 'dailymotion.com') {
      return `${host}${path.replace(/\/+$/g, '')}`
    }

    return host
  }

  const parseInput = (input) =>
    input
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

  const handleSearch = async () => {
    if (!selectedProjectId) {
      setError('Seleziona un progetto')
      return
    }

    if (!articles.trim()) {
      setError('Inserisci almeno un articolo')
      return
    }

    if (!domains.trim()) {
      setError('Il progetto selezionato non ha domini salvati.')
      return
    }

    setIsSearching(true)
    setError(null)
    setResults([])
    setProgress(0)

    const domainList = parseInput(domains).map(normalizeDomain).filter((d) => d)
    const articleList = parseInput(articles)

    if (domainList.length === 0 || articleList.length === 0) {
      setError('Inserisci almeno un dominio e un articolo validi')
      setIsSearching(false)
      return
    }

    const totalSearches = domainList.length * articleList.length

    if (totalSearches > 50) {
      const confirmed = window.confirm(
        `Stai per fare ${totalSearches} ricerche.\n\n` +
          `Tempo stimato: ${Math.round((totalSearches * 2) / 60)} minuti.\n\n` +
          `Vuoi continuare?`
      )
      if (!confirmed) {
        setIsSearching(false)
        return
      }
    }

    let completed = 0
    const searchResults = []

    try {
      for (const article of articleList) {
        for (const domain of domainList) {
          try {
            const apiEndpoint = import.meta.env.DEV ? '/api/search' : `${API_URL}/api/search`

            const response = await fetch(apiEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ domain, query: article }),
            })

            const data = await response.json()

            searchResults.push({
              domain,
              article,
              searchQuery: `site:${domain} "${article}"`,
              url: data.url || '',
              title: data.title || '',
              description: data.description || '',
              error: data.error || null,
            })
          } catch (err) {
            searchResults.push({
              domain,
              article,
              searchQuery: `site:${domain} "${article}"`,
              url: '',
              title: '',
              description: '',
              error: err.message,
            })
          }

          completed++
          setProgress(Math.round((completed / totalSearches) * 100))
          setResults([...searchResults])

          await new Promise((resolve) => setTimeout(resolve, 2000))
        }
      }

      setResults(searchResults)
      setExportSaveOk(false)
      setExportSaveError(null)

      // Salvataggio automatico in "Tutte le ricerche" (Storage + tabella)
      if (userId && selectedProjectId && searchResults.length > 0) {
        saveResultsToSupabase(searchResults)
          .then(() => setExportSaveOk(true))
          .catch((err) => setExportSaveError(err?.message || String(err)))
      }
    } catch (err) {
      setError(`Errore durante la ricerca: ${err.message}`)
    } finally {
      setIsSearching(false)
    }
  }

  /** Costruisce XLSX, carica su Storage e inserisce in search_exports (per Tutte le ricerche) */
  async function saveResultsToSupabase(resultsData) {
    const rows = []
    for (const r of resultsData) {
      const normalizeCheckText = (v) => String(v || '').toLowerCase().trim().replace(/\s+/g, ' ')
      const a = normalizeCheckText(r.article)
      const t = normalizeCheckText(r.title)
      const controllo = !t ? '' : t === a || t.includes(a) || a.includes(t) ? '' : 'controllo necessario'
      rows.push({ Dominio: r.domain, Articolo: r.article, 'Query di Ricerca': r.searchQuery, 'Link Articolo': r.url, Titolo: r.title, Controllo: controllo })
      const domainNorm = String(r.domain || '').toLowerCase().trim().replace(/^www\./, '')
      if (domainNorm === 'notizie.tiscali.it' && r.url && !r.error) {
        const suffix = extractTiscaliArticoliSuffix(r.url)
        if (suffix) {
          for (const region of TISCALI_REGIONS) {
            rows.push({
              Dominio: `notizie.tiscali.it/regioni/${region}`,
              Articolo: r.article,
              'Query di Ricerca': r.searchQuery,
              'Link Articolo': normalizeUrlJoin(`https://notizie.tiscali.it/regioni/${region}`, suffix),
              Titolo: r.title,
              Controllo: controllo,
            })
          }
        }
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Risultati')
    const now = new Date()
    const date = now.toISOString().split('T')[0]
    const time = now.toTimeString().slice(0, 5).replace(':', '-')
    const fileName = `AskaNews_Data_${date}_${time}.xlsx`
    const filePath = `${userId}/${Date.now()}_${fileName}`
    // Genera bytes senza ArrayBuffer (evita "Unrecognized type arraybuffer" in alcuni ambienti)
    const binary = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' })
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 0xff
    const uploadBody = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    // Upload via REST API (nessun client Supabase Storage = nessun check su arraybuffer)
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY
    const res = await fetch(`${supabaseUrl}/storage/v1/object/search-exports/${filePath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      body: uploadBody,
    })
    if (!res.ok) {
      const errText = await res.text()
      let errMsg = errText
      try {
        const j = JSON.parse(errText)
        if (j.message) errMsg = j.message
        if (j.error) errMsg = j.error
      } catch (_) {}
      throw new Error(errMsg || `Upload Storage: ${res.status}`)
    }

    const projectName = (projects.find((p) => p.id === selectedProjectId) || {}).name || ''
    const articleCount = new Set(resultsData.map((r) => r.article)).size
    const domainCount = new Set(resultsData.map((r) => r.domain)).size
    const articlesPreview = [...new Set(resultsData.map((r) => r.article))].slice(0, 10).join(', ')
    const domainsPreview = [...new Set(resultsData.map((r) => r.domain))].slice(0, 10).join(', ')
    const searchSummary = (articlesPreview + ' | ' + domainsPreview).slice(0, 500)

    const { error: insertErr } = await supabase.from('search_exports').insert({
      project_id: selectedProjectId,
      user_id: userId,
      project_name: projectName,
      file_name: fileName,
      file_path: filePath,
      article_count: articleCount,
      domain_count: domainCount,
      search_summary: searchSummary,
    })
    if (insertErr) throw new Error(insertErr.message || 'Inserimento tabella fallito')
  }

  const downloadCSV = () => {
    if (results.length === 0) return

    const normalizeCheckText = (value) =>
      String(value || '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')

    const getControllo = (article, title) => {
      const a = normalizeCheckText(article)
      const t = normalizeCheckText(title)
      if (!t) return ''
      if (t === a) return ''
      if (t.includes(a) || a.includes(t)) return ''
      return 'controllo necessario'
    }

    const headers = ['Dominio', 'Articolo', 'Query di Ricerca', 'Link Articolo', 'Titolo', 'Controllo']
    const rows = results.map((r) => [
      r.domain,
      r.article,
      r.searchQuery,
      r.url,
      r.title,
      getControllo(r.article, r.title),
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row
          .map((cell) => {
            const str = String(cell || '')
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`
            }
            return str
          })
          .join(',')
      ),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    const now = new Date()
    const date = now.toISOString().split('T')[0]
    const time = now.toTimeString().slice(0, 5).replace(':', '-')
    link.download = `AskaNews_Data_${date}_${time}.csv`
    link.click()
  }

  const downloadXLSX = () => {
    if (results.length === 0) return

    const rows = []

    for (const r of results) {
      const normalizeCheckText = (value) =>
        String(value || '')
          .toLowerCase()
          .trim()
          .replace(/\s+/g, ' ')
      const a = normalizeCheckText(r.article)
      const t = normalizeCheckText(r.title)
      const controllo =
        !t
          ? ''
          : t === a || t.includes(a) || a.includes(t)
            ? ''
            : 'controllo necessario'

      rows.push({
        Dominio: r.domain,
        Articolo: r.article,
        'Query di Ricerca': r.searchQuery,
        'Link Articolo': r.url,
        Titolo: r.title,
        Controllo: controllo,
      })

      const domainNorm = String(r.domain || '').toLowerCase().trim().replace(/^www\./, '')
      if (domainNorm === 'notizie.tiscali.it' && r.url && !r.error) {
        const suffix = extractTiscaliArticoliSuffix(r.url)
        if (suffix) {
          for (const region of TISCALI_REGIONS) {
            const targetBase = `https://notizie.tiscali.it/regioni/${region}`
            rows.push({
              Dominio: `notizie.tiscali.it/regioni/${region}`,
              Articolo: r.article,
              'Query di Ricerca': r.searchQuery,
              'Link Articolo': normalizeUrlJoin(targetBase, suffix),
              Titolo: r.title,
              Controllo: controllo,
            })
          }
        }
      }
    }

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Risultati')

    const now = new Date()
    const date = now.toISOString().split('T')[0]
    const time = now.toTimeString().slice(0, 5).replace(':', '-')
    const fileName = `AskaNews_Data_${date}_${time}.xlsx`
    XLSX.writeFile(wb, fileName)
    // L'export è già in "Tutte le ricerche" (salvato automaticamente al termine della ricerca)
  }

  const successCount = results.filter((r) => r.url && !r.error).length
  const errorCount = results.filter((r) => r.error).length
  const notFoundCount = results.filter((r) => !r.url && !r.error).length

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <h1>🔍 Boolean Search - Google via ValueSERP</h1>
              <p className="subtitle">Cerca articoli su più domini con ricerca booleana Google</p>
              <p className="info-text">⚡ Ogni ricerca richiede ~1-2 secondi • Powered by ValueSERP</p>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {adminChecked && isAdmin && (
                <a href="/dashboard" className="download-button" style={{ textDecoration: 'none' }}>
                  Dashboard
                </a>
              )}

              <button className="download-button" onClick={logout} disabled={isSearching}>
                Logout
              </button>
            </div>
          </div>
        </header>

        <div className="form-section">
          <div className="input-group">
            <label htmlFor="projectSelect">
              <span className="label-icon">📁</span>
              Progetto
            </label>
            <select
              id="projectSelect"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              disabled={isSearching || loadingProjects}
              style={{ width: '100%', padding: 12, borderRadius: 8 }}
            >
              {projects.length === 0 ? (
                <option value="">{loadingProjects ? 'Caricamento...' : 'Nessun progetto'}</option>
              ) : (
                projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))
              )}
            </select>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <small style={{ margin: 0 }}>{loadingDomains ? 'Caricamento domini...' : 'I domini arrivano dal progetto selezionato.'}</small>
              <a href="/searches" className="search-link" style={{ fontSize: '0.95rem', fontWeight: 500 }}>
                📋 Tutte le ricerche
              </a>
            </div>
          </div>

          {/* Domini visibili solo al TL/Owner */}
          {adminChecked && isAdmin && (
            <div className="input-group">
              <label htmlFor="domains">
                <span className="label-icon">🌐</span>
                Domini (dal progetto)
              </label>
              <textarea id="domains" value={domains} onChange={(e) => setDomains(e.target.value)} rows={8} disabled={true} />
              <small>Per modificarli vai in Dashboard → progetto.</small>
            </div>
          )}

          <div className="input-group">
            <label htmlFor="articles">
              <span className="label-icon">📰</span>
              Titoli Articoli (uno per riga)
            </label>
            <textarea
              id="articles"
              value={articles}
              onChange={(e) => setArticles(e.target.value)}
              placeholder={'contatti\nchi siamo\nprivacy\n...'}
              rows={8}
              disabled={isSearching}
            />
          </div>

          <button
            className="search-button"
            onClick={handleSearch}
            disabled={isSearching || !selectedProjectId || !articles.trim() || loadingDomains}
          >
            {isSearching ? '⏳ Ricerca in corso...' : '🚀 Avvia Ricerca'}
          </button>
        </div>

        {error && <div className="error-message">⚠️ {error}</div>}

        {isSearching && (
          <div className="progress-section">
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${progress}%` }} />
            </div>
            <p className="progress-text">
              {progress}% completato
              {results.length > 0 && ` - ${results.length} ricerche completate`}
            </p>
          </div>
        )}

        {results.length > 0 && (
          <div className="results-section">
            {exportSaveError && (
              <div className="error-message" style={{ marginBottom: 16 }}>
                Salvataggio in Tutte le ricerche non riuscito: {exportSaveError}
              </div>
            )}
            {exportSaveOk && !exportSaveError && (
              <div style={{ marginBottom: 16, padding: 12, background: '#ecfdf5', borderRadius: 8, color: '#065f46' }}>
                ✅ Salvato in Tutte le ricerche. Puoi scaricare l&apos;XLSX da <a href="/searches">Tutte le ricerche</a>.
              </div>
            )}
            <div className="results-header">
              <h2>
                Risultati ({results.length})
                {!isSearching && (
                  <span className="results-stats">
                    <span className="stat-success">✅ {successCount}</span>
                    <span className="stat-error">❌ {errorCount}</span>
                    <span className="stat-notfound">🔍 {notFoundCount}</span>
                  </span>
                )}
              </h2>
              <button className="download-button" onClick={downloadXLSX} disabled={isSearching}>
                📥 Scarica XLSX
              </button>
            </div>

            <div className="results-table-container">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Dominio</th>
                    <th>Articolo</th>
                    <th>Link</th>
                    <th>Titolo</th>
                    <th>Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result, idx) => (
                    <tr key={idx} className={result.error ? 'error-row' : result.url ? 'success-row' : ''}>
                      <td>{result.domain}</td>
                      <td className="article-cell">{result.article}</td>
                      <td>
                        {result.url ? (
                          <a href={result.url} target="_blank" rel="noopener noreferrer">
                            {result.url.length > 50 ? result.url.substring(0, 50) + '...' : result.url}
                          </a>
                        ) : (
                          <span className="no-result">-</span>
                        )}
                      </td>
                      <td className="title-cell">{result.title || '-'}</td>
                      <td>
                        {result.error && <span className="badge badge-error">❌ Errore</span>}
                        {result.url && !result.error && <span className="badge badge-success">✅ Trovato</span>}
                        {!result.url && !result.error && <span className="badge">🔍 Non trovato</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
