// Mock API Service - Use this for development without a backend
// Replace with real API calls when backend is ready

const MOCK_DELAY = 1000; // Simulate network delay

interface Article {
  title: string;
  source: string;
  image_url: string;
  country: string;
  category: string;
  url: string;
  time_ago: string;
  views: number;
  summary_points: string[];
  [key: string]: unknown;
}

// Mock news data
const generateMockArticles = (countries: string[], categories: string[], count = 5): Article[] => {
  const sources = [
    'Reuters', 'BBC News', 'The New York Times', 'The Guardian', 'CNN',
    'Al Jazeera', 'The Washington Post', 'Financial Times', 'Bloomberg',
    'Associated Press', 'NPR', 'The Wall Street Journal'
  ];

  const headlines: Record<string, string[]> = {
    'health-tech-science': [
      'New AI breakthrough promises to revolutionize healthcare diagnostics',
      'Scientists discover potentially habitable exoplanet',
      'Breakthrough in quantum computing brings practical applications closer',
      'New medical treatment shows remarkable results in trials',
      'Climate research shows accelerating environmental changes'
    ],
    business: [
      'Global markets rally on positive economic indicators',
      'Major merger announcement reshapes industry landscape',
      'Central bank announces policy changes affecting interest rates',
      'Startup raises record funding in latest investment round',
      'Trade agreement reached between major economic powers'
    ],
    sports: [
      'Underdog team pulls off stunning championship victory',
      'Star athlete announces retirement after decorated career',
      'Olympic preparations enter final phase',
      'Record-breaking performance stuns sports world',
      'Major tournament announces expanded format'
    ],
    entertainment: [
      'Highly anticipated game sequel breaks sales records on launch day',
      'Blockbuster film breaks box office records worldwide',
      'Hit series renewed for multiple new seasons',
      'Major studio announces ambitious cinematic universe plans',
      'Esports tournament draws millions of viewers worldwide'
    ],
    politics: [
      'Legislative body passes landmark reform bill',
      'International summit addresses global challenges',
      'Election results signal major political shift',
      'Policy announcement impacts millions of citizens',
      'Diplomatic breakthrough eases regional tensions'
    ],
    world: [
      'International cooperation yields humanitarian progress',
      'Natural disaster prompts massive relief effort',
      'Cultural heritage site gains UNESCO recognition',
      'Border agreement reached after lengthy negotiations',
      'Global initiative tackles pressing social issues'
    ]
  };

  const articles: Article[] = [];

  for (const country of countries) {
    for (const category of categories) {
      const categoryHeadlines = headlines[category] || headlines.world;

      for (let i = 0; i < Math.min(count, categoryHeadlines.length); i++) {
        articles.push({
          title: `[${country.toUpperCase()}] ${categoryHeadlines[i]}`,
          source: sources[Math.floor(Math.random() * sources.length)],
          image_url: `https://source.unsplash.com/800x600/?${category},news&sig=${country}-${i}`,
          country: country,
          category: category,
          url: `https://example.com/news/${category}-${country}-${i}`,
          time_ago: ['2 hours ago', '5 hours ago', '1 day ago', '2 days ago'][Math.floor(Math.random() * 4)],
          views: Math.floor(Math.random() * 50000) + 10000,
          summary_points: [
            `Key development in the ${country.toUpperCase()} ${category} sector shows significant progress.`,
            `Experts in ${country.toUpperCase()} analyze implications for local stakeholders and broader trends.`,
            `Officials and analysts provide context and future outlook for the ${country.toUpperCase()} situation.`
          ]
        });
      }
    }
  }

  return articles;
};

class MockApiService {
  private cache: Map<string, { articles: Article[] }>;
  private savedArticles: (Article & { id: string; saved_date: string })[];
  private readingHistory: (Record<string, unknown> & { id: string; read_date: string })[];

  constructor() {
    this.cache = new Map();
    this.savedArticles = [];
    this.readingHistory = [];
  }

  async delay(ms = MOCK_DELAY) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async fetchNews(params: { countries: string[]; categories: string[]; searchQuery?: string }) {
    await this.delay();

    const { countries, categories, searchQuery } = params;
    let articles = generateMockArticles(countries, categories);

    // Filter by search query if provided
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      articles = articles.filter(article =>
        article.title.toLowerCase().includes(query) ||
        article.summary_points.some(point => point.toLowerCase().includes(query))
      );
    }

    return { articles };
  }

  async getCachedNews(date: string, country: string, category: string) {
    await this.delay(200);

    const key = `${date}-${country}-${category}`;
    return this.cache.get(key) || null;
  }

  async cacheNews(data: { fetch_date: string; country: string; category: string; articles: Article[] }) {
    await this.delay(100);

    const { fetch_date, country, category, articles } = data;
    const key = `${fetch_date}-${country}-${category}`;
    this.cache.set(key, { articles });
    return { success: true };
  }

  async getSavedArticles() {
    await this.delay(300);
    return this.savedArticles;
  }

  async saveArticle(article: Record<string, unknown>) {
    await this.delay(200);

    const savedArticle = {
      ...article,
      id: Date.now().toString(),
      saved_date: new Date().toISOString()
    };

    this.savedArticles.push(savedArticle as Article & { id: string; saved_date: string });
    return savedArticle;
  }

  async unsaveArticle(articleId: string) {
    await this.delay(200);

    this.savedArticles = this.savedArticles.filter(a => a.id !== articleId);
    return { success: true };
  }

  async getReadingHistory() {
    await this.delay(300);
    return this.readingHistory;
  }

  async addToHistory(article: Record<string, unknown>) {
    await this.delay(100);

    const historyEntry = {
      ...article,
      id: Date.now().toString(),
      read_date: new Date().toISOString()
    };

    this.readingHistory.unshift(historyEntry);

    // Keep only last 100 entries
    if (this.readingHistory.length > 100) {
      this.readingHistory = this.readingHistory.slice(0, 100);
    }

    return historyEntry;
  }

  async summarizeWithClaude(articles: unknown[]) {
    await this.delay();
    // Mock AI summarization - in reality, this would call Claude API
    return {
      summaries: (articles as Article[]).map(article => ({
        ...article,
        summary_points: [
          `AI-generated summary point 1 for: ${article.title}`,
          `AI-generated summary point 2 analyzing key aspects.`,
          `AI-generated summary point 3 with conclusions.`
        ]
      }))
    };
  }
}

// Export singleton
export const mockApiService = new MockApiService();
export default MockApiService;
