const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 10000;
const VALUESERP_KEY = process.env.VALUESERP_KEY || '';

// Middleware
app.use(cors());
app.use(express.json());

// Pick search engine based on domain
function pickEngineForDomain(domain) {
  const d = (domain || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .trim();

  if (d === 'msn.com' || d.endsWith('.msn.com')) {
    return 'bing';
  }

  return 'google';
}

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Boolean Search API with ValueSERP on Render',
    hasApiKey: !!VALUESERP_KEY
  });
});

// Search endpoint
app.post('/api/search', async (req, res) => {
  const { domain, query } = req.body;

  if (!domain || !query) {
    return res.status(400).json({ error: 'Dominio e query sono richiesti' });
  }

  if (!VALUESERP_KEY) {
    return res.status(500).json({ error: 'ValueSERP key non configurata' });
  }

  const cleanDomain = domain.replace(/\.\*$/, '').replace(/\*$/, '').replace(/\.$/, '').trim();
  const engine = pickEngineForDomain(cleanDomain);
  const searchQuery = `site:${cleanDomain} "${query}"`;

  try {
    console.log(`🔍 Engine: ${engine} | Searching: ${searchQuery}`);

    let valueSerpUrl;

    if (engine === 'bing') {
      // ValueSERP Bing Search URL
      valueSerpUrl =
        `https://api.valueserp.com/search` +
        `?api_key=${VALUESERP_KEY}` +
        `&engine=bing` +
        `&q=${encodeURIComponent(searchQuery)}` +
        `&location=Italy` +
        `&num=10`;
    } else {
      // ValueSERP Google Search URL (default)
      valueSerpUrl =
        `https://api.valueserp.com/search` +
        `?api_key=${VALUESERP_KEY}` +
        `&q=${encodeURIComponent(searchQuery)}` +
        `&location=Italy` +
        `&gl=it` +
        `&hl=it` +
        `&num=10`;
    }

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
    // Convert inline_videos to same format as organic_results
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

  // Extract results from ValueSERP
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

  // Sort by similarity
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
});
