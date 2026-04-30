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

  // Messaggero: cerca una volta su ilmessaggero, poi replica lo slug video su tutti i 12 siti
  const MESSAGGERO_BASES = [
    { base: 'https://www.ilmessaggero.it/video', dominio: 'Il Messaggero' },
    { base: 'https://www.ilgazzettino.it/video', dominio: 'Il Gazzettino' },
    { base: 'https://www.ilmattino.it/video', dominio: 'Il Mattino' },
    { base: 'https://www.corriereadriatico.it/video', dominio: 'Corriere Adriatico' },
    { base: 'https://www.quotidianodipuglia.it/video', dominio: 'Quotidiano di Puglia' },
    { base: 'https://www.leggo.it/video', dominio: 'Leggo' },
    { base: 'https://motori.ilmessaggero.it/video', dominio: 'Il Messaggero Motori' },
    { base: 'https://motori.ilgazzettino.it/video', dominio: 'Il Gazzettino Motori' },
    { base: 'https://motori.ilmattino.it/video', dominio: 'Il Mattino Motori' },
    { base: 'https://motori.corriereadriatico.it/video', dominio: 'Corriere Adriatico Motori' },
    { base: 'https://motori.quotidianodipuglia.it/video', dominio: 'Quotidiano di Puglia Motori' },
    { base: 'https://motori.leggo.it/video', dominio: 'Leggo Motori' },
  ]
  const MESSAGGERO_DOMAINS = new Set([
    'ilmessaggero.it',
    'motori.ilmessaggero.it',
    'www.ilmessaggero.it',
    'ilgazzettino.it',
    'motori.ilgazzettino.it',
    'www.ilgazzettino.it',
    'ilmattino.it',
    'motori.ilmattino.it',
    'www.ilmattino.it',
    'corriereadriatico.it',
    'motori.corriereadriatico.it',
    'www.corriereadriatico.it',
    'quotidianodipuglia.it',
    'motori.quotidianodipuglia.it',
    'www.quotidianodipuglia.it',
    'leggo.it',
    'motori.leggo.it',
    'www.leggo.it',
  ])

  // Mappa dominio cercato → base URL (così ilmessaggero.it → www, motori.ilmessaggero.it → motori)
  const MESSAGGERO_DOMAIN_TO_BASE = (() => {
    const map = {}
    for (const { base } of MESSAGGERO_BASES) {
      const host = new URL(base).host
      map[host] = base
      if (host.startsWith('www.')) map[host.replace(/^www\./, '')] = base
    }
    return map
  })()

  // Set clone WP: si cerca solo sul primo (magazine-italia.it), path replicato su tutti i siti
  const CLONE_WP_BASES = [
    { base: 'https://magazine-italia.it', dominio: 'Magazine' },
    { base: 'https://www.forumitalia.info', dominio: 'Forum Italia' },
    { base: 'https://www.investimentinews.it', dominio: 'Investimenti News' },
    { base: 'https://primopiano24.it', dominio: 'Primo Piano 24' },
    { base: 'https://notiziedi.it', dominio: 'Notizie Dì' },
    { base: 'https://accadeora.it', dominio: 'Accade Ora' },
    { base: 'https://www.ondazzurra.com', dominio: 'Onda Azzurra' },
    { base: 'https://ilgiornaleditorino.it', dominio: 'Giornale di Torino' },
    { base: 'https://cronachedimilano.com', dominio: 'Cronache di Milano' },
    { base: 'https://gazzettadigenova.it', dominio: 'Gazzetta di Genova' },
    { base: 'https://venezia24.com', dominio: 'Venezia 24' },
    { base: 'https://cronacheditrentoetrieste.it', dominio: 'Cronache di Trento e Trieste' },
    { base: 'https://ilcorrieredibologna.it', dominio: 'Corriere di Bologna' },
    { base: 'https://corrierediancona.it', dominio: 'Corriere di Ancona' },
    { base: 'https://ilcorrieredifirenze.it', dominio: 'Corriere di Firenze' },
    { base: 'https://notiziarioflegreo.it', dominio: 'Notiziario Flegreo' },
    { base: 'https://cronachediabruzzoemolise.it', dominio: 'Cronache di Abruzzo e Molise' },
    { base: 'https://cittadi.it', dominio: 'Città Dì' },
    { base: 'http://cronachedelmezzogiorno.it', dominio: 'Cronache del Mezzogiorno' },
    { base: 'https://cronachedibari.com', dominio: 'Cronache di Bari' },
    { base: 'https://cronachedellacalabria.it', dominio: 'Cronache della Calabria' },
    { base: 'https://lacittadiroma.it', dominio: 'La Città di Roma' },
    { base: 'https://www.giovannilucianelli.it', dominio: 'Buone Notizie da Napoli' },
    { base: 'https://campaniapress.it', dominio: 'Campania press' },
    { base: 'https://corrieredipalermo.it', dominio: 'Corriere di Palermo' },
    { base: 'https://corrieredellasardegna.it', dominio: 'Corriere della Sardegna' },
    { base: 'https://corriereflegreo.it', dominio: 'Corriere Flegreo' },
    { base: 'https://cittadinapoli.com', dominio: 'Città di Napoli' },
    { base: 'http://www.radionapolicentro.it', dominio: 'Radio Napoli Centro' },
    { base: 'https://comunicazionenazionale.it', dominio: 'Comunicazione Nazionale' },
    { base: 'https://appianews.it', dominio: 'Appia News' },
  ]
  const CLONE_WP_DOMAINS = new Set(
    CLONE_WP_BASES.flatMap(({ base }) => {
      const host = new URL(base).host
      const norm = host.replace(/^www\./, '')
      return [host, norm]
    })
  )
  const CLONE_WP_FIRST_DOMAIN = (() => {
    const u = new URL(CLONE_WP_BASES[0].base)
    return u.host.replace(/^www\./, '')
  })()

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

  /** Da URL Messaggero (es. motori.ilmessaggero.it/video/askanews/xxx-9128431.html) estrae lo slug "xxx-9128431.html" da appendere a base/video/ */
  const extractMessaggeroVideoSlug = (url) => {
    if (!url) return null
    const m = String(url).match(/\/video\/(?:askanews\/)?(.+)$/i)
    return m ? m[1].replace(/^\/+/, '') : null
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
    // Rimuovi solo protocollo e www. — NON togliere mai "motori." (set Messaggero: motori.ilmessaggero.it, motori.leggo.it, ecc.)
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

    let domainList = parseInput(domains).map(normalizeDomain).filter((d) => d)
    // Messaggero: un solo dominio in lista = una sola chiamata API, poi in export 12 righe
    const messaggeroInList = domainList.filter((d) => MESSAGGERO_DOMAINS.has(d))
    const cloneWpInList = domainList.filter((d) => CLONE_WP_DOMAINS.has(d))
    const otherDomains = domainList.filter(
      (d) => !MESSAGGERO_DOMAINS.has(d) && !CLONE_WP_DOMAINS.has(d)
    )
    const singleMessaggero = messaggeroInList.length > 0 ? [messaggeroInList[0]] : []
    const singleCloneWp = cloneWpInList.length > 0 ? [CLONE_WP_FIRST_DOMAIN] : []
    domainList = [...otherDomains, ...singleMessaggero, ...singleCloneWp]

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
            let urlToStore = data.url || ''
            if (MESSAGGERO_DOMAINS.has(domain) && data.url) {
              const slug = extractMessaggeroVideoSlug(data.url)
              const base = MESSAGGERO_DOMAIN_TO_BASE[domain]
              if (slug && base) urlToStore = normalizeUrlJoin(base, slug)
            }

            searchResults.push({
              domain,
              article,
              searchQuery: `site:${domain} "${article}"`,
              url: urlToStore,
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
      const normalizeCheckText = (v) =>
        String(v || '')
          .toLowerCase()
          // decode common HTML entities (es. dell&#039;acciaio)
          .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
          .replace(/&quot;/gi, '"')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          // normalizza accenti e apostrofi “smart” (’ vs ')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[’‘`´]/g, "'")
          .trim()
          .replace(/\s+/g, ' ')
          .replace(/\s*:\s*/g, ' ')
          .replace(/\s+/g, ' ')
      const a = normalizeCheckText(r.article)
      const t = normalizeCheckText(r.title)
      const controllo = !t ? '' : t === a || t.includes(a) || a.includes(t) ? '' : 'controllo necessario'
      const domainNorm = String(r.domain || '').toLowerCase().trim().replace(/^www\./, '')
      const isCloneWp = CLONE_WP_DOMAINS.has(domainNorm) && r.url && !r.error
      let cloneWpPath = null
      if (isCloneWp) {
        try {
          cloneWpPath = new URL(r.url).pathname || ''
        } catch (_) {}
      }
      const isMessaggero = MESSAGGERO_DOMAINS.has(domainNorm) && r.url && !r.error
      const messaggeroSlug = isMessaggero ? extractMessaggeroVideoSlug(r.url) : null

      if (isCloneWp && cloneWpPath) {
        // Clone WP: una ricerca sul primo sito, path replicato su tutti i 31
        for (const { base, dominio } of CLONE_WP_BASES) {
          const baseClean = base.replace(/\/+$/, '')
          const path = cloneWpPath.startsWith('/') ? cloneWpPath : `/${cloneWpPath}`
          const dominioHost = new URL(base).host.replace(/^www\./, '')
          rows.push({
            Sito: dominio,
            Dominio: dominioHost,
            Articolo: r.article,
            'Link Articolo': `${baseClean}${path}`,
            Titolo: r.title,
            Controllo: controllo,
          })
        }
      } else if (isMessaggero && messaggeroSlug) {
        // Messaggero: solo le 12 righe canoniche (nessuna riga "originale" duplicata)
        for (const { base, dominio } of MESSAGGERO_BASES) {
          const dominioHost = new URL(base).host.replace(/^www\./, '')
          rows.push({
            Sito: dominio,
            Dominio: dominioHost,
            Articolo: r.article,
            'Link Articolo': normalizeUrlJoin(base, messaggeroSlug),
            Titolo: r.title,
            Controllo: controllo,
          })
        }
      } else {
        rows.push({ Sito: r.domain, Dominio: domainNorm || r.domain, Articolo: r.article, 'Link Articolo': r.url, Titolo: r.title, Controllo: controllo })
        if (domainNorm === 'notizie.tiscali.it' && r.url && !r.error) {
          const suffix = extractTiscaliArticoliSuffix(r.url)
          if (suffix) {
            for (const region of TISCALI_REGIONS) {
              rows.push({
                Sito: `notizie.tiscali.it/regioni/${region}`,
                Dominio: 'notizie.tiscali.it',
                Articolo: r.article,
                'Link Articolo': normalizeUrlJoin(`https://notizie.tiscali.it/regioni/${region}`, suffix),
                Titolo: r.title,
                Controllo: controllo,
              })
            }
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
    const fileName = `AskaNews_${date}_${time}.xlsx`
    const filePath = `${userId}/${fileName}`
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
        .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[’‘`´]/g, "'")
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\s*:\s*/g, ' ')
        .replace(/\s+/g, ' ')

    const getControllo = (article, title) => {
      const a = normalizeCheckText(article)
      const t = normalizeCheckText(title)
      if (!t) return ''
      if (t === a) return ''
      if (t.includes(a) || a.includes(t)) return ''
      return 'controllo necessario'
    }

    const headers = ['Sito', 'Dominio', 'Articolo', 'Link Articolo', 'Titolo', 'Controllo']
    const rows = results.map((r) => {
      const domainNorm = String(r.domain || '').toLowerCase().trim().replace(/^www\./, '')
      return [
        r.domain,
        domainNorm || r.domain,
        r.article,
        r.url,
        r.title,
        getControllo(r.article, r.title),
      ]
    })

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
    link.download = `AskaNews_${date}_${time}.csv`
    link.click()
  }

  const downloadXLSX = () => {
    if (results.length === 0) return

    const rows = []

    for (const r of results) {
      const normalizeCheckText = (value) =>
        String(value || '')
          .toLowerCase()
          .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
          .replace(/&quot;/gi, '"')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[’‘`´]/g, "'")
          .trim()
          .replace(/\s+/g, ' ')
          .replace(/\s*:\s*/g, ' ')
          .replace(/\s+/g, ' ')
      const a = normalizeCheckText(r.article)
      const t = normalizeCheckText(r.title)
      const controllo =
        !t
          ? ''
          : t === a || t.includes(a) || a.includes(t)
            ? ''
            : 'controllo necessario'

      const domainNorm = String(r.domain || '').toLowerCase().trim().replace(/^www\./, '')
      const isCloneWp = CLONE_WP_DOMAINS.has(domainNorm) && r.url && !r.error
      let cloneWpPath = null
      if (isCloneWp) {
        try {
          cloneWpPath = new URL(r.url).pathname || ''
        } catch (_) {}
      }
      const isMessaggero = MESSAGGERO_DOMAINS.has(domainNorm) && r.url && !r.error
      const messaggeroSlug = isMessaggero ? extractMessaggeroVideoSlug(r.url) : null

      if (isCloneWp && cloneWpPath) {
        for (const { base, dominio } of CLONE_WP_BASES) {
          const baseClean = base.replace(/\/+$/, '')
          const path = cloneWpPath.startsWith('/') ? cloneWpPath : `/${cloneWpPath}`
          const dominioHost = new URL(base).host.replace(/^www\./, '')
          rows.push({
            Sito: dominio,
            Dominio: dominioHost,
            Articolo: r.article,
            'Link Articolo': `${baseClean}${path}`,
            Titolo: r.title,
            Controllo: controllo,
          })
        }
      } else if (isMessaggero && messaggeroSlug) {
        for (const { base, dominio } of MESSAGGERO_BASES) {
          const dominioHost = new URL(base).host.replace(/^www\./, '')
          rows.push({
            Sito: dominio,
            Dominio: dominioHost,
            Articolo: r.article,
            'Link Articolo': normalizeUrlJoin(base, messaggeroSlug),
            Titolo: r.title,
            Controllo: controllo,
          })
        }
      } else {
        rows.push({
          Sito: r.domain,
          Dominio: domainNorm || r.domain,
          Articolo: r.article,
          'Link Articolo': r.url,
          Titolo: r.title,
          Controllo: controllo,
        })
        if (domainNorm === 'notizie.tiscali.it' && r.url && !r.error) {
          const suffix = extractTiscaliArticoliSuffix(r.url)
          if (suffix) {
            for (const region of TISCALI_REGIONS) {
              const targetBase = `https://notizie.tiscali.it/regioni/${region}`
              rows.push({
                Sito: `notizie.tiscali.it/regioni/${region}`,
                Dominio: 'notizie.tiscali.it',
                Articolo: r.article,
                'Link Articolo': normalizeUrlJoin(targetBase, suffix),
                Titolo: r.title,
                Controllo: controllo,
              })
            }
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
    const fileName = `AskaNews_${date}_${time}.xlsx`
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
