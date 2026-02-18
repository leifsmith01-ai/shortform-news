// Finance API Service
// Provides mock finance news data for development

const MOCK_DELAY = 1000;

interface FinanceArticle {
  title: string;
  source: string;
  image_url: string;
  market: string;
  sector: string;
  index?: string;
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

const INDEX_HEADLINES: Record<string, { title: string; ticker: string; sentiment: 'bullish' | 'bearish' | 'neutral' }[]> = {
  sp500: [
    { title: 'S&P 500 climbs to record high as earnings season beats estimates', ticker: 'SPX', sentiment: 'bullish' },
    { title: 'S&P 500 retreats from highs as rate uncertainty weighs on sentiment', ticker: 'SPX', sentiment: 'bearish' },
    { title: 'Breadth improves across S&P 500 as rally broadens beyond mega-caps', ticker: 'SPX', sentiment: 'bullish' },
  ],
  nasdaq: [
    { title: 'Nasdaq 100 surges as AI-driven tech stocks extend winning streak', ticker: 'NDX', sentiment: 'bullish' },
    { title: 'Nasdaq pulls back as high-multiple growth stocks face valuation pressure', ticker: 'NDX', sentiment: 'bearish' },
    { title: 'Mega-cap tech leads Nasdaq recovery after brief correction', ticker: 'NDX', sentiment: 'bullish' },
  ],
  dow: [
    { title: 'Dow Jones hits fresh milestone on strong industrial earnings', ticker: 'DJIA', sentiment: 'bullish' },
    { title: 'Dow slides as defensive sectors underperform cyclical peers', ticker: 'DJIA', sentiment: 'bearish' },
    { title: 'Blue-chip stocks steady as Dow holds key technical support', ticker: 'DJIA', sentiment: 'neutral' },
  ],
  russell: [
    { title: 'Russell 2000 outperforms large-caps as rate cut hopes boost small-caps', ticker: 'RUT', sentiment: 'bullish' },
    { title: 'Small-cap index lags as credit conditions tighten for smaller firms', ticker: 'RUT', sentiment: 'bearish' },
    { title: 'Russell 2000 consolidates after sharp run-up in risk appetite', ticker: 'RUT', sentiment: 'neutral' },
  ],
  tsx: [
    { title: 'TSX Composite advances on energy and financials strength', ticker: 'TSX', sentiment: 'bullish' },
    { title: 'Canadian index slips as commodity prices weigh on resource stocks', ticker: 'TSX', sentiment: 'bearish' },
    { title: 'TSX holds steady as Bank of Canada signals cautious stance', ticker: 'TSX', sentiment: 'neutral' },
  ],
  bovespa: [
    { title: 'Bovespa rallies as Brazil inflation data comes in below forecast', ticker: 'IBOV', sentiment: 'bullish' },
    { title: 'Brazilian stocks fall on fiscal uncertainty and currency pressure', ticker: 'IBOV', sentiment: 'bearish' },
    { title: 'Petrobras and Vale drive Bovespa gains on commodity rebound', ticker: 'IBOV', sentiment: 'bullish' },
  ],
  ftse: [
    { title: 'FTSE 100 edges higher on mining and energy sector strength', ticker: 'UKX', sentiment: 'bullish' },
    { title: 'UK index dips as Bank of England flags persistent inflation risks', ticker: 'UKX', sentiment: 'bearish' },
    { title: 'FTSE 100 outperforms European peers on weaker pound tailwind', ticker: 'UKX', sentiment: 'bullish' },
  ],
  dax: [
    { title: 'DAX rallies as German manufacturing data surprises to the upside', ticker: 'DAX', sentiment: 'bullish' },
    { title: 'German index falls on energy cost concerns and weak export data', ticker: 'DAX', sentiment: 'bearish' },
    { title: 'DAX gains as ECB signals stable rates through mid-year', ticker: 'DAX', sentiment: 'bullish' },
  ],
  cac: [
    { title: 'CAC 40 rises on luxury goods sector strength and positive earnings', ticker: 'CAC', sentiment: 'bullish' },
    { title: 'French index retreats as political uncertainty weighs on sentiment', ticker: 'CAC', sentiment: 'bearish' },
    { title: 'CAC 40 steady amid mixed Eurozone economic signals', ticker: 'CAC', sentiment: 'neutral' },
  ],
  stoxx: [
    { title: 'Euro Stoxx 50 advances as eurozone PMI data signals recovery', ticker: 'SX5E', sentiment: 'bullish' },
    { title: 'Pan-European index dips on growth concerns and ECB uncertainty', ticker: 'SX5E', sentiment: 'bearish' },
    { title: 'Stoxx 50 finds support as corporate earnings broadly beat estimates', ticker: 'SX5E', sentiment: 'bullish' },
  ],
  ibex: [
    { title: 'IBEX 35 climbs as Spanish banking sector posts strong quarterly results', ticker: 'IBEX', sentiment: 'bullish' },
    { title: 'Spanish index lags peers amid tourism demand concerns', ticker: 'IBEX', sentiment: 'bearish' },
    { title: 'IBEX holds firm as Spain GDP growth outpaces EU average', ticker: 'IBEX', sentiment: 'neutral' },
  ],
  smi: [
    { title: 'SMI rises as Swiss pharma giants report solid earnings growth', ticker: 'SMI', sentiment: 'bullish' },
    { title: 'Swiss index slips on strong franc pressure for exporters', ticker: 'SMI', sentiment: 'bearish' },
    { title: 'SMI steady as SNB maintains rate stance and watches inflation', ticker: 'SMI', sentiment: 'neutral' },
  ],
  nikkei: [
    { title: 'Nikkei 225 surges as yen weakness boosts Japanese exporters', ticker: 'N225', sentiment: 'bullish' },
    { title: 'Japanese index retreats as BoJ hints at earlier rate normalisation', ticker: 'N225', sentiment: 'bearish' },
    { title: 'Nikkei hits multi-decade high on corporate governance reform momentum', ticker: 'N225', sentiment: 'bullish' },
  ],
  hangseng: [
    { title: 'Hang Seng rebounds on stimulus hopes and tech sector recovery', ticker: 'HSI', sentiment: 'bullish' },
    { title: 'Hong Kong index falls as geopolitical tensions dampen risk appetite', ticker: 'HSI', sentiment: 'bearish' },
    { title: 'Hang Seng stabilises as China property sector shows tentative signs of recovery', ticker: 'HSI', sentiment: 'neutral' },
  ],
  csi300: [
    { title: 'CSI 300 jumps on broad stimulus package from Chinese authorities', ticker: 'CSI300', sentiment: 'bullish' },
    { title: 'Chinese stocks slip on mixed economic data and trade uncertainty', ticker: 'CSI300', sentiment: 'bearish' },
    { title: 'CSI 300 consolidates as investors await next policy catalyst', ticker: 'CSI300', sentiment: 'neutral' },
  ],
  asx: [
    { title: 'ASX 200 advances on commodity strength and RBA rate pause', ticker: 'AS51', sentiment: 'bullish' },
    { title: 'Australian index weakens as mining stocks face China demand worries', ticker: 'AS51', sentiment: 'bearish' },
    { title: 'ASX 200 holds near record as financials and resources balance out', ticker: 'AS51', sentiment: 'neutral' },
  ],
  kospi: [
    { title: 'KOSPI gains as Samsung and SK Hynix rally on chip demand outlook', ticker: 'KOSPI', sentiment: 'bullish' },
    { title: 'Korean index falls on geopolitical tensions and export slowdown', ticker: 'KOSPI', sentiment: 'bearish' },
    { title: 'KOSPI steadies as foreign investors return to Korean equities', ticker: 'KOSPI', sentiment: 'neutral' },
  ],
  sensex: [
    { title: 'Sensex hits fresh record as India GDP growth impresses investors', ticker: 'SENSEX', sentiment: 'bullish' },
    { title: 'Indian index pulls back on foreign outflows and rupee weakness', ticker: 'SENSEX', sentiment: 'bearish' },
    { title: 'Sensex rebounds as RBI holds rates and inflation moderates', ticker: 'SENSEX', sentiment: 'bullish' },
  ],
};

const generateFinanceArticles = (
  markets: string[],
  sectors: string[],
  indices: string[],
  count = 3
): FinanceArticle[] => {
  const articles: FinanceArticle[] = [];
  const times = ['1 hour ago', '3 hours ago', '6 hours ago', '12 hours ago', '1 day ago'];

  // Index-specific articles (when indices are selected)
  for (const indexId of indices) {
    const headlines = INDEX_HEADLINES[indexId] || [];
    for (let i = 0; i < Math.min(count, headlines.length); i++) {
      const headline = headlines[i];
      articles.push({
        title: headline.title,
        source: FINANCE_SOURCES[Math.floor(Math.random() * FINANCE_SOURCES.length)],
        image_url: `https://source.unsplash.com/800x600/?stockmarket,trading&sig=${Math.random()}`,
        market: 'stocks',
        sector: 'financial',
        index: indexId,
        url: `https://example.com/finance/index-${indexId}-${i}`,
        time_ago: times[Math.floor(Math.random() * times.length)],
        views: Math.floor(Math.random() * 80000) + 15000,
        sentiment: headline.sentiment,
        ticker: headline.ticker,
        price_change: (Math.random() - 0.4) * 4,
        summary_points: [
          `The ${headline.ticker} index reflects broader market sentiment driven by macro and earnings factors.`,
          `Analysts note key technical and fundamental levels investors should watch closely.`,
          `Forward guidance from leading constituents will be critical for sustained momentum.`
        ]
      });
    }
  }

  // Market + sector articles
  for (const market of markets) {
    for (const sector of sectors) {
      const marketHeadlines = FINANCE_HEADLINES[market] || FINANCE_HEADLINES.stocks;
      const sectorHeadlines = SECTOR_HEADLINES[sector] || SECTOR_HEADLINES.tech;

      for (let i = 0; i < Math.min(count, marketHeadlines.length); i++) {
        const headline = marketHeadlines[i];
        articles.push({
          title: headline.title,
          source: FINANCE_SOURCES[Math.floor(Math.random() * FINANCE_SOURCES.length)],
          image_url: `https://source.unsplash.com/800x600/?finance,${market}&sig=${Math.random()}`,
          market,
          sector,
          url: `https://example.com/finance/${market}-${sector}-${i}`,
          time_ago: times[Math.floor(Math.random() * times.length)],
          views: Math.floor(Math.random() * 80000) + 15000,
          sentiment: headline.sentiment,
          ticker: headline.ticker,
          price_change: (Math.random() - 0.4) * 8,
          summary_points: [
            `Market analysis indicates significant ${headline.sentiment} momentum in the ${market} sector.`,
            `Analysts highlight key drivers and potential risks for investors to monitor.`,
            `Industry experts provide forward-looking guidance and strategic outlook.`
          ]
        });
      }

      const sectorCount = Math.min(2, sectorHeadlines.length);
      for (let i = 0; i < sectorCount; i++) {
        const sentiments: ('bullish' | 'bearish' | 'neutral')[] = ['bullish', 'bearish', 'neutral'];
        articles.push({
          title: sectorHeadlines[i],
          source: FINANCE_SOURCES[Math.floor(Math.random() * FINANCE_SOURCES.length)],
          image_url: `https://source.unsplash.com/800x600/?business,${sector}&sig=${Math.random()}`,
          market,
          sector,
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
  indices: string[];
  searchQuery?: string;
  dateRange?: string;
}): Promise<{ articles: FinanceArticle[] }> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));

  const { markets, sectors, indices, searchQuery } = params;
  let articles = generateFinanceArticles(markets, sectors, indices);

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
