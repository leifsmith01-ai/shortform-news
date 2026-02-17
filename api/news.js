// api/news.js - Vercel Serverless Function
// Fetches news from NewsAPI with Smart Cache (24hr)

const CACHE = {}; // In-memory cache (persists between requests on same instance)

// Helper: generate cache key
function getCacheKey(country, category) {
  const today = new Date().toISOString().split('T')[0];
  return `${today}-${country}-${category}`;
}

// Helper: check if cache is still valid (less than 24 hours old)
function isCacheValid(cacheEntry) {
  if (!cacheEntry) return false;
  const ageInHours = (Date.now() - cacheEntry.timestamp) / (1000 * 60 * 60);
  return ageInHours < 24;
}

// Helper: fetch from NewsAPI
async function fetchFromNewsAPI(country, category, apiKey) {
  const today = new Date();
  const weekAgo = new Date(today - 7 * 24 * 60 * 60 * 1000);
  const fromDate = weekAgo.toISOString().split('T')[0];

  // Map category to NewsAPI category
  const categoryMap = {
    technology: 'technology',
    business: 'business',
    science: 'science',
    health: 'health',
    sports: 'sports',
    entertainment: 'entertainment',
    politics: 'general',
    world: 'general'
  };

  const newsApiCategory = categoryMap[category] || 'general';

  const url = `https://newsapi.org/v2/top-headlines?` +
    `country=${country}&` +
    `category=${newsApiCategory}&` +
    `pageSize=10&` +
    `apiKey=${apiKey}`;

  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`NewsAPI error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.status !== 'ok') {
    throw new Error(`NewsAPI error: ${data.message}`);
  }

  return data.articles || [];
}

// Helper: generate AI summary using Gemini
async function generateSummary(article, geminiKey) {
  if (!geminiKey) return null;

  const content = `${article.title}. ${article.description || ''}`;
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `Summarize this news article in exactly 3 short bullet points (1 sentence each). 
Be concise and factual. Format as:
• Point 1
• Point 2  
• Point 3

Article: ${content}`
        }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 200
      }
    })
  });

  if (!response.ok) return null;

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!text) return null;

  // Parse bullet points into array
  const bullets = text
    .split('\n')
    .filter(line => line.trim().startsWith('•'))
    .map(line => line.replace('•', '').trim())
    .filter(Boolean);

  return bullets.length > 0 ? bullets : null;
}

// Helper: format article from NewsAPI format to our app format
function formatArticle(article, country, category) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: article.title || 'No title',
    description: article.description || '',
    content: article.content || article.description || '',
    url: article.url || '#',
    image: article.urlToImage || `https://source.unsplash.com/800x400/?${category},news`,
    source: article.source?.name || 'Unknown',
    publishedAt: article.publishedAt || new Date().toISOString(),
    country: country,
    category: category,
    views: Math.floor(Math.random() * 5000) + 100,
    summary: null // Will be filled by AI
  };
}

// Main handler
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get params from body (POST) or query (GET)
  const { countries, categories, searchQuery } = req.method === 'POST' 
    ? req.body 
    : req.query;

  const NEWS_API_KEY = process.env.VITE_NEWS_API_KEY || process.env.NEWS_API_KEY;
  const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

  if (!NEWS_API_KEY) {
    return res.status(500).json({ error: 'NewsAPI key not configured' });
  }

  const countryList = Array.isArray(countries) ? countries : [countries || 'us'];
  const categoryList = Array.isArray(categories) ? categories : [categories || 'technology'];

  try {
    const allArticles = [];

    for (const country of countryList) {
      for (const category of categoryList) {
        const cacheKey = getCacheKey(country, category);

        // Check cache first
        if (isCacheValid(CACHE[cacheKey])) {
          console.log(`Cache HIT: ${cacheKey}`);
          allArticles.push(...CACHE[cacheKey].articles);
          continue;
        }

        console.log(`Cache MISS: ${cacheKey} - fetching fresh data`);

        // Fetch fresh from NewsAPI
        const rawArticles = await fetchFromNewsAPI(country, category, NEWS_API_KEY);
        
        // Filter out articles without titles or removed articles
        const validArticles = rawArticles.filter(a => 
          a.title && 
          a.title !== '[Removed]' && 
          a.url !== 'https://removed.com'
        );

        // Format articles
        const formattedArticles = validArticles.map(a => formatArticle(a, country, category));

        // Generate AI summaries (for first 5 articles to save API quota)
        if (GEMINI_API_KEY) {
          const summaryPromises = formattedArticles.slice(0, 5).map(async (article) => {
            try {
              const summary = await generateSummary(article, GEMINI_API_KEY);
              if (summary) article.summary = summary;
            } catch (err) {
              console.error('Summary generation failed:', err.message);
            }
            return article;
          });
          await Promise.all(summaryPromises);
        }

        // Store in cache
        CACHE[cacheKey] = {
          timestamp: Date.now(),
          articles: formattedArticles
        };

        allArticles.push(...formattedArticles);
      }
    }

    // Filter by search query if provided
    let filteredArticles = allArticles;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredArticles = allArticles.filter(a =>
        a.title.toLowerCase().includes(query) ||
        a.description.toLowerCase().includes(query)
      );
    }

    // Sort by date (newest first)
    filteredArticles.sort((a, b) => 
      new Date(b.publishedAt) - new Date(a.publishedAt)
    );

    return res.status(200).json({
      status: 'ok',
      articles: filteredArticles,
      totalResults: filteredArticles.length,
      cached: false
    });

  } catch (error) {
    console.error('News fetch error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch news',
      message: error.message 
    });
  }
}
