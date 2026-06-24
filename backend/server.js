const express = require('express');
const cors = require('cors');
const https = require('https');
const fetch = require('node-fetch');
const { getJson } = require('serpapi');

// Agent che ignora verifica SSL (solo per siti con catena certificati non riconosciuta da Node su Render, es. cittadino.ca)
const noVerifyHttpsAgent = new https.Agent({ rejectUnauthorized: false });

const app = express();
const PORT = process.env.PORT || 10000;
const VALUESERP_KEY = process.env.VALUESERP_KEY || '';
const SERPAPI_KEY = process.env.SERPAPI_KEY || '';

// Middleware
app.use(cors());
app.use(express.json());

function isMsnDomain(domain) {
  const d = (domain || '').toLowerCase().trim().replace(/^www\./, '');
  const host = d.split('/')[0] || '';
  return host === 'msn.com' || host.endsWith('.msn.com');
}

function isQuotidianoDomain(domain) {
  const host = normalizeDomainForChecks(domain).split('/')[0] || '';
  return host === 'quotidiano.net' || host.endsWith('.quotidiano.net');
}

function isLiberoDomain(domain) {
  const host = normalizeDomainForChecks(domain).split('/')[0] || '';
  return host === 'libero.it' || host.endsWith('.libero.it');
}

function isLospecialeDomain(domain) {
  const host = normalizeDomainForChecks(domain).split('/')[0] || '';
  return host === 'lospecialegiornale.it';
}

function isIlTempoDomain(domain) {
  const host = normalizeDomainForChecks(domain).split('/')[0] || '';
  return host === 'iltempo.it';
}

function buildValueSerpGoogleComItUrl(q) {
  return `https://api.valueserp.com/search?api_key=${VALUESERP_KEY}&q=${encodeURIComponent(q)}&engine=google&hl=it&google_domain=google.com&num=10`;
}

function buildValueSerpMinimalUrl(q) {
  return `https://api.valueserp.com/search?api_key=${VALUESERP_KEY}&q=${encodeURIComponent(q)}&engine=google`;
}

function buildValueSerpLospecialeUrl(q) {
  return `https://api.valueserp.com/search?api_key=${VALUESERP_KEY}&q=${encodeURIComponent(q)}&engine=google&device=desktop`;
}

async function searchValueSerp(valueSerpQuery, originalQuery, { googleComIt = false, minimal = false } = {}) {
  if (!VALUESERP_KEY) {
    return { error: 'ValueSERP key non configurata' };
  }

  const label = minimal ? 'ValueSERP minimal' : googleComIt ? 'ValueSERP google.com/it' : 'ValueSERP';
  console.log(`🔍 Searching (${label}): ${valueSerpQuery}`);

  const valueSerpUrl = minimal
    ? buildValueSerpMinimalUrl(valueSerpQuery)
    : googleComIt
      ? buildValueSerpGoogleComItUrl(valueSerpQuery)
      : `https://api.valueserp.com/search?api_key=${VALUESERP_KEY}&q=${encodeURIComponent(valueSerpQuery)}&engine=google&hl=en&num=10`;

  const response = await fetch(valueSerpUrl);
  if (!response.ok) {
    return { error: `Errore ValueSERP: HTTP ${response.status}` };
  }

  const data = await response.json();
  if (data.request_info && data.request_info.success === false) {
    return { error: `Errore ValueSERP: ${data.request_info.message || 'Unknown error'}` };
  }

  const results = parseValueSERPResults(data, originalQuery);
  if (results.length > 0) {
    return { result: results[0] };
  }
  return { empty: true };
}

function serpApiGetJson(params) {
  return new Promise((resolve) => {
    getJson(params, (json) => resolve(json));
  });
}

/** Bing via SerpApi (MSN + siti dove ValueSERP/Google API spesso vuoto) */
async function searchSerpApiBing(bingQuery, originalQuery) {
  if (!SERPAPI_KEY) {
    return { error: 'SerpApi key non configurata (necessaria per questo dominio)' };
  }

  console.log(`🔍 Searching (Bing/SerpApi): ${bingQuery}`);

  const data = await serpApiGetJson({
    engine: 'bing',
    q: bingQuery,
    cc: 'IT',
    api_key: SERPAPI_KEY,
  });

  if (data && data.error) {
    console.error(`❌ SerpApi error: ${data.error}`);
    return { error: `Errore SerpApi: ${data.error}` };
  }

  const results = parseValueSERPResults(data, originalQuery);
  if (results.length > 0) {
    const best = results[0];
    console.log(`✅ Found (Bing/SerpApi): ${best.url}`);
    return { result: best };
  }

  console.log('⚠️ No results found (Bing/SerpApi)');
  return { empty: true };
}

/** Google via SerpApi (fallback quando ValueSERP è vuoto) */
async function searchSerpApiGoogle(googleQuery, originalQuery) {
  if (!SERPAPI_KEY) {
    return { error: 'SerpApi key non configurata' };
  }

  console.log(`🔍 Searching (Google/SerpApi): ${googleQuery}`);

  const data = await serpApiGetJson({
    engine: 'google',
    q: googleQuery,
    google_domain: 'google.com',
    hl: 'it',
    gl: 'it',
    api_key: SERPAPI_KEY,
  });

  if (data && data.error) {
    return { error: `Errore SerpApi: ${data.error}` };
  }

  const results = parseValueSERPResults(data, originalQuery);
  if (results.length > 0) {
    console.log(`✅ Found (Google/SerpApi): ${results[0].url}`);
    return { result: results[0] };
  }
  return { empty: true };
}

// --- Dailymotion owners (search only within these channels) ---
const DAILYMOTION_ALLOWED_OWNERS = new Set(['askanews', 'quotidianonazionale']);

// --- WP internal-search domains (not reliably indexed on Google/Bing) ---
// Set "clone": stesso contenuto WP, si cerca solo sul primo (magazine-italia.it), path replicato su tutti
const WP_INTERNAL_SEARCH_DOMAINS = new Set([
  'magazine-italia.it',
  'forumitalia.info',
  'investimentinews.it',
  'primopiano24.it',
  'notiziedi.it',
  'accadeora.it',
  'ondazzurra.com',
  'ilgiornaleditorino.it',
  'cronachedimilano.com',
  'gazzettadigenova.it',
  'venezia24.com',
  'cronacheditrentoetrieste.it',
  'ilcorrieredibologna.it',
  'corrierediancona.it',
  'ilcorrieredifirenze.it',
  'notiziarioflegreo.it',
  'cronachediabruzzoemolise.it',
  'cittadi.it',
  'cronachedelmezzogiorno.it',
  'cronachedibari.com',
  'cronachedellacalabria.it',
  'lacittadiroma.it',
  'giovannilucianelli.it',
  'campaniapress.it',
  'corrieredipalermo.it',
  'corrieredellasardegna.it',
  'corriereflegreo.it',
  'cittadinapoli.com',
  'radionapolicentro.it',
  'comunicazionenazionale.it',
  'appianews.it',
  'cittadino.ca',
]);

function normalizeDomainForChecks(domain) {
  // Rimuovi solo protocollo e www. — NON togliere mai "motori." (set Messaggero)
  let d = String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/g, '')
    .replace(/\.\*$/g, '')
    .replace(/\*$/g, '')
    .replace(/\.$/g, '');

  const slash = d.indexOf('/');
  const host = slash === -1 ? d : d.slice(0, slash);
  const path = slash === -1 ? '' : d.slice(slash);
  let hostNorm = host;
  if (host === 'ilsole24ore.com' || host.endsWith('.ilsole24ore.com')) hostNorm = 'ilsole24ore.com';
  else if (host === 'lanazione.it' || host.endsWith('.lanazione.it')) hostNorm = 'lanazione.it';
  else if (host === 'quotidiano.net' || host.endsWith('.quotidiano.net')) hostNorm = 'quotidiano.net';
  return hostNorm + path;
}

function isWpInternalDomain(domain) {
  const d = normalizeDomainForChecks(domain);
  return WP_INTERNAL_SEARCH_DOMAINS.has(d);
}

function parseDailymotionOwner(domain) {
  // domain can be "dailymotion.com/askanews" (frontend keeps path for dailymotion.com)
  const d = normalizeDomainForChecks(domain);
  if (!d.startsWith('dailymotion.com/')) return null;
  const owner = d.split('/')[1] || '';
  return DAILYMOTION_ALLOWED_OWNERS.has(owner) ? owner : null;
}

function normalizeLooseTitle(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // normalize smart quotes/apostrophes and punctuation to spaces
    .replace(/[’'“”"]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function scoreTitleMatch(query, candidate) {
  const q = normalizeLooseTitle(query);
  const c = normalizeLooseTitle(candidate);
  if (!q || !c) return 0;
  if (c === q) return 1000;
  // token overlap score
  const qt = new Set(q.split(' ').filter(Boolean));
  const ct = new Set(c.split(' ').filter(Boolean));
  let overlap = 0;
  for (const t of qt) if (ct.has(t)) overlap++;
  const ratio = overlap / Math.max(1, qt.size);
  // bonus if candidate contains full query substring
  const containsBonus = c.includes(q) ? 0.2 : 0;
  return Math.round((ratio + containsBonus) * 1000);
}

async function searchDailymotionByOwner(owner, query) {
  // Public data endpoint (no auth required for public videos):
  // https://api.dailymotion.com/videos?owners=<owner>&search=<query>&fields=id,title,url&limit=...
  const url =
    `https://api.dailymotion.com/videos` +
    `?owners=${encodeURIComponent(owner)}` +
    `&search=${encodeURIComponent(query)}` +
    `&fields=id,title,url` +
    `&sort=relevance` +
    `&limit=10`;

  const res = await fetchWithTimeout(url, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' } }, 9000);
  if (!res || !res.ok) return null;
  const json = await res.json();
  const list = Array.isArray(json.list) ? json.list : [];
  if (list.length === 0) return null;

  let best = null;
  let bestScore = -1;
  for (const item of list) {
    const score = scoreTitleMatch(query, item.title);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  if (!best || !best.url) return null;
  return { url: best.url, title: best.title || '', description: '' };
}

// Headers that mimic a real browser (sites like cittadino.ca may serve different HTML to bots)
const BROWSER_LIKE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mergeCookiesFromResponse(res, existing = '') {
  if (!res?.headers) return existing;
  const raw = res.headers.get('set-cookie');
  if (!raw) return existing;
  const jar = new Map();
  for (const part of existing.split(';')) {
    const p = part.trim();
    if (!p) continue;
    const eq = p.indexOf('=');
    if (eq > 0) jar.set(p.slice(0, eq), p.slice(eq + 1));
  }
  for (const chunk of raw.split(/,(?=\s*[^;,]+=)/)) {
    const bit = chunk.split(';')[0].trim();
    const eq = bit.indexOf('=');
    if (eq > 0) jar.set(bit.slice(0, eq), bit.slice(eq + 1));
  }
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...opts, signal: controller.signal, redirect: 'follow' });
    return res;
  } finally {
    clearTimeout(id);
  }
}

function extractHtmlTitle(html) {
  if (!html) return '';
  const m = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return '';
  return String(m[1] || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function extractFirstWpSearchResultLink(html, baseUrl) {
  if (!html) return '';
  const text = String(html);
  // Try common WP search result patterns first
  const patterns = [
    /<a[^>]+class=["'][^"']*search-result[^"']*["'][^>]+href=["']([^"']+)["']/i,
    /<h2[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>\s*<a[^>]+href=["']([^"']+)["']/i,
    /<h3[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>\s*<a[^>]+href=["']([^"']+)["']/i,
    /<article[^>]*>\s*<header[^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["']/i,
    /<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*entry-title[^"']*["']/i,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1];
  }

  // Fallback: first post-like link under / or with the same host
  const generic = text.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/i);
  if (generic && generic[1]) {
    const href = generic[1];
    if (href.startsWith('http')) return href;
    if (href.startsWith('/')) return `${baseUrl}${href}`;
  }

  return '';
}

function extractFirstWpSearchResultLinkForCittadino(html, baseUrl) {
  if (!html) return '';
  const text = String(html);

  // Elementor cards: prefer real posts over attachments
  const articleRe = /<article[^>]*class=["'][^"']*elementor-post[^"']*["'][^>]*>[\s\S]*?<\/article>/gi;
  const articleBlocks = text.match(articleRe) || [];

  const pickFromBlock = (block) => {
    // Strict: h4.elementor-post__title then <a href="...">
    let m = block.match(/<h4[^>]*class=["']([^"']*elementor-post__title[^"']*)["'][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["']/i);
    if (m && m[2]) return m[2];
    // Relaxed: any <a href="..."> inside block that contains elementor-post__title (same host)
    const hasTitle = /elementor-post__title/i.test(block);
    if (hasTitle) {
      m = block.match(/href=["'](https?:\/\/[^"']+)["']/i);
      const host = baseUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
      if (m && m[1] && m[1].includes(host)) return m[1];
    }
    return '';
  };

  const preferred = articleBlocks.find((b) => /type-post/i.test(b));
  if (preferred) {
    const link = pickFromBlock(preferred);
    if (link) return link;
  }
  for (const block of articleBlocks) {
    const link = pickFromBlock(block);
    if (link) return link;
  }

  // Fallback: first post-like URL in archive area (e.g. after elementor-widget-archive-posts)
  const host = baseUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const archiveIdx = text.indexOf('elementor-widget-archive-posts');
  if (archiveIdx !== -1) {
    const fragment = text.slice(archiveIdx, archiveIdx + 15000);
    const linkMatch = fragment.match(/href=["'](https?:\/\/[^"']+\/[a-z0-9-]+\/[a-z0-9-/]*\/?)["']/i);
    if (linkMatch && linkMatch[1] && linkMatch[1].includes(host)) return linkMatch[1];
  }

  return extractFirstWpSearchResultLink(text, baseUrl);
}

async function tryWpDirectUrl(domain, query) {
  const d = normalizeDomainForChecks(domain);
  const slug = slugify(query);
  if (!d || !slug) return null;

  if (d === 'cittadino.ca') {
    const found = await tryCittadinoDirectAndSearch(d, slug, query);
    if (found) return found;
  }

  // prova i due pattern visti: /video/slug/ e /slug/
  const candidates = [
    `https://${d}/video/${slug}/`,
    `https://${d}/${slug}/`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetchWithTimeout(url, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' } }, 9000);

      if (!res || !res.ok) continue;

      const ct = (res.headers.get('content-type') || '').toLowerCase();
      // se non è html, comunque accettiamo (alcuni siti servono in modo strano)
      const body = await res.text();
      const title = extractHtmlTitle(body);

      // se è una pagina WP "no results", spesso contiene "Nothing Found" / "Nessun risultato"
      const bodyLower = body.toLowerCase();
      if (
        bodyLower.includes('nessun risultato') ||
        bodyLower.includes('nothing found') ||
        bodyLower.includes('no results found')
      ) {
        continue;
      }

      const finalUrl = res.url || url;

      return {
        url: finalUrl,
        title: title || '',
        description: '',
      };
    } catch (_) {
      // prova prossimo candidato
    }
  }

  // Fallback: WP internal search (?s=)
  try {
    const baseUrl = `https://${d}`;
    // magazine-italia.it: la ricerca interna funziona solo con query "pulita" (senza punteggiatura)
    const searchQ = d === 'magazine-italia.it' ? normalizeSiteSearchQuery(query) : String(query || '');
    const searchUrl = `${baseUrl}/?s=${encodeURIComponent(searchQ)}`;
    const headers = d === 'cittadino.ca' ? BROWSER_LIKE_HEADERS : { 'User-Agent': 'Mozilla/5.0' };
    const res = await fetchWithTimeout(searchUrl, { method: 'GET', headers }, 9000);

    if (res && res.ok) {
      const body = await res.text();
      const firstLink = d === 'cittadino.ca'
        ? extractFirstWpSearchResultLinkForCittadino(body, baseUrl)
        : extractFirstWpSearchResultLink(body, baseUrl);
      if (firstLink) {
        const title = extractHtmlTitle(body);
        return {
          url: firstLink,
          title: title || '',
          description: '',
        };
      }
    }
  } catch (_) {
    // ignore and return null
  }

  return null;
}

async function tryCittadinoDirectAndSearch(domain, slug, query) {
  // Log univoco: se non vedi questa riga su Render, il deploy non ha questo codice
  console.log('CITTADINO_V2_ENTRY');
  const baseUrl = `https://${domain}`;
  const headers = { ...BROWSER_LIKE_HEADERS };

  console.log(`[cittadino] slug="${slug}" query="${query.slice(0, 50)}..."`);

  // cittadino.ca risponde lento da Render → timeout lunghi
  const CITTADINO_TIMEOUT_MS = 22000;

  const fetchOpts = { method: 'GET', headers, agent: noVerifyHttpsAgent };

  // 1) Try WordPress REST API first (no HTML/JS, works from server)
  try {
    const wpSearchUrl = `${baseUrl}/wp-json/wp/v2/posts?search=${encodeURIComponent(query)}&per_page=5&_embed`;
    const res = await fetchWithTimeout(wpSearchUrl, { ...fetchOpts }, CITTADINO_TIMEOUT_MS);
    if (res && res.ok) {
      const json = await res.json();
      if (Array.isArray(json) && json.length > 0) {
        const post = json[0];
        const link = post.link || (post.guid && post.guid.rendered);
        if (link) {
          console.log(`✅ [cittadino] found via WP REST API: ${link}`);
          return { url: link, title: (post.title && post.title.rendered) || '', description: (post.excerpt && post.excerpt.rendered) || '' };
        }
      }
    }
  } catch (e) {
    console.log(`🔎 [cittadino] WP REST API skip: ${e.message}`);
  }

  const directCandidates = [
    `${baseUrl}/${slug}/`,
    `${baseUrl}/${slug}/${slug}-2/`,
  ];

  for (const url of directCandidates) {
    try {
      const timeout = domain === 'cittadino.ca' ? CITTADINO_TIMEOUT_MS : 9000;
      const res = await fetchWithTimeout(url, { ...fetchOpts }, timeout);
      if (domain === 'cittadino.ca') console.log(`[cittadino] direct ${url} => ${res ? res.status : 'no res'}`);
      if (!res || !res.ok) continue;
      const body = await res.text();
      const bodyLower = body.toLowerCase();
      if (
        bodyLower.includes('nessun risultato') ||
        bodyLower.includes('nothing found') ||
        bodyLower.includes('no results found')
      ) {
        continue;
      }
      const title = extractHtmlTitle(body);
      return { url: res.url || url, title: title || '', description: '' };
    } catch (e) {
      if (domain === 'cittadino.ca') console.log(`[cittadino] direct ${url} error:`, e.message);
    }
  }

  try {
    // cittadino.ca shows search results only when the page id is in the URL (WP page ID of search results template)
    const searchUrl = domain === 'cittadino.ca'
      ? `${baseUrl}/?s=${encodeURIComponent(query)}&id=194654`
      : `${baseUrl}/?s=${encodeURIComponent(query)}`;
    const searchHeaders = domain === 'cittadino.ca' ? { ...headers, Referer: baseUrl + '/' } : headers;
    const searchTimeout = domain === 'cittadino.ca' ? CITTADINO_TIMEOUT_MS : 9000;
    const res = await fetchWithTimeout(searchUrl, { ...fetchOpts, headers: searchHeaders }, searchTimeout);
    if (domain === 'cittadino.ca') {
      console.log(`[cittadino] search ${searchUrl.slice(0, 80)}... => status=${res ? res.status : 'none'}`);
    }
    if (!res || !res.ok) return null;
    const body = await res.text();
    if (domain === 'cittadino.ca') {
      console.log(`[cittadino] search body length=${body.length} hasElementor=${body.includes('elementor')} hasArticle=${body.includes('<article')}`);
    }
    const firstLink = extractFirstWpSearchResultLinkForCittadino(body, baseUrl);
    if (domain === 'cittadino.ca' && !firstLink) {
      const articleRe = /<article[^>]*class=["'][^"']*elementor-post[^"']*["'][^>]*>/gi;
      const blocks = body.match(articleRe) || [];
      console.log(`[cittadino] parse: articleBlocks=${blocks.length} firstLink=${firstLink || 'none'}`);
    }
    if (firstLink) {
      return { url: firstLink, title: '', description: '' };
    }
  } catch (e) {
    if (domain === 'cittadino.ca') console.log(`[cittadino] search error:`, e.message);
  }

  console.log(`⚠️ [cittadino] no result (direct + search + parse failed)`);
  return null;
}

function normalizeSiteSearchQuery(text) {
  // Per ricerche interne: togli punteggiatura e normalizza Unicode (simile al controllo frontend)
  return String(text || '')
    .toLowerCase()
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&#0*34;|&#x0*22;|&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/[“”]/g, '"')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`´]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function extractFirstNotizieSearchResultLink(html) {
  if (!html) return '';
  const text = String(html);
  // <h3 class="aptica_listing_titles ... entry-title"><a href="...">
  const m = text.match(
    /<h3[^>]*class=["'][^"']*aptica_listing_titles[^"']*entry-title[^"']*["'][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["']/i
  );
  if (m && m[1]) return m[1];
  // fallback: first link to /<slug>/ on notizie.it
  const m2 = text.match(/href=["'](https?:\/\/www\.notizie\.it\/[a-z0-9-]+\/)["']/i);
  return (m2 && m2[1]) || '';
}

async function tryNotizieInternalSearch(query) {
  const q = normalizeSiteSearchQuery(query);
  if (!q) return null;
  const searchUrl = `https://www.notizie.it/search/?q=${encodeURIComponent(q)}`;
  try {
    const res = await fetchWithTimeout(
      searchUrl,
      { method: 'GET', headers: BROWSER_LIKE_HEADERS },
      12000
    );
    if (!res || !res.ok) return null;
    const body = await res.text();
    const firstLink = extractFirstNotizieSearchResultLink(body);
    if (!firstLink) return null;
    return { url: firstLink, title: '', description: '' };
  } catch (_) {
    return null;
  }
}

function pickBestLospecialeSearchResult(html, query) {
  if (!html) return null;
  const full = String(html);
  const idx = full.search(/risultati\s+ricerca/i);
  const text = idx !== -1 ? full.slice(idx, idx + 80000) : full;
  const base = 'https://www.lospecialegiornale.it';
  const candidates = [];
  const seen = new Set();

  const h2LinkRe =
    /<h2[^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/gi;
  let m;
  while ((m = h2LinkRe.exec(text)) !== null) {
    let url = m[1].trim();
    if (!/\/20\d{2}\/\d{2}\/\d{2}\//.test(url)) continue;
    if (url.startsWith('/')) url = `${base}${url}`;
    url = url.replace(/\/+$/, '') + '/';
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const title = m[2]
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    candidates.push({ url, title });
  }

  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestScore = calculateSimilarity(best.title || '', query);
  for (let i = 1; i < candidates.length; i++) {
    const score = calculateSimilarity(candidates[i].title || '', query);
    if (score > bestScore) {
      bestScore = score;
      best = candidates[i];
    }
  }
  return best;
}

async function tryLospecialeInternalSearch(query) {
  const base = 'https://www.lospecialegiornale.it';
  const queries = [String(query || '').trim(), normalizeSiteSearchQuery(query)].filter(
    (q, i, arr) => q && arr.indexOf(q) === i,
  );
  if (queries.length === 0) return null;

  for (let round = 0; round < 2; round++) {
    if (round > 0) {
      console.log('[lospeciale] retry dopo delay...');
      await sleep(2500);
    }

    let cookie = '';
    try {
      const home = await fetchWithTimeout(`${base}/`, { method: 'GET', headers: BROWSER_LIKE_HEADERS }, 15000);
      if (home) {
        cookie = mergeCookiesFromResponse(home, cookie);
        if (home.body) await home.text().catch(() => '');
        console.log(`[lospeciale] homepage status=${home.status}`);
      }
    } catch (e) {
      console.log(`[lospeciale] homepage error: ${e.message}`);
    }

    await sleep(1800);

    for (const q of queries) {
      const searchUrl = `${base}/?s=${encodeURIComponent(q)}`;
      const headers = {
        ...BROWSER_LIKE_HEADERS,
        Referer: `${base}/`,
        ...(cookie ? { Cookie: cookie } : {}),
      };
      try {
        const res = await fetchWithTimeout(searchUrl, { method: 'GET', headers }, 18000);
        if (!res) continue;
        const body = await res.text();
        console.log(`[lospeciale] ?s= status=${res.status} bytes=${body.length} q="${q.slice(0, 50)}..."`);
        if (!res.ok || res.status === 403) continue;
        if (!/risultati\s+ricerca/i.test(body)) continue;

        const best = pickBestLospecialeSearchResult(body, query);
        if (best?.url) {
          console.log(`[lospeciale] internal ok: ${best.url} (title match)`);
          return { url: best.url, title: best.title || '', description: '' };
        }
      } catch (e) {
        console.log(`[lospeciale] ?s= error: ${e.message}`);
      }
      await sleep(800);
    }
  }
  return null;
}

function lospecialeTitleMatchesQuery(title, query) {
  const qWords = normalizeSiteSearchQuery(query)
    .split(' ')
    .filter((w) => w.length > 3);
  const t = normalizeSiteSearchQuery(title);
  if (!qWords.length || !t) return false;
  const hits = qWords.filter((w) => t.includes(w)).length;
  return hits >= Math.max(2, Math.ceil(qWords.length * 0.35));
}

function pickBestLospecialeRemoteResult(parsedResults, query) {
  let best = null;
  let bestScore = 0;
  for (const r of parsedResults) {
    if (!r.url || !/lospecialegiornale\.it\/20\d{2}\//i.test(r.url)) continue;
    if (!lospecialeTitleMatchesQuery(r.title || '', query)) continue;
    const score = calculateSimilarity(r.title || '', query);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

/** Articolo WP: /YYYY/MM/DD/slug/ — utile quando ?s= è 403 su Render */
async function tryLospecialeSlugProbe(query) {
  const slug = slugify(query);
  if (!slug || slug.length < 10) return null;
  const base = 'https://www.lospecialegiornale.it';
  const now = new Date();

  for (let d = 0; d <= 60; d++) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - d);
    const y = date.getUTCFullYear();
    const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const url = `${base}/${y}/${mo}/${day}/${slug}/`;
    try {
      const res = await fetchWithTimeout(url, { method: 'GET', headers: BROWSER_LIKE_HEADERS }, 10000);
      if (!res || !res.ok) continue;
      const title = extractHtmlTitle(await res.text());
      if (lospecialeTitleMatchesQuery(title, query)) {
        console.log(`[lospeciale] slug probe ok: ${url}`);
        return { url, title, description: '' };
      }
    } catch (_) {}
  }
  return null;
}

/** lospecialegiornale.it: solo ValueSERP playground (engine=google, device=desktop) */
async function searchLospecialeValueSerp(query) {
  if (!VALUESERP_KEY) {
    return { error: 'ValueSERP key non configurata' };
  }

  const siteQ = `site:lospecialegiornale.it ${query}`;
  const valueSerpUrl = buildValueSerpLospecialeUrl(siteQ);
  console.log(`[lospeciale] ValueSERP desktop: ${siteQ}`);

  const response = await fetch(valueSerpUrl);
  if (!response.ok) {
    return { error: `Errore ValueSERP: HTTP ${response.status}` };
  }

  const data = await response.json();
  if (data.request_info?.success === false) {
    return { error: `Errore ValueSERP: ${data.request_info?.message || 'Unknown error'}` };
  }

  const organic = data.organic_results || [];
  const total = data.search_information?.total_results;
  console.log(`[lospeciale] organic_results=${organic.length} total_results=${total}`);

  for (const item of organic) {
    if (!item.link || !item.title) continue;
    if (!/lospecialegiornale\.it/i.test(String(item.link))) continue;
    console.log(`[lospeciale] ok: ${item.link}`);
    return {
      result: {
        url: item.link,
        title: item.title,
        description: item.snippet || '',
      },
    };
  }

  const parsed = parseValueSERPResults(data, query);
  if (parsed.length > 0) {
    console.log(`[lospeciale] ok (parsed): ${parsed[0].url}`);
    return { result: parsed[0] };
  }

  console.log('[lospeciale] ValueSERP: nessun organic_results');
  return { empty: true };
}

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Boolean Search API with ValueSERP on Render',
    hasApiKey: !!VALUESERP_KEY,
    hasSerpApiKey: !!SERPAPI_KEY
  });
});

// Search endpoint
app.post('/api/search', async (req, res) => {
  const { domain, query } = req.body;

  if (!domain || !query) {
    return res.status(400).json({ error: 'Dominio e query sono richiesti' });
  }

  const cleanDomain = normalizeDomainForChecks(domain);
  const searchQuery = `site:${cleanDomain} "${query}"`;

  try {
    // --- WP INTERNAL FALLBACK (bypass Google/Bing) ---
    if (isWpInternalDomain(cleanDomain)) {
      console.log(`🔎 WP direct check: ${cleanDomain} | query="${query}"`);
      const found = await tryWpDirectUrl(cleanDomain, query);

      if (found && found.url) {
        console.log(`✅ Found (WP direct): ${found.url}`);
        return res.json({
          url: found.url,
          title: found.title || '',
          description: found.description || '',
          error: null
        });
      }

      console.log('⚠️ No results found (WP direct)');
      return res.json({
        url: '',
        title: '',
        description: '',
        error: 'Nessun risultato trovato',
        _build: 'cittadino-v2'  // se vedi questo nella risposta API, il codice nuovo è deployato
      });
    }

    // --- DAILYMOTION owners (bypass Google/Bing) ---
    // For domains like "dailymotion.com/askanews" or "dailymotion.com/quotidianonazionale"
    const dmOwner = parseDailymotionOwner(cleanDomain);
    if (dmOwner) {
      console.log(`🔎 Dailymotion API: owner=${dmOwner} | query="${query}"`);
      const found = await searchDailymotionByOwner(dmOwner, query);
      if (found && found.url) {
        console.log(`✅ Found (Dailymotion API): ${found.url}`);
        return res.json({
          url: found.url,
          title: found.title || '',
          description: found.description || '',
          error: null
        });
      }
      console.log('⚠️ No results found (Dailymotion API)');
      return res.json({
        url: '',
        title: '',
        description: '',
        error: 'Nessun risultato trovato'
      });
    }

    // NOTIZIE.IT: ricerca interna del sito (più affidabile di Google per alcuni titoli)
    if (cleanDomain === 'notizie.it' || cleanDomain === 'www.notizie.it') {
      const found = await tryNotizieInternalSearch(query);
      if (found && found.url) {
        console.log(`✅ Found (notizie internal): ${found.url}`);
        return res.json({ url: found.url, title: found.title || '', description: found.description || '', error: null });
      }
      console.log('⚠️ No results found (notizie internal)');
      return res.json({ url: '', title: '', description: '', error: 'Nessun risultato trovato' });
    }

    // LO SPECIALE: solo ValueSERP (engine=google, device=desktop) — come playground
    if (isLospecialeDomain(cleanDomain)) {
      const vs = await searchLospecialeValueSerp(query);
      if (vs.error) {
        return res.status(500).json({ url: '', title: '', description: '', error: vs.error });
      }
      if (vs.result) {
        return res.json({
          url: vs.result.url,
          title: vs.result.title,
          description: vs.result.description,
          error: null,
        });
      }
      return res.json({ url: '', title: '', description: '', error: 'Nessun risultato trovato' });
    }

    // IL TEMPO: ValueSERP solo google.com + hl=it
    if (isIlTempoDomain(cleanDomain)) {
      const vs = await searchValueSerp(`site:${cleanDomain} ${query}`, query, { googleComIt: true });
      if (vs.error) {
        return res.status(500).json({ url: '', title: '', description: '', error: vs.error });
      }
      if (vs.result) {
        return res.json({
          url: vs.result.url,
          title: vs.result.title,
          description: vs.result.description,
          error: null,
        });
      }
      return res.json({ url: '', title: '', description: '', error: 'Nessun risultato trovato' });
    }

    // MSN + libero.it + quotidiano.net => Bing via SerpApi (query senza virgolette)
    if (isMsnDomain(cleanDomain) || isLiberoDomain(cleanDomain) || isQuotidianoDomain(cleanDomain)) {
      const bingQuery =
        isLiberoDomain(cleanDomain) || isQuotidianoDomain(cleanDomain)
          ? `site:${cleanDomain} ${query}`
          : searchQuery;

      const bing = await searchSerpApiBing(bingQuery, query);
      if (bing.error) {
        return res.status(500).json({
          url: '',
          title: '',
          description: '',
          error: bing.error,
        });
      }
      if (bing.result) {
        return res.json({
          url: bing.result.url,
          title: bing.result.title,
          description: bing.result.description,
          error: null,
        });
      }
      return res.json({
        url: '',
        title: '',
        description: '',
        error: 'Nessun risultato trovato',
      });
    }

    // --- Default: Google via ValueSERP ---
    const vs = await searchValueSerp(`site:${cleanDomain} ${query}`, query);
    if (vs.error) {
      return res.status(500).json({ url: '', title: '', description: '', error: vs.error });
    }
    if (vs.result) {
      return res.json({
        url: vs.result.url,
        title: vs.result.title,
        description: vs.result.description,
        error: null,
      });
    }
    return res.json({
      url: '',
      title: '',
      description: '',
      error: 'Nessun risultato trovato',
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    return res.status(500).json({
      url: '',
      title: '',
      description: '',
      error: `Errore: ${error.message}`
    });
  }
});

function parseValueSERPResults(data, originalQuery) {
  const results = [];

  // Check organic_results first
  let allResults = [];

  if (data.organic_results && data.organic_results.length > 0) {
    allResults = [...data.organic_results];
    console.log(`📊 Found ${data.organic_results.length} organic results`);
  }

  // Check video_results
  if (data.video_results && data.video_results.length > 0) {
    allResults = [...allResults, ...data.video_results];
    console.log(`🎥 Found ${data.video_results.length} video results`);
  }

  // CHECK INLINE_VIDEOS (for sites like Dailymotion, YouTube embedded)
  if (data.inline_videos && data.inline_videos.length > 0) {
    const inlineVideos = data.inline_videos.map(video => ({
      link: video.link,
      title: video.title,
      snippet: `${video.source} · ${video.length || ''}`
    }));
    allResults = [...allResults, ...inlineVideos];
    console.log(`📹 Found ${data.inline_videos.length} inline videos`);
  }

  // Check knowledge_graph results
  if (data.knowledge_graph && data.knowledge_graph.source) {
    allResults.push({
      link: data.knowledge_graph.source.link,
      title: data.knowledge_graph.title,
      snippet: data.knowledge_graph.description
    });
    console.log(`📚 Found knowledge graph result`);
  }

  if (allResults.length === 0) {
    console.log('⚠️ No results in ValueSERP response');
    return results;
  }

  console.log(`📊 Total results found: ${allResults.length}`);

  for (const item of allResults) {
    if (item.link && item.title) {
      results.push({
        url: item.link,
        title: item.title,
        description: item.snippet || '',
        similarity: calculateSimilarity(item.title, originalQuery)
      });
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);

  console.log(`✅ Parsed ${results.length} valid results`);

  return results;
}

function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;

  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  let matches = 0;

  for (const word1 of words1) {
    for (const word2 of words2) {
      if (word1.length > 3 && word2.length > 3 && word1 === word2) {
        matches++;
      }
    }
  }

  return matches / Math.max(words1.length, words2.length);
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔑 ValueSERP key: ${VALUESERP_KEY ? 'configured ✅' : 'MISSING ❌'}`);
  console.log(`🔑 SerpApi key: ${SERPAPI_KEY ? 'configured ✅' : 'MISSING ❌'}`);
  const renderCommit = process.env.RENDER_GIT_COMMIT || process.env.RENDER_COMMIT || '';
  if (renderCommit) console.log(`🧾 Render commit: ${renderCommit}`);
  console.log(`🎬 Dailymotion owners enabled: ${Array.from(DAILYMOTION_ALLOWED_OWNERS).join(', ')}`);
});
