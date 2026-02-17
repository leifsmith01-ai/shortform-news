// Finance API Service
// Provides mock finance news data for development

const MOCK_DELAY = 1000;

interface FinanceArticle {
  title: string;
  source: string;
  image_url: string;
  market: string;
  sector: string;
  region: string;
  url: string;
  time_ago: string;
  views: number;
  summary_points: string[];
  sentiment: 'bullish' | 'bearish' | 'neutral';
  ticker?: string;
  price_change?: number;
}

const FINANCE_SOURCES = [
  'Bloomberg', 'Reuters', 'Financial Times', 'The Wall Street Journal',
  'CNBC', 'MarketWatch', 'Barron\'s', 'The Economist',
  'Forbes', 'Seeking Alpha', 'Yahoo Finance', 'Investopedia'
];

const FINANCE_HEADLINES: Record<string, { title: string; ticker?: string; sentiment: 'bullish' | 'bearish' | 'neutral' }[]> = {
  stocks: [
    { title: 'S&P 500 reaches new all-time high amid strong earnings season', ticker: 'SPY', sentiment: 'bullish' },
    { title: 'Tech mega-caps lead market rally as AI spending accelerates', ticker: 'QQQ', sentiment: 'bullish' },
    { title: 'Small-cap stocks surge on improved economic outlook', ticker: 'IWM', sentiment: 'bullish' },
    { title: 'Market volatility spikes as geopolitical tensions escalate', ticker: 'VIX', sentiment: 'bearish' },
    { title: 'Dividend aristocrats outperform growth stocks in latest quarter', ticker: 'NOBL', sentiment: 'neutral' },
  ],
  crypto: [
    { title: 'Bitcoin surges past key resistance level on institutional demand', ticker: 'BTC', sentiment: 'bullish' },
    { title: 'Ethereum network upgrade drives renewed investor interest', ticker: 'ETH', sentiment: 'bullish' },
    { title: 'Regulatory clarity boosts crypto market sentiment globally', sentiment: 'bullish' },
    { title: 'DeFi protocols see record total value locked in new cycle', sentiment: 'neutral' },
    { title: 'Crypto exchange volumes surge as retail interest returns', sentiment: 'bullish' },
  ],
  forex: [
    { title: 'Dollar index weakens as Fed signals potential rate adjustments', ticker: 'DXY', sentiment: 'bearish' },
    { title: 'Euro strengthens against dollar on positive eurozone data', ticker: 'EURUSD', sentiment: 'bullish' },
    { title: 'Yen carry trade unwind sends shockwaves through FX markets', ticker: 'USDJPY', sentiment: 'bearish' },
    { title: 'Emerging market currencies rally on commodity price rebound', sentiment: 'bullish' },
    { title: 'Central bank divergence creates new opportunities in FX', sentiment: 'neutral' },
  ],
  commodities: [
    { title: 'Oil prices climb on OPEC+ supply cut extension agreement', ticker: 'CL', sentiment: 'bullish' },
    { title: 'Gold reaches record high as safe-haven demand surges', ticker: 'GC', sentiment: 'bullish' },
    { title: 'Copper prices signal economic recovery with multi-month highs', ticker: 'HG', sentiment: 'bullish' },
    { title: 'Natural gas futures drop on mild weather forecast', ticker: 'NG', sentiment: 'bearish' },
    { title: 'Agricultural commodities rally on global supply concerns', sentiment: 'neutral' },
  ],
  bonds: [
    { title: 'Treasury yields drop as economic data shows cooling inflation', sentiment: 'bullish' },
    { title: '10-year yield curve steepens on revised growth expectations', sentiment: 'neutral' },
    { title: 'Corporate bond spreads tighten as default rates remain low', sentiment: 'bullish' },
    { title: 'Municipal bond demand surges ahead of tax season', sentiment: 'neutral' },
    { title: 'High-yield bonds attract record inflows in current quarter', sentiment: 'bullish' },
  ],
  realestate: [
    { title: 'Commercial real estate shows signs of recovery in major markets', sentiment: 'bullish' },
    { title: 'Housing starts surge as mortgage rates stabilize', sentiment: 'bullish' },
    { title: 'REIT sector outperforms broader market on yield appeal', sentiment: 'bullish' },
    { title: 'Office vacancy rates hit new peak in downtown corridors', sentiment: 'bearish' },
    { title: 'Data center REITs surge on AI infrastructure demand', sentiment: 'bullish' },
  ],
};

const SECTOR_HEADLINES: Record<string, string[]> = {
  tech: [
    'AI chip demand creates supply bottleneck for leading manufacturers',
    'Cloud computing revenue growth accelerates across major platforms',
    'Cybersecurity spending increases as threat landscape evolves',
    'Enterprise software companies report strong subscription growth',
    'Semiconductor industry forecasts record revenues for upcoming quarter',
  ],
  healthcare: [
    'Biotech sector rallies on breakthrough drug approval announcements',
    'Healthcare costs stabilize as value-based care models expand',
    'Pharmaceutical M&A activity heats up in specialty drug market',
    'Digital health investments reach new highs in venture capital',
    'Medical device companies report strong international growth',
  ],
  energy: [
    'Renewable energy investment surpasses fossil fuels for first time',
    'Oil majors announce increased spending on clean energy transition',
    'Solar panel costs continue to decline driving adoption rates up',
    'Nuclear energy revival gains momentum with new reactor designs',
    'Energy storage breakthrough could transform grid reliability',
  ],
  financial: [
    'Major banks report strong trading revenue amid market volatility',
    'Fintech disruption continues reshaping payment landscape globally',
    'Insurance sector benefits from rising premium rates',
    'Asset management industry consolidation accelerates',
    'Digital banking adoption reaches mainstream inflection point',
  ],
  consumer: [
    'Consumer spending remains resilient despite inflation concerns',
    'E-commerce growth reaccelerates as omnichannel strategies pay off',
    'Luxury goods demand surges in emerging markets',
    'Private label brands gain market share from national brands',
    'Subscription economy continues rapid growth trajectory',
  ],
  industrial: [
    'Manufacturing PMI signals expansion for third consecutive month',
    'Automation investment accelerates across industrial sectors',
    'Supply chain normalization boosts industrial production capacity',
    'Infrastructure spending creates opportunities in heavy equipment',
    'Reshoring trend drives factory construction boom domestically',
  ],
  materials: [
    'Lithium prices stabilize as battery demand meets new supply',
    'Steel producers benefit from infrastructure spending wave',
    'Rare earth minerals become strategic priority for governments',
    'Sustainable materials innovation attracts venture investment',
    'Mining companies boost dividends on strong commodity prices',
  ],
  utilities: [
    'Utility companies invest heavily in grid modernization',
    'Regulated utilities provide stability in volatile market',
    'Water infrastructure spending becomes national priority',
    'Electric vehicle charging networks expand utility revenue',
    'Clean energy mandates drive utility sector transformation',
  ],
};

const generateFinanceArticles = (
  markets: string[],
  sectors: string[],
  regions: string[],
  count = 3
): FinanceArticle[] => {
  const articles: FinanceArticle[] = [];

  for (const market of markets) {
    for (const sector of sectors) {
      const marketHeadlines = FINANCE_HEADLINES[market] || FINANCE_HEADLINES.stocks;
      const sectorHeadlines = SECTOR_HEADLINES[sector] || SECTOR_HEADLINES.tech;
      const region = regions[Math.floor(Math.random() * regions.length)] || 'us';

      // Add market-specific articles
      for (let i = 0; i < Math.min(count, marketHeadlines.length); i++) {
        const headline = marketHeadlines[i];
        articles.push({
          title: headline.title,
          source: FINANCE_SOURCES[Math.floor(Math.random() * FINANCE_SOURCES.length)],
          image_url: `https://source.unsplash.com/800x600/?finance,${market}&sig=${Math.random()}`,
          market,
          sector,
          region,
          url: `https://example.com/finance/${market}-${sector}-${i}`,
          time_ago: ['1 hour ago', '3 hours ago', '6 hours ago', '12 hours ago', '1 day ago'][Math.floor(Math.random() * 5)],
          views: Math.floor(Math.random() * 80000) + 15000,
          sentiment: headline.sentiment,
          ticker: headline.ticker,
          price_change: (Math.random() - 0.4) * 8, // -3.2 to +4.8
          summary_points: [
            `Market analysis indicates significant ${headline.sentiment} momentum in ${market} sector.`,
            `Analysts highlight key drivers and potential risks for investors to monitor.`,
            `Industry experts provide forward-looking guidance and strategic outlook.`
          ]
        });
      }

      // Add sector-specific articles (fewer to avoid overwhelming)
      const sectorCount = Math.min(2, sectorHeadlines.length);
      for (let i = 0; i < sectorCount; i++) {
        const sentiments: ('bullish' | 'bearish' | 'neutral')[] = ['bullish', 'bearish', 'neutral'];
        articles.push({
          title: sectorHeadlines[i],
          source: FINANCE_SOURCES[Math.floor(Math.random() * FINANCE_SOURCES.length)],
          image_url: `https://source.unsplash.com/800x600/?business,${sector}&sig=${Math.random()}`,
          market,
          sector,
          region,
          url: `https://example.com/finance/sector-${sector}-${i}`,
          time_ago: ['2 hours ago', '5 hours ago', '1 day ago', '2 days ago'][Math.floor(Math.random() * 4)],
          views: Math.floor(Math.random() * 50000) + 10000,
          sentiment: sentiments[Math.floor(Math.random() * sentiments.length)],
          price_change: (Math.random() - 0.5) * 6,
          summary_points: [
            `Key development in the ${sector} sector shows significant impact on market dynamics.`,
            `Analysts weigh in on the implications for portfolio allocation strategies.`,
            `Forward guidance suggests continued momentum through the current quarter.`
          ]
        });
      }
    }
  }

  return articles;
};

export async function fetchFinanceNews(params: {
  markets: string[];
  sectors: string[];
  regions: string[];
  searchQuery?: string;
  dateRange?: string;
}): Promise<{ articles: FinanceArticle[] }> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));

  const { markets, sectors, regions, searchQuery } = params;
  let articles = generateFinanceArticles(markets, sectors, regions);

  // Filter by search query if provided
  if (searchQuery && searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    articles = articles.filter(article =>
      article.title.toLowerCase().includes(query) ||
      article.summary_points.some(point => point.toLowerCase().includes(query)) ||
      (article.ticker && article.ticker.toLowerCase().includes(query))
    );
  }

  return { articles };
}
