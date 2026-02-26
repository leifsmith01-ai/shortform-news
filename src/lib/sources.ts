// Trusted news source registry — mirrors the backend ALL_TRUSTED_SOURCES.
// Used by the FilterSidebar source picker and Settings page.

export interface TrustedSource {
  domain: string
  name: string
  group: string
}

export const TRUSTED_SOURCES: TrustedSource[] = [
  // General / Wire
  { domain: 'reuters.com',         name: 'Reuters',               group: 'General' },
  { domain: 'bbc.co.uk',           name: 'BBC News',              group: 'General' },
  { domain: 'bbc.com',             name: 'BBC (intl)',             group: 'General' },
  { domain: 'apnews.com',          name: 'Associated Press',      group: 'General' },
  { domain: 'theguardian.com',     name: 'The Guardian',          group: 'General' },
  { domain: 'abc.net.au',          name: 'ABC Australia',         group: 'General' },
  { domain: 'nytimes.com',         name: 'New York Times',        group: 'General' },
  { domain: 'washingtonpost.com',  name: 'Washington Post',       group: 'General' },
  { domain: 'aljazeera.com',       name: 'Al Jazeera',            group: 'General' },
  { domain: 'npr.org',             name: 'NPR',                   group: 'General' },
  { domain: 'cnn.com',             name: 'CNN',                   group: 'General' },
  { domain: 'abcnews.go.com',      name: 'ABC News',              group: 'General' },
  { domain: 'cbsnews.com',         name: 'CBS News',              group: 'General' },
  { domain: 'nbcnews.com',         name: 'NBC News',              group: 'General' },
  { domain: 'pbs.org',             name: 'PBS',                   group: 'General' },
  { domain: 'theconversation.com', name: 'The Conversation',      group: 'General' },
  { domain: 'axios.com',           name: 'Axios',                 group: 'General' },
  { domain: 'theatlantic.com',     name: 'The Atlantic',          group: 'General' },
  { domain: 'time.com',            name: 'Time',                  group: 'General' },
  { domain: 'usatoday.com',        name: 'USA Today',             group: 'General' },
  // Regional — Asia-Pacific
  { domain: 'smh.com.au',                  name: 'Sydney Morning Herald',      group: 'Regional' },
  { domain: 'theaustralian.com.au',         name: 'The Australian',             group: 'Regional' },
  { domain: 'scmp.com',                     name: 'South China Morning Post',   group: 'Regional' },
  { domain: 'caixinglobal.com',             name: 'Caixin Global',              group: 'Regional' },
  { domain: 'asia.nikkei.com',              name: 'Nikkei Asia',                group: 'Regional' },
  { domain: 'japantimes.co.jp',             name: 'Japan Times',                group: 'Regional' },
  { domain: 'koreaherald.com',              name: 'Korea Herald',               group: 'Regional' },
  { domain: 'straitstimes.com',             name: 'Straits Times',              group: 'Regional' },
  { domain: 'channelnewsasia.com',          name: 'Channel NewsAsia',           group: 'Regional' },
  { domain: 'bangkokpost.com',              name: 'Bangkok Post',               group: 'Regional' },
  { domain: 'jakartaglobe.id',              name: 'Jakarta Globe',              group: 'Regional' },
  { domain: 'inquirer.net',                 name: 'Philippine Daily Inquirer',  group: 'Regional' },
  { domain: 'rappler.com',                  name: 'Rappler',                    group: 'Regional' },
  { domain: 'timesofindia.indiatimes.com',  name: 'Times of India',             group: 'Regional' },
  { domain: 'thehindu.com',                 name: 'The Hindu',                  group: 'Regional' },
  // Regional — Europe
  { domain: 'france24.com',                 name: 'France 24',                  group: 'Regional' },
  { domain: 'dw.com',                       name: 'Deutsche Welle',             group: 'Regional' },
  { domain: 'independent.co.uk',            name: 'The Independent',            group: 'Regional' },
  { domain: 'kyivindependent.com',          name: 'Kyiv Independent',           group: 'Regional' },
  { domain: 'notesfrompoland.com',          name: 'Notes from Poland',          group: 'Regional' },
  { domain: 'meduza.io',                    name: 'Meduza',                     group: 'Regional' },
  // Regional — Middle East
  { domain: 'arabnews.com',                 name: 'Arab News',                  group: 'Regional' },
  { domain: 'thenationalnews.com',          name: 'The National',               group: 'Regional' },
  { domain: 'timesofisrael.com',            name: 'Times of Israel',            group: 'Regional' },
  { domain: 'middleeasteye.net',            name: 'Middle East Eye',            group: 'Regional' },
  // Regional — Africa
  { domain: 'dailymaverick.co.za',          name: 'Daily Maverick',             group: 'Regional' },
  { domain: 'businessday.ng',               name: 'BusinessDay Nigeria',        group: 'Regional' },
  { domain: 'nation.africa',                name: 'Nation Africa',              group: 'Regional' },
  { domain: 'africanews.com',               name: 'Africanews',                 group: 'Regional' },
  // Regional — Latin America
  { domain: 'brazilianreport.com',          name: 'The Brazilian Report',       group: 'Regional' },
  { domain: 'mercopress.com',               name: 'MercoPress',                 group: 'Regional' },
  { domain: 'batimes.com.ar',               name: 'Buenos Aires Times',         group: 'Regional' },
  { domain: 'mexiconewsdaily.com',          name: 'Mexico News Daily',          group: 'Regional' },
  // Business & Finance
  { domain: 'politico.com',       name: 'Politico',              group: 'Business & Finance' },
  { domain: 'economist.com',      name: 'The Economist',         group: 'Business & Finance' },
  { domain: 'ft.com',             name: 'Financial Times',       group: 'Business & Finance' },
  { domain: 'bloomberg.com',      name: 'Bloomberg',             group: 'Business & Finance' },
  { domain: 'wsj.com',            name: 'Wall Street Journal',   group: 'Business & Finance' },
  { domain: 'cnbc.com',           name: 'CNBC',                  group: 'Business & Finance' },
  { domain: 'forbes.com',         name: 'Forbes',                group: 'Business & Finance' },
  { domain: 'fortune.com',        name: 'Fortune',               group: 'Business & Finance' },
  // Technology
  { domain: 'arstechnica.com',      name: 'Ars Technica',          group: 'Technology' },
  { domain: 'wired.com',            name: 'Wired',                 group: 'Technology' },
  { domain: 'techcrunch.com',       name: 'TechCrunch',            group: 'Technology' },
  { domain: 'theverge.com',         name: 'The Verge',             group: 'Technology' },
  { domain: 'engadget.com',         name: 'Engadget',              group: 'Technology' },
  { domain: 'thenextweb.com',       name: 'The Next Web',          group: 'Technology' },
  { domain: 'technologyreview.com', name: 'MIT Technology Review', group: 'Technology' },
  { domain: 'venturebeat.com',      name: 'VentureBeat',           group: 'Technology' },
  { domain: 'zdnet.com',            name: 'ZDNet',                 group: 'Technology' },
  // Science
  { domain: 'nationalgeographic.com', name: 'National Geographic',   group: 'Science' },
  { domain: 'newscientist.com',       name: 'New Scientist',         group: 'Science' },
  { domain: 'scientificamerican.com', name: 'Scientific American',   group: 'Science' },
  { domain: 'nature.com',             name: 'Nature',                group: 'Science' },
  { domain: 'statnews.com',           name: 'STAT News',             group: 'Science' },
  // Sports
  { domain: 'espn.com',            name: 'ESPN',              group: 'Sports' },
  { domain: 'theathletic.com',     name: 'The Athletic',      group: 'Sports' },
  { domain: 'si.com',              name: 'Sports Illustrated', group: 'Sports' },
  { domain: 'skysports.com',       name: 'Sky Sports',        group: 'Sports' },
  { domain: 'bleacherreport.com',  name: 'Bleacher Report',   group: 'Sports' },
  // Gaming
  { domain: 'ign.com',              name: 'IGN',                  group: 'Gaming' },
  { domain: 'polygon.com',          name: 'Polygon',              group: 'Gaming' },
  { domain: 'eurogamer.net',        name: 'Eurogamer',            group: 'Gaming' },
  { domain: 'pcgamer.com',          name: 'PC Gamer',             group: 'Gaming' },
  { domain: 'kotaku.com',           name: 'Kotaku',               group: 'Gaming' },
  { domain: 'gamespot.com',         name: 'GameSpot',             group: 'Gaming' },
  { domain: 'rockpapershotgun.com', name: 'Rock Paper Shotgun',   group: 'Gaming' },
  // Film & TV
  { domain: 'variety.com',            name: 'Variety',               group: 'Film & TV' },
  { domain: 'hollywoodreporter.com',  name: 'Hollywood Reporter',    group: 'Film & TV' },
  { domain: 'deadline.com',           name: 'Deadline',              group: 'Film & TV' },
  { domain: 'ew.com',                 name: 'Entertainment Weekly',  group: 'Film & TV' },
  { domain: 'indiewire.com',          name: 'IndieWire',             group: 'Film & TV' },
  { domain: 'vulture.com',            name: 'Vulture',               group: 'Film & TV' },
  { domain: 'buzzfeed.com',           name: 'BuzzFeed',              group: 'Film & TV' },
]

// All domains (used as default when nothing is selected)
export const ALL_SOURCE_DOMAINS = TRUSTED_SOURCES.map(s => s.domain)

// Group names in display order
export const SOURCE_GROUPS = [
  'General',
  'Regional',
  'Business & Finance',
  'Technology',
  'Science',
  'Sports',
  'Gaming',
  'Film & TV',
]

// Group sources by their group field
export function getSourcesByGroup(): Record<string, TrustedSource[]> {
  const grouped: Record<string, TrustedSource[]> = {}
  for (const group of SOURCE_GROUPS) {
    grouped[group] = TRUSTED_SOURCES.filter(s => s.group === group)
  }
  return grouped
}
