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
  return d === 'msn.com' || d.endsWith('.msn.com');
}

function serpApiGetJson(params) {
  return new Promise((resolve) => {
    getJson(params, (json) => resolve(json));
  });
}

// --- WP internal-search domains (not reliably indexed on Google/Bing) ---
const WP_INTERNAL_SEARCH_DOMAINS = new Set([
  'forumitalia.info',
  'investimentinews.it',
  'primopiano24.it',
  'accadeora.it',
  'ondazzurra.com',
  'venezia24.com',
  'cronacheditrentoetrieste.it',
  'corrierediancona.it',
  'notiziarioflegreo.it',
  'cittadi.it',
  'cittadinapoli.com',
  'magazine-italia.it',
  'cittadino.ca',
  'cronachedelmezzogiorno.it',
  'cronachedellacalabria.it',
  'lacittadiroma.it',
  'corrieredellasardegna.it',
]);

function normalizeDomainForChecks(domain) {
  return String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/g, '')
    .replace(/\.\*$/g, '')
    .replace(/\*$/g, '')
    .replace(/\.$/g, '');
}

function isWpInternalDomain(domain) {
  const d = normalizeDomainForChecks(domain);
  return WP_INTERNAL_SEARCH_DOMAINS.has(d);
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
    const searchUrl = `${baseUrl}/?s=${encodeURIComponent(query)}`;
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

    // MSN => Bing via SerpApi, everything else => Google via ValueSERP (unchanged)
    if (isMsnDomain(cleanDomain)) {
      if (!SERPAPI_KEY) {
        return res.status(500).json({ error: 'SerpApi key non configurata (necessaria per msn.com)' });
      }

      console.log(`🔍 Searching (Bing/SerpApi): ${searchQuery}`);

      const data = await serpApiGetJson({
        engine: 'bing',
        q: searchQuery,
        cc: 'IT',
        api_key: SERPAPI_KEY
      });

      if (data && data.error) {
        console.error(`❌ SerpApi error: ${data.error}`);
        return res.status(500).json({
          url: '',
          title: '',
          description: '',
          error: `Errore SerpApi: ${data.error}`
        });
      }

      const results = parseValueSERPResults(data, query);

      if (results.length > 0) {
        const best = results[0];
        console.log(`✅ Found: ${best.url}`);

        return res.json({
          url: best.url,
          title: best.title,
          description: best.description,
          error: null
        });
      }

      console.log('⚠️ No results found');
      return res.json({
        url: '',
        title: '',
        description: '',
        error: 'Nessun risultato trovato'
      });
    }

    // --- Default: Google via ValueSERP (original behavior, unchanged) ---
    if (!VALUESERP_KEY) {
      return res.status(500).json({ error: 'ValueSERP key non configurata' });
    }

    console.log(`🔍 Searching: ${searchQuery}`);

    // ValueSERP Google Search URL
    const valueSerpUrl = `https://api.valueserp.com/search?api_key=${VALUESERP_KEY}&q=${encodeURIComponent(searchQuery)}&location=Italy&gl=it&hl=it&num=10`;

    console.log(`🌐 Fetching from ValueSERP...`);

    // Fetch from ValueSERP
    const response = await fetch(valueSerpUrl);

    if (!response.ok) {
      console.error(`❌ ValueSERP error: ${response.status}`);
      return res.status(500).json({
        url: '',
        title: '',
        description: '',
        error: `Errore ValueSERP: HTTP ${response.status}`
      });
    }

    const data = await response.json();
    console.log(`📄 ValueSERP response received`);

    // Check for errors in response
    if (data.request_info && data.request_info.success === false) {
      console.error(`❌ ValueSERP error: ${data.request_info.message || 'Unknown error'}`);
      return res.status(500).json({
        url: '',
        title: '',
        description: '',
        error: `Errore ValueSERP: ${data.request_info.message || 'Unknown error'}`
      });
    }

    // Parse ValueSERP results
    const results = parseValueSERPResults(data, query);

    if (results.length > 0) {
      const best = results[0];
      console.log(`✅ Found: ${best.url}`);

      return res.json({
        url: best.url,
        title: best.title,
        description: best.description,
        error: null
      });
    }

    console.log('⚠️ No results found');
    return res.json({
      url: '',
      title: '',
      description: '',
      error: 'Nessun risultato trovato'
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
});
