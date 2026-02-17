# 🔄 API Changes & Base44 Removal Guide

## Overview

Your news aggregator has been completely refactored to **remove all Base44 dependencies**. The app now uses a flexible API architecture that works with:

1. **Mock API** (for development without a backend)
2. **Any REST API backend** (when you're ready to connect a real backend)
3. **Claude API directly** (optional, for AI summaries)

---

## 🎯 Key Changes Made

### 1. **Removed Base44 Dependencies**

**Before:**
```javascript
import { base44 } from '@/api/base44Client';

await base44.integrations.Core.InvokeLLM({...});
await base44.entities.DailyNews.filter({...});
await base44.entities.SavedArticle.create({...});
await base44.auth.logout();
```

**After:**
```javascript
import api from '@/api';

await api.fetchNews({...});
await api.getCachedNews(...);
await api.saveArticle({...});
// Standard logout (clear localStorage)
```

---

### 2. **New API Structure**

```
src/api/
├── index.ts              # Main export - automatically switches between mock/real
├── apiClient.ts          # Real API client (REST endpoints)
└── mockApiService.ts     # Mock API for development (no backend needed)
```

**How it works:**
- Set `VITE_USE_MOCK_API=true` → Uses mock data (instant development)
- Set `VITE_USE_MOCK_API=false` + provide `VITE_API_URL` → Uses real backend

---

### 3. **Updated Files**

#### **Modified Files:**
- ✅ `pages/Home.tsx` - Uses new API
- ✅ `components/news/NewsCard.tsx` - Uses new API
- ✅ `components/Layout.tsx` - Standard logout
- ✅ `.env.example` - New environment variables

#### **New Files Created:**
- ✅ `api/index.ts` - Unified API service
- ✅ `api/apiClient.ts` - REST API client
- ✅ `api/mockApiService.ts` - Mock data generator
- ✅ `pages/SavedArticles.tsx` - Saved articles page
- ✅ `pages/History.tsx` - Reading history page
- ✅ `lib/utils.ts` - Utility functions
- ✅ All config files (tailwind, vite, postcss, etc.)

---

## 🚀 Getting Started (Development)

### Option 1: Use Mock API (No Backend Needed)

1. **Set up environment:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env`:**
   ```env
   VITE_USE_MOCK_API=true
   VITE_ENVIRONMENT=development
   ```

3. **Install and run:**
   ```bash
   npm install
   npm run dev
   ```

4. **That's it!** The app will use mock data and work without any backend.

**Mock API Features:**
- Generates realistic fake news articles
- Simulates network delay (1 second)
- Supports all features (save, history, caching)
- Data persists in memory during session

---

### Option 2: Connect to Your Backend

1. **Set up environment:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env`:**
   ```env
   VITE_USE_MOCK_API=false
   VITE_API_URL=http://localhost:3000/api
   VITE_API_KEY=your_api_key_here
   ```

3. **Your backend needs these endpoints:**

   ```
   POST   /api/news               # Fetch news articles
   GET    /api/news/cached        # Get cached news
   POST   /api/news/cache         # Cache news
   GET    /api/saved-articles     # Get saved articles
   POST   /api/saved-articles     # Save an article
   DELETE /api/saved-articles/:id # Unsave an article
   GET    /api/reading-history    # Get reading history
   POST   /api/reading-history    # Add to history
   POST   /api/ai/summarize       # Optional: AI summarization
   ```

4. **Install and run:**
   ```bash
   npm install
   npm run dev
   ```

---

## 📋 API Endpoint Specifications

### **POST /api/news**
Fetch news articles based on filters.

**Request:**
```json
{
  "countries": ["us", "gb"],
  "categories": ["technology", "business"],
  "searchQuery": "AI",
  "dateRange": "week"
}
```

**Response:**
```json
{
  "articles": [
    {
      "title": "Article headline",
      "source": "Reuters",
      "image_url": "https://...",
      "country": "us",
      "category": "technology",
      "url": "https://...",
      "time_ago": "2 hours ago",
      "views": 15000,
      "summary_points": [
        "Key point 1",
        "Key point 2",
        "Key point 3"
      ]
    }
  ]
}
```

---

### **GET /api/news/cached**
Get cached news for a specific date/country/category.

**Query Parameters:**
- `date` - ISO date string (e.g., "2026-02-04")
- `country` - Country code (e.g., "us")
- `category` - Category (e.g., "technology")

**Response:**
```json
{
  "articles": [...]
}
```

---

### **POST /api/news/cache**
Cache news articles.

**Request:**
```json
{
  "fetch_date": "2026-02-04",
  "country": "us",
  "category": "technology",
  "articles": [...]
}
```

**Response:**
```json
{
  "success": true
}
```

---

### **GET /api/saved-articles**
Get all saved articles for the current user.

**Response:**
```json
[
  {
    "id": "123",
    "title": "...",
    "source": "...",
    "saved_date": "2026-02-04T10:30:00Z",
    ...
  }
]
```

---

### **POST /api/saved-articles**
Save an article.

**Request:**
```json
{
  "title": "Article title",
  "source": "Reuters",
  "url": "https://...",
  "saved_date": "2026-02-04T10:30:00Z",
  ...
}
```

**Response:**
```json
{
  "id": "123",
  "saved_date": "2026-02-04T10:30:00Z",
  ...
}
```

---

### **DELETE /api/saved-articles/:id**
Remove a saved article.

**Response:**
```json
{
  "success": true
}
```

---

## 🔌 Backend Implementation Examples

### Node.js + Express Example

```javascript
const express = require('express');
const app = express();

app.use(express.json());

// Mock database
let cachedNews = [];
let savedArticles = [];
let readingHistory = [];

app.post('/api/news', async (req, res) => {
  const { countries, categories, searchQuery, dateRange } = req.body;
  
  // Call your news API or AI service here
  // For example, use Claude API, NewsAPI, or web scraping
  
  const articles = await fetchNewsFromSources({
    countries,
    categories,
    searchQuery,
    dateRange
  });
  
  res.json({ articles });
});

app.get('/api/news/cached', (req, res) => {
  const { date, country, category } = req.query;
  const cached = cachedNews.find(
    c => c.date === date && c.country === country && c.category === category
  );
  res.json(cached || null);
});

app.post('/api/saved-articles', (req, res) => {
  const article = {
    id: Date.now().toString(),
    ...req.body
  };
  savedArticles.push(article);
  res.json(article);
});

app.listen(3000, () => {
  console.log('Backend running on port 3000');
});
```

---

### Python + Flask Example

```python
from flask import Flask, request, jsonify
from datetime import datetime

app = Flask(__name__)

# Mock database
cached_news = []
saved_articles = []
reading_history = []

@app.route('/api/news', methods=['POST'])
def fetch_news():
    data = request.json
    countries = data['countries']
    categories = data['categories']
    
    # Call your news API or AI service here
    articles = fetch_news_from_sources(
        countries=countries,
        categories=categories,
        search_query=data.get('searchQuery'),
        date_range=data.get('dateRange')
    )
    
    return jsonify({'articles': articles})

@app.route('/api/saved-articles', methods=['POST'])
def save_article():
    article = request.json
    article['id'] = str(datetime.now().timestamp())
    saved_articles.append(article)
    return jsonify(article)

if __name__ == '__main__':
    app.run(port=3000)
```

---

## 🤖 Using Claude API Directly

If you want to use Claude for summarization, you can add this to your backend:

```javascript
// Backend: Node.js example using Anthropic SDK
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

app.post('/api/ai/summarize', async (req, res) => {
  const { articles } = req.body;
  
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Summarize these news articles in 3 bullet points each: ${JSON.stringify(articles)}`
    }]
  });
  
  res.json({ summaries: message.content });
});
```

---

## 🔄 Migration Checklist

- [x] Remove all Base44 imports
- [x] Replace Base44 API calls with new API
- [x] Update environment variables
- [x] Create mock API service
- [x] Create real API client
- [x] Update authentication logic
- [x] Test with mock API
- [ ] Build your backend (or use existing one)
- [ ] Test with real API
- [ ] Deploy frontend
- [ ] Deploy backend

---

## 🎨 What Still Works

Everything! The app has the exact same features:

✅ News filtering by country/category  
✅ Search functionality  
✅ Date range selection  
✅ Article saving  
✅ Reading history  
✅ Social sharing  
✅ Responsive design  
✅ Smooth animations  

The **only** difference is what's happening behind the scenes - you now have full control over your backend!

---

## 💡 Recommended Next Steps

### For Development:
1. Use mock API (`VITE_USE_MOCK_API=true`)
2. Design and build your UI
3. Test all features with mock data

### For Production:
1. Build backend with the API endpoints above
2. Set `VITE_USE_MOCK_API=false`
3. Configure `VITE_API_URL` and `VITE_API_KEY`
4. Deploy frontend and backend
5. Connect to news APIs (NewsAPI, Claude, etc.)

---

## 🆘 Need Help?

**Mock API not working?**
- Check `.env` has `VITE_USE_MOCK_API=true`
- Restart dev server after changing .env
- Check browser console for errors

**Real API not working?**
- Verify `VITE_API_URL` is correct
- Check backend is running
- Verify CORS is configured on backend
- Check network tab in browser DevTools

**Build errors?**
- Run `npm install` to ensure all dependencies are installed
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Check all import paths are correct

---

## 📚 Additional Resources

- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [Anthropic Claude API](https://docs.anthropic.com/)
- [NewsAPI](https://newsapi.org/)
- [Express.js Guide](https://expressjs.com/)
- [Flask Documentation](https://flask.palletsprojects.com/)

---

**That's it!** You now have a completely Base44-free news aggregator that you can connect to any backend you choose. 🎉
