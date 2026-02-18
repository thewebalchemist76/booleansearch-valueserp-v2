const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { getJson } = require('serpapi');

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
    const m = block.match(/<h4[^>]*class=["'][^"']*elementor-post__title[^"']*["'][^>]*>\s*<a[^>]+href=["']([^"']+)["']/i);
    return m && m[1] ? m[1] : '';
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
    const res = await fetchWithTimeout(searchUrl, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' } }, 9000);

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
  const baseUrl = `https://${domain}`;
  const headers = { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7' };

  const directCandidates = [
    `${baseUrl}/${slug}/`,
    `${baseUrl}/${slug}/${slug}-2/`,
  ];

  for (const url of directCandidates) {
    try {
      const res = await fetchWithTimeout(url, { method: 'GET', headers }, 9000);
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
    } catch (_) {
      // try next
    }
  }

  try {
    const searchUrl = `${baseUrl}/?s=${encodeURIComponent(query)}`;
    const res = await fetchWithTimeout(searchUrl, { method: 'GET', headers }, 9000);
    if (!res || !res.ok) return null;
    const body = await res.text();
    const firstLink = extractFirstWpSearchResultLinkForCittadino(body, baseUrl);
    if (firstLink) {
      return { url: firstLink, title: '', description: '' };
    }
  } catch (_) {
    // ignore
  }

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
        error: 'Nessun risultato trovato'
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
