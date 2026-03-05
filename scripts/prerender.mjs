/**
 * Post-build prerender script.
 *
 * Runs after `vite build`. For each public route it:
 *  1. Reads dist/index.html (the SPA shell produced by Vite)
 *  2. Injects route-specific <title>, <meta name="description">,
 *     <link rel="canonical">, og:title, og:description, og:url into <head>
 *  3. Writes the result as a standalone HTML file in dist/
 *
 * Vercel then serves each file directly for its route (see vercel.json rewrites),
 * so crawlers see fully-populated <head> metadata without executing JavaScript.
 * React still hydrates normally on the client — nothing changes for users.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

const BASE_URL = 'https://shortform.news';

const routes = [
  {
    outFile: 'index.html', // overwrites the Vite-generated shell with home meta tags
    title: 'Latest News in Brief | Shortform',
    description:
      'Get the latest breaking news in short-form summaries. AI-powered headlines from trusted sources worldwide, updated every hour.',
    canonical: `${BASE_URL}/`,
  },
  {
    outFile: 'trending.html',
    title: 'Trending News Right Now | Shortform',
    description:
      "Discover what's trending right now. The most-read short-form news stories from around the world, updated in real time.",
    canonical: `${BASE_URL}/trending`,
  },
  {
    outFile: 'finance.html',
    title: 'Finance & Markets News | Shortform',
    description:
      'Stay on top of markets and business news with short-form financial summaries. Stocks, crypto, and economic news in brief.',
    canonical: `${BASE_URL}/finance`,
  },
  {
    outFile: 'personalized.html',
    title: 'Your Personalised News Feed | Shortform',
    description:
      'Your personalised news feed, powered by AI. Short-form news summaries tailored to your interests and reading habits.',
    canonical: `${BASE_URL}/personalized`,
  },
  {
    outFile: 'keywords.html',
    title: 'News Keyword Monitoring | Shortform',
    description:
      'Monitor breaking news with keyword alerts. Search and track the topics that matter to you with short-form summaries.',
    canonical: `${BASE_URL}/keywords`,
  },
  {
    outFile: 'about.html',
    title: 'About Shortform | Shortform',
    description:
      'About Shortform — the AI-powered news aggregator delivering short-form summaries from trusted sources worldwide, tailored by country and category.',
    canonical: `${BASE_URL}/about`,
  },
  {
    outFile: 'privacy-policy.html',
    title: 'Privacy Policy | Shortform',
    description:
      'Shortform Privacy Policy — how we collect, use, and protect your data when you use our AI-powered news service.',
    canonical: `${BASE_URL}/privacy-policy`,
  },
];

const template = readFileSync(join(distDir, 'index.html'), 'utf8');

// Escape a string for safe injection into an HTML attribute value.
function escAttr(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

for (const route of routes) {
  const { outFile, title, description, canonical } = route;
  const safeTitle = escAttr(title);
  const safeDesc = escAttr(description);
  const safeCanonical = escAttr(canonical);

  let html = template;

  // 1. Replace <title>
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${safeTitle}</title>`,
  );

  // 2. Replace <meta name="description">
  html = html.replace(
    /<meta name="description" content="[^"]*"/,
    `<meta name="description" content="${safeDesc}"`,
  );

  // 3. Inject canonical, og:title, og:description, og:url just before </head>
  const headInject = [
    `  <link rel="canonical" href="${safeCanonical}" />`,
    `  <meta property="og:title" content="${safeTitle}" />`,
    `  <meta property="og:description" content="${safeDesc}" />`,
    `  <meta property="og:url" content="${safeCanonical}" />`,
    `  <meta property="twitter:title" content="${safeTitle}" />`,
    `  <meta property="twitter:description" content="${safeDesc}" />`,
  ].join('\n');

  html = html.replace('</head>', `${headInject}\n</head>`);

  writeFileSync(join(distDir, outFile), html, 'utf8');
  console.log(`[prerender] wrote dist/${outFile} — ${title}`);
}

console.log(`[prerender] done — ${routes.length} routes pre-rendered.`);
