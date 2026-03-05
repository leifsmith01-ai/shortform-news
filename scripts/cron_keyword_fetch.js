/**
 * cron_keyword_fetch.js
 * 
 * Scheduled job to fetch and embed articles for all tracked keywords.
 * Triggered by a GitHub Actions workflow every 8 hours.
 * 
 * Environment Variables Required:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - GEMINI_API_KEY
 * - (And your regular news API keys from .env)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load environment variables
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env.local') });
dotenv.config({ path: resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing Supabase credentials. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// We'll import the backend query builders directly from the server-side news API file
// Note: We need a way to invoke the same fetch logic used in api/news.js
// For the cron, we could hit our own /api/news endpoint, but to avoid vercel timeouts
// and extra hop costs, we can duplicate the core fetch logic here or refactor news.js to expose it.
// For now, let's keep it self-contained or import the fetchers if they are modular.

// Workaround to import from api/news.js (which is a CJS-like file or ES module depending on project setup)
// To keep things simple and robust for this background task, we'll hit the /api/news endpoint 
// hosted on production (or local if testing), since it's already built to handle fan-out.
// 
// Actually, hitting our own API is best for maintenance. The API already orchestrates all 7 sources.
// We just need a way to bypass the response return and instead store it.
// Wait, the API returns the JSON. We can just HTTP GET/POST the API from this script,
// get the articles, embed them, and save to Supabase.

const API_BASE_URL = process.env.APP_ORIGIN || 'https://shortform.news';

// ── 1. Embedding Helper ───────────────────────────────────────────────────────

/**
 * Generate embedding for text using Gemini.
 * Uses text-embedding-004 model (768 dimensions).
 */
async function generateEmbedding(text) {
    if (!GEMINI_API_KEY) {
        console.warn("Missing GEMINI_API_KEY, cannot generate embedding.");
        return null;
    }

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`;

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "models/text-embedding-004",
                content: {
                    parts: [{ text: text }],
                },
            }),
        });

        if (!response.ok) {
            throw new Error(`Gemini embedding error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.embedding?.values || null;
    } catch (err) {
        console.error(`Failed to embed text: ${text.substring(0, 50)}...`, err.message);
        return null;
    }
}

// ── 2. Main Execution ─────────────────────────────────────────────────────────

async function main() {
    console.log("=== Starting Background Keyword Fetch & Embed ===");
    const startTime = Date.now();

    try {
        // 1. Get all unique active tracked keywords
        const { data: activeKeywords, error: kwError } = await supabase
            .from('tracked_keywords')
            .select('id, keyword');

        if (kwError) throw kwError;

        if (!activeKeywords || activeKeywords.length === 0) {
            console.log("No keywords tracked. Exiting.");
            return;
        }

        // Deduplicate by the actual string to avoid redundant API calls
        const uniqueKeywords = new Map();
        for (const kw of activeKeywords) {
            const lower = kw.keyword.toLowerCase().trim();
            if (!uniqueKeywords.has(lower)) {
                uniqueKeywords.set(lower, []);
            }
            uniqueKeywords.get(lower).push(kw.id);
        }

        console.log(`Found ${activeKeywords.length} total tracked keywords, representing ${uniqueKeywords.size} unique terms.`);

        // 2. Process each unique keyword sequentially to avoid rate limits
        let totalStored = 0;

        for (const [kwString, keywordIds] of uniqueKeywords.entries()) {
            console.log(`\n> Processing keyword: "${kwString}" (associated with ${keywordIds.length} users)`);

            try {
                // Option A: Hit our own deployed API endpoint
                // Option B: Hit local API if testing
                const fetchUrl = (process.env.NODE_ENV === 'development' || !process.env.APP_ORIGIN)
                    ? 'http://localhost:3000/api/news'
                    : `${API_BASE_URL}/api/news`;

                console.log(`  Fetching live articles from ${fetchUrl}...`);

                const reqBody = {
                    searchQuery: kwString,
                    mode: 'keyword',
                    dateRange: '24h', // Only grab recent stuff to stay fast
                    strictMode: false,
                    // Pass a secret to bypass cached responses or rate limits if configured in news.js
                    forceRefresh: true
                };

                const apiRes = await fetch(fetchUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(reqBody)
                });

                if (!apiRes.ok) {
                    console.error(`  Failed to fetch: ${apiRes.status} ${apiRes.statusText}`);
                    continue;
                }

                const data = await apiRes.json();
                const articles = data.articles || [];

                console.log(`  Found ${articles.length} articles via APIs. Filtering and preparing for DB...`);

                // Limit the number of articles we embed/store per run (e.g., top 15 most relevant)
                const topArticles = articles.slice(0, 15);

                let newStoredCount = 0;

                for (const article of topArticles) {
                    // Build text to embed (title + desc + content preview)
                    const textToEmbed = `${article.title || ''}. ${article.description || ''}. ${article.content || ''}`
                        .replace(/\s+/g, ' ')
                        .trim()
                        .substring(0, 2000); // Limit to 2000 chars for embedding to save tokens

                    if (!textToEmbed) continue;

                    const embedding = await generateEmbedding(textToEmbed);
                    if (!embedding) continue;

                    // Upsert into keyword_articles for EACH user tracking this term
                    // Ensure article_url and title are present
                    if (!article.url || !article.title) continue;

                    const rowsToInsert = keywordIds.map(kwId => ({
                        keyword_id: kwId,
                        article_url: article.url,
                        title: article.title,
                        description: article.description,
                        content: article.content,
                        source: article.source?.name || article.source || null,
                        image_url: article.image,
                        published_at: article.publishedAt,
                        author: article.author,
                        country: article._countryScore > 0 ? 'inferred' : null, // Not strictly needed
                        category: article.category || 'world',
                        embedding: embedding
                    }));

                    // Use ON CONFLICT ON CONSTRAINT to ignore duplicates seamlessly
                    const { error: insertError } = await supabase
                        .from('keyword_articles')
                        .upsert(rowsToInsert, { onConflict: 'keyword_id, article_url', ignoreDuplicates: true });

                    if (insertError) {
                        console.error("  Error inserting article:", insertError.message);
                    } else {
                        newStoredCount++;
                    }
                }

                totalStored += newStoredCount;
                console.log(`  Successfully stored/updated ${newStoredCount} articles.`);

                // Brief pause to respect API rate limits (Gemini is 15 RPM on free tier, 1500 RPD)
                // If we process 15 articles, we might hit 15 RPM fast. Let's delay ~500ms per article or just 
                // a 2-second buffer between keywords.
                await new Promise(r => setTimeout(r, 2000));

            } catch (err) {
                console.error(`  Failed processing keyword "${kwString}":`, err.message);
            }
        }

        console.log(`\n=== Job Complete. Total inserted/updated across all keywords: ${totalStored} ===`);
        console.log(`Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    } catch (err) {
        console.error("Fatal error during cron job:", err);
        process.exit(1);
    }
}

main();
