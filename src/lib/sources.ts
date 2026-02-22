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
  // Regional
  { domain: 'smh.com.au',                  name: 'Sydney Morning Herald',     group: 'Regional' },
  { domain: 'theaustralian.com.au',         name: 'The Australian',            group: 'Regional' },
  { domain: 'france24.com',                 name: 'France 24',                 group: 'Regional' },
  { domain: 'dw.com',                       name: 'Deutsche Welle',            group: 'Regional' },
  { domain: 'scmp.com',                     name: 'South China Morning Post',  group: 'Regional' },
  { domain: 'timesofindia.indiatimes.com',  name: 'Times of India',            group: 'Regional' },
  { domain: 'thehindu.com',                 name: 'The Hindu',                 group: 'Regional' },
  { domain: 'japantimes.co.jp',             name: 'Japan Times',               group: 'Regional' },
  { domain: 'straitstimes.com',             name: 'Straits Times',             group: 'Regional' },
  // Business & Finance
  { domain: 'politico.com',  name: 'Politico',            group: 'Business & Finance' },
  { domain: 'economist.com', name: 'The Economist',       group: 'Business & Finance' },
  { domain: 'ft.com',        name: 'Financial Times',     group: 'Business & Finance' },
  { domain: 'bloomberg.com', name: 'Bloomberg',           group: 'Business & Finance' },
  { domain: 'wsj.com',       name: 'Wall Street Journal', group: 'Business & Finance' },
  // Technology
  { domain: 'arstechnica.com', name: 'Ars Technica',  group: 'Technology' },
  { domain: 'wired.com',       name: 'Wired',         group: 'Technology' },
  { domain: 'techcrunch.com',  name: 'TechCrunch',    group: 'Technology' },
  { domain: 'theverge.com',    name: 'The Verge',     group: 'Technology' },
  { domain: 'engadget.com',    name: 'Engadget',      group: 'Technology' },
  { domain: 'thenextweb.com',  name: 'The Next Web',  group: 'Technology' },
  // Science
  { domain: 'nationalgeographic.com', name: 'National Geographic', group: 'Science' },
  { domain: 'newscientist.com',       name: 'New Scientist',       group: 'Science' },
  // Sports
  { domain: 'espn.com', name: 'ESPN', group: 'Sports' },
  // Gaming
  { domain: 'ign.com',     name: 'IGN',     group: 'Gaming' },
  { domain: 'polygon.com', name: 'Polygon', group: 'Gaming' },
  // Film & TV
  { domain: 'ew.com',       name: 'Entertainment Weekly', group: 'Film & TV' },
  { domain: 'buzzfeed.com', name: 'BuzzFeed',             group: 'Film & TV' },
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
