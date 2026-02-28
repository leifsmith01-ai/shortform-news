import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Globe, Newspaper, ChevronDown, Search, Calendar, Flame, TrendingUp, Tag, Sparkles, Bookmark, Clock, Building2, Settings, Languages } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TRUSTED_SOURCES, SOURCE_GROUPS, ALL_SOURCE_DOMAINS } from '@/lib/sources';

const NAV_LINKS = [
  { name: 'Trending',  icon: Flame,      page: '/trending' },
  { name: 'Finance',   icon: TrendingUp, page: '/finance' },
  { name: 'Keywords',  icon: Tag,        page: '/keywords' },
  { name: 'For You',   icon: Sparkles,   page: '/personalized' },
  { name: 'Saved',     icon: Bookmark,   page: '/saved' },
  { name: 'History',   icon: Clock,      page: '/history' },
  { name: 'Settings',  icon: Settings,   page: '/settings' },
];

const COUNTRIES_BY_CONTINENT = {
  'North America': [
    { code: 'us', name: 'United States', flag: '🇺🇸' },
    { code: 'ca', name: 'Canada', flag: '🇨🇦' },
    { code: 'mx', name: 'Mexico', flag: '🇲🇽' },
    { code: 'cu', name: 'Cuba', flag: '🇨🇺' },
    { code: 'jm', name: 'Jamaica', flag: '🇯🇲' },
    { code: 'cr', name: 'Costa Rica', flag: '🇨🇷' },
    { code: 'pa', name: 'Panama', flag: '🇵🇦' },
    { code: 'do', name: 'Dominican Republic', flag: '🇩🇴' },
    { code: 'gt', name: 'Guatemala', flag: '🇬🇹' },
    { code: 'hn', name: 'Honduras', flag: '🇭🇳' },
  ],
  'South America': [
    { code: 'br', name: 'Brazil', flag: '🇧🇷' },
    { code: 'ar', name: 'Argentina', flag: '🇦🇷' },
    { code: 'cl', name: 'Chile', flag: '🇨🇱' },
    { code: 'co', name: 'Colombia', flag: '🇨🇴' },
    { code: 'pe', name: 'Peru', flag: '🇵🇪' },
    { code: 've', name: 'Venezuela', flag: '🇻🇪' },
    { code: 'ec', name: 'Ecuador', flag: '🇪🇨' },
    { code: 'uy', name: 'Uruguay', flag: '🇺🇾' },
    { code: 'py', name: 'Paraguay', flag: '🇵🇾' },
    { code: 'bo', name: 'Bolivia', flag: '🇧🇴' },
  ],
  'Europe': [
    { code: 'gb', name: 'United Kingdom', flag: '🇬🇧' },
    { code: 'de', name: 'Germany', flag: '🇩🇪' },
    { code: 'fr', name: 'France', flag: '🇫🇷' },
    { code: 'it', name: 'Italy', flag: '🇮🇹' },
    { code: 'es', name: 'Spain', flag: '🇪🇸' },
    { code: 'nl', name: 'Netherlands', flag: '🇳🇱' },
    { code: 'se', name: 'Sweden', flag: '🇸🇪' },
    { code: 'no', name: 'Norway', flag: '🇳🇴' },
    { code: 'pl', name: 'Poland', flag: '🇵🇱' },
    { code: 'ch', name: 'Switzerland', flag: '🇨🇭' },
    { code: 'be', name: 'Belgium', flag: '🇧🇪' },
    { code: 'at', name: 'Austria', flag: '🇦🇹' },
    { code: 'ie', name: 'Ireland', flag: '🇮🇪' },
    { code: 'pt', name: 'Portugal', flag: '🇵🇹' },
    { code: 'dk', name: 'Denmark', flag: '🇩🇰' },
    { code: 'fi', name: 'Finland', flag: '🇫🇮' },
    { code: 'gr', name: 'Greece', flag: '🇬🇷' },
    { code: 'cz', name: 'Czech Republic', flag: '🇨🇿' },
    { code: 'ro', name: 'Romania', flag: '🇷🇴' },
    { code: 'hu', name: 'Hungary', flag: '🇭🇺' },
    { code: 'ua', name: 'Ukraine', flag: '🇺🇦' },
    { code: 'rs', name: 'Serbia', flag: '🇷🇸' },
    { code: 'hr', name: 'Croatia', flag: '🇭🇷' },
    { code: 'bg', name: 'Bulgaria', flag: '🇧🇬' },
    { code: 'sk', name: 'Slovakia', flag: '🇸🇰' },
    { code: 'lt', name: 'Lithuania', flag: '🇱🇹' },
    { code: 'lv', name: 'Latvia', flag: '🇱🇻' },
    { code: 'ee', name: 'Estonia', flag: '🇪🇪' },
    { code: 'is', name: 'Iceland', flag: '🇮🇸' },
    { code: 'lu', name: 'Luxembourg', flag: '🇱🇺' },
  ],
  'Asia': [
    { code: 'cn', name: 'China', flag: '🇨🇳' },
    { code: 'jp', name: 'Japan', flag: '🇯🇵' },
    { code: 'in', name: 'India', flag: '🇮🇳' },
    { code: 'kr', name: 'South Korea', flag: '🇰🇷' },
    { code: 'sg', name: 'Singapore', flag: '🇸🇬' },
    { code: 'hk', name: 'Hong Kong', flag: '🇭🇰' },
    { code: 'tw', name: 'Taiwan', flag: '🇹🇼' },
    { code: 'id', name: 'Indonesia', flag: '🇮🇩' },
    { code: 'th', name: 'Thailand', flag: '🇹🇭' },
    { code: 'my', name: 'Malaysia', flag: '🇲🇾' },
    { code: 'ph', name: 'Philippines', flag: '🇵🇭' },
    { code: 'vn', name: 'Vietnam', flag: '🇻🇳' },
    { code: 'pk', name: 'Pakistan', flag: '🇵🇰' },
    { code: 'bd', name: 'Bangladesh', flag: '🇧🇩' },
    { code: 'lk', name: 'Sri Lanka', flag: '🇱🇰' },
    { code: 'mm', name: 'Myanmar', flag: '🇲🇲' },
    { code: 'kh', name: 'Cambodia', flag: '🇰🇭' },
    { code: 'np', name: 'Nepal', flag: '🇳🇵' },
  ],
  'Middle East': [
    { code: 'il', name: 'Israel', flag: '🇮🇱' },
    { code: 'ps', name: 'Palestine', flag: '🇵🇸' },
    { code: 'ae', name: 'UAE', flag: '🇦🇪' },
    { code: 'sa', name: 'Saudi Arabia', flag: '🇸🇦' },
    { code: 'tr', name: 'Turkey', flag: '🇹🇷' },
    { code: 'qa', name: 'Qatar', flag: '🇶🇦' },
    { code: 'kw', name: 'Kuwait', flag: '🇰🇼' },
    { code: 'bh', name: 'Bahrain', flag: '🇧🇭' },
    { code: 'om', name: 'Oman', flag: '🇴🇲' },
    { code: 'jo', name: 'Jordan', flag: '🇯🇴' },
    { code: 'lb', name: 'Lebanon', flag: '🇱🇧' },
    { code: 'iq', name: 'Iraq', flag: '🇮🇶' },
    { code: 'ir', name: 'Iran', flag: '🇮🇷' },
  ],
  'Africa': [
    { code: 'za', name: 'South Africa', flag: '🇿🇦' },
    { code: 'ng', name: 'Nigeria', flag: '🇳🇬' },
    { code: 'eg', name: 'Egypt', flag: '🇪🇬' },
    { code: 'ke', name: 'Kenya', flag: '🇰🇪' },
    { code: 'ma', name: 'Morocco', flag: '🇲🇦' },
    { code: 'gh', name: 'Ghana', flag: '🇬🇭' },
    { code: 'et', name: 'Ethiopia', flag: '🇪🇹' },
    { code: 'tz', name: 'Tanzania', flag: '🇹🇿' },
    { code: 'ug', name: 'Uganda', flag: '🇺🇬' },
    { code: 'sn', name: 'Senegal', flag: '🇸🇳' },
    { code: 'ci', name: 'Ivory Coast', flag: '🇨🇮' },
    { code: 'cm', name: 'Cameroon', flag: '🇨🇲' },
    { code: 'dz', name: 'Algeria', flag: '🇩🇿' },
    { code: 'tn', name: 'Tunisia', flag: '🇹🇳' },
    { code: 'rw', name: 'Rwanda', flag: '🇷🇼' },
  ],
  'Oceania': [
    { code: 'au', name: 'Australia', flag: '🇦🇺' },
    { code: 'nz', name: 'New Zealand', flag: '🇳🇿' },
    { code: 'fj', name: 'Fiji', flag: '🇫🇯' },
    { code: 'pg', name: 'Papua New Guinea', flag: '🇵🇬' },
  ],
};

const CATEGORIES = [
  { id: 'technology', name: 'Technology', icon: '💻' },
  { id: 'business', name: 'Business', icon: '📈' },
  { id: 'science', name: 'Science', icon: '🔬' },
  { id: 'health', name: 'Health', icon: '🏥' },
  { id: 'sports', name: 'Sports', icon: '⚽' },
  { id: 'gaming', name: 'Gaming', icon: '🎮' },
  { id: 'film', name: 'Film', icon: '🎬' },
  { id: 'tv', name: 'TV', icon: '📺' },
  { id: 'politics', name: 'Politics', icon: '🏛️' },
];

export default function FilterSidebar({
  selectedCountries,
  setSelectedCountries,
  selectedCategories,
  setSelectedCategories,
  searchQuery,
  setSearchQuery,
  dateRange,
  setDateRange,
  selectedSources,
  setSelectedSources,
  showNonEnglish,
  setShowNonEnglish,
  savedKeywords = [],
}: {
  selectedCountries: string[];
  setSelectedCountries: (fn: (prev: string[]) => string[]) => void;
  selectedCategories: string[];
  setSelectedCategories: (fn: (prev: string[]) => string[]) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  dateRange: string;
  setDateRange: (r: string) => void;
  selectedSources: string[];
  setSelectedSources: (fn: (prev: string[]) => string[]) => void;
  showNonEnglish: boolean;
  setShowNonEnglish: (v: boolean) => void;
  savedKeywords?: string[];
}) {
  const location = useLocation();
  const [countriesOpen, setCountriesOpen] = React.useState(true);
  const [categoriesOpen, setCategoriesOpen] = React.useState(true);
  const [sourcesOpen, setSourcesOpen] = React.useState(false);

  // Autocomplete state
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const suggestionsRef = React.useRef<HTMLDivElement>(null);

  const suggestions = React.useMemo(() => {
    if (!savedKeywords.length || !searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return savedKeywords.filter(kw => kw.toLowerCase().includes(q) && kw.toLowerCase() !== q);
  }, [savedKeywords, searchQuery]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      setSearchQuery(suggestions[highlightedIndex]);
      setShowSuggestions(false);
      setHighlightedIndex(-1);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setHighlightedIndex(-1);
    }
  };

  // Close suggestions when clicking outside
  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
        searchInputRef.current && !searchInputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);
  const [continentStates, setContinentStates] = React.useState<Record<string, boolean>>(() => {
    // Auto-expand any continent that contains a currently selected country
    const init: Record<string, boolean> = {};
    for (const [continent, countries] of Object.entries(COUNTRIES_BY_CONTINENT)) {
      init[continent] = countries.some(c => selectedCountries.includes(c.code));
    }
    // Fallback: if nothing expanded, open North America (most common default)
    if (!Object.values(init).some(Boolean)) {
      init['North America'] = true;
    }
    return init;
  });
  const [sourceGroupStates, setSourceGroupStates] = React.useState<Record<string, boolean>>({
    'General': true,
    'Regional': false,
    'Business & Finance': false,
    'Technology': false,
    'Science': false,
    'Sports': false,
    'Gaming': false,
    'Film & TV': false,
  });

  const toggleCountry = (code) => {
    setSelectedCountries(prev => 
      prev.includes(code) 
        ? prev.filter(c => c !== code)
        : [...prev, code]
    );
  };

  const toggleCategory = (id) => {
    setSelectedCategories(prev =>
      prev.includes(id)
        ? prev.filter(c => c !== id)
        : [...prev, id]
    );
  };

  const allSourcesSelected = !selectedSources || selectedSources.length === 0 || selectedSources.length === ALL_SOURCE_DOMAINS.length;

  const toggleSource = (domain: string) => {
    if (!setSelectedSources) return;
    setSelectedSources(prev => {
      // If currently "all", start with full list and remove this one
      if (!prev || prev.length === 0) {
        return ALL_SOURCE_DOMAINS.filter(d => d !== domain);
      }
      if (prev.includes(domain)) {
        const next = prev.filter(d => d !== domain);
        // If removing the last one, reset to "all"
        return next.length === 0 ? [] : next;
      }
      const next = [...prev, domain];
      // If all are now selected, reset to empty (= all)
      return next.length === ALL_SOURCE_DOMAINS.length ? [] : next;
    });
  };

  const isSourceSelected = (domain: string) => {
    if (!selectedSources || selectedSources.length === 0) return true;
    return selectedSources.includes(domain);
  };

  return (
    <div className="h-full bg-slate-900 text-white flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden border border-slate-700">
            <img src="/logo.png" alt="Shortform" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Shortform</h1>
            <p className="text-xs text-slate-400">Your news, in short</p>
          </div>
        </div>
      </div>

      {/* Quick navigation — visible on mobile where bottom nav can be hard to reach */}
      <div className="px-4 py-3 border-b border-slate-800 lg:hidden">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Go to</p>
        <div className="grid grid-cols-3 gap-1.5">
          {NAV_LINKS.map(({ name, icon: Icon, page }) => {
            const active = location.pathname === page;
            return (
              <Link
                key={page}
                to={page}
                className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-center transition-colors ${
                  active
                    ? 'bg-white text-slate-900'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="text-[10px] font-medium leading-tight">{name}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 py-6">
        {/* Search Section */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Search className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-300">Search Keywords</span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="e.g., AI, climate AND policy..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); setHighlightedIndex(-1); }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={handleSearchKeyDown}
              className="pl-9 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-slate-500 focus:ring-slate-500"
            />
            {/* Saved keyword suggestions */}
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute z-50 top-full mt-1 w-full bg-slate-800 border border-slate-700 rounded-md shadow-lg overflow-hidden"
              >
                {suggestions.map((kw, i) => (
                  <button
                    key={kw}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                      i === highlightedIndex
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setSearchQuery(kw);
                      setShowSuggestions(false);
                      setHighlightedIndex(-1);
                    }}
                    onMouseEnter={() => setHighlightedIndex(i)}
                  >
                    <Tag className="w-3 h-3 text-slate-500 flex-shrink-0" />
                    {kw}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-600">
            Use <span className="font-mono text-slate-500">AND</span> / <span className="font-mono text-slate-500">NOT</span> for precise searches
          </p>
        </div>

        {/* Date Range Section */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-300">Time Period</span>
          </div>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="bg-slate-800 border-slate-700 text-white focus:border-slate-500 focus:ring-slate-500">
              <SelectValue placeholder="Select date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="3d">Last 3 days</SelectItem>
              <SelectItem value="week">Last week</SelectItem>
              <SelectItem value="month">Last month</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Language Section */}
        {setShowNonEnglish && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Languages className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-300">Language</span>
            </div>
            <div className="flex rounded-lg border border-slate-700 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowNonEnglish(false)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm transition-all duration-200 ${
                  !showNonEnglish
                    ? 'bg-slate-700 text-white font-medium'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-300 hover:bg-slate-800/80'
                }`}
              >
                <span>🇬🇧</span>
                <span>English only</span>
              </button>
              <div className="w-px bg-slate-700 flex-shrink-0" />
              <button
                type="button"
                onClick={() => setShowNonEnglish(true)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm transition-all duration-200 ${
                  showNonEnglish
                    ? 'bg-slate-700 text-white font-medium'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-300 hover:bg-slate-800/80'
                }`}
              >
                <span>🌐</span>
                <span>All languages</span>
              </button>
            </div>
            {showNonEnglish && (
              <p className="text-[11px] text-slate-500 mt-1.5 px-1">
                Articles in the country's local language will appear with a language badge.
              </p>
            )}
          </div>
        )}

        {/* Countries Section */}
        <Collapsible open={countriesOpen} onOpenChange={setCountriesOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full group mb-4">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-300">Countries</span>
              <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full text-slate-400">
                {selectedCountries.length}
              </span>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${countriesOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <motion.div
              className="space-y-2 mb-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {/* World — pinned global option above continents */}
              <label
                className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 ${
                  selectedCountries.includes('world')
                    ? 'bg-slate-800 text-white'
                    : 'hover:bg-slate-800/50 text-slate-400'
                }`}
              >
                <Checkbox
                  checked={selectedCountries.includes('world')}
                  onCheckedChange={() => toggleCountry('world')}
                  className="border-slate-600 data-[state=checked]:bg-slate-700 data-[state=checked]:border-slate-700"
                />
                <span className="text-base">🌍</span>
                <span className="text-sm">World</span>
              </label>
              <div className="h-px bg-slate-800 my-2" />
              {Object.entries(COUNTRIES_BY_CONTINENT).map(([continent, countries]) => (
                <Collapsible 
                  key={continent}
                  open={continentStates[continent]}
                  onOpenChange={(open) => setContinentStates(prev => ({ ...prev, [continent]: open }))}
                >
                  <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-slate-800/50 transition-colors group">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-300">{continent}</span>
                      {countries.filter(c => selectedCountries.includes(c.code)).length > 0 && (
                        <span className="text-xs bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded-full">
                          {countries.filter(c => selectedCountries.includes(c.code)).length}
                        </span>
                      )}
                    </div>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${continentStates[continent] ? 'rotate-180' : ''}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-2 mt-1 space-y-1">
                      {countries.map((country) => (
                        <label
                          key={country.code}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 ${
                            selectedCountries.includes(country.code)
                              ? 'bg-slate-800 text-white'
                              : 'hover:bg-slate-800/50 text-slate-400'
                          }`}
                        >
                          <Checkbox
                            checked={selectedCountries.includes(country.code)}
                            onCheckedChange={() => toggleCountry(country.code)}
                            className="border-slate-600 data-[state=checked]:bg-slate-700 data-[state=checked]:border-slate-700"
                          />
                          <span className="text-base">{country.flag}</span>
                          <span className="text-sm">{country.name}</span>
                        </label>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </motion.div>
          </CollapsibleContent>
        </Collapsible>

        {/* Categories Section */}
        <Collapsible open={categoriesOpen} onOpenChange={setCategoriesOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full group mb-4">
            <div className="flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-300">Categories</span>
              <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full text-slate-400">
                {selectedCategories.length}
              </span>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${categoriesOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <motion.div 
              className="space-y-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {CATEGORIES.map((category) => (
                <label
                  key={category.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 ${
                    selectedCategories.includes(category.id)
                      ? 'bg-slate-800 text-white'
                      : 'hover:bg-slate-800/50 text-slate-400'
                  }`}
                >
                  <Checkbox
                    checked={selectedCategories.includes(category.id)}
                    onCheckedChange={() => toggleCategory(category.id)}
                    className="border-slate-600 data-[state=checked]:bg-slate-700 data-[state=checked]:border-slate-700"
                  />
                  <span className="text-lg">{category.icon}</span>
                  <span className="text-sm">{category.name}</span>
                </label>
              ))}
            </motion.div>
          </CollapsibleContent>
        </Collapsible>

        {/* Sources Section */}
        {setSelectedSources && (
          <Collapsible open={sourcesOpen} onOpenChange={setSourcesOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full group mb-4 mt-6">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-300">Sources</span>
                <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full text-slate-400">
                  {allSourcesSelected ? 'All' : `${selectedSources.length}/${ALL_SOURCE_DOMAINS.length}`}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${sourcesOpen ? 'rotate-180' : ''}`} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                {/* Select All toggle */}
                <label
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 ${
                    allSourcesSelected
                      ? 'bg-slate-800 text-white'
                      : 'hover:bg-slate-800/50 text-slate-400'
                  }`}
                >
                  <Checkbox
                    checked={allSourcesSelected}
                    onCheckedChange={() => setSelectedSources([])}
                    className="border-slate-600 data-[state=checked]:bg-slate-700 data-[state=checked]:border-slate-700"
                  />
                  <span className="text-sm font-medium">All Sources</span>
                </label>
                <div className="h-px bg-slate-800 my-2" />

                {SOURCE_GROUPS.map(group => {
                  const groupSources = TRUSTED_SOURCES.filter(s => s.group === group);
                  const selectedInGroup = groupSources.filter(s => isSourceSelected(s.domain)).length;
                  return (
                    <Collapsible
                      key={group}
                      open={sourceGroupStates[group]}
                      onOpenChange={(open) => setSourceGroupStates(prev => ({ ...prev, [group]: open }))}
                    >
                      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-slate-800/50 transition-colors group">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-300">{group}</span>
                          {selectedInGroup < groupSources.length && (
                            <span className="text-xs bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded-full">
                              {selectedInGroup}/{groupSources.length}
                            </span>
                          )}
                        </div>
                        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${sourceGroupStates[group] ? 'rotate-180' : ''}`} />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="ml-2 mt-1 space-y-1">
                          {groupSources.map(source => (
                            <label
                              key={source.domain}
                              className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 ${
                                isSourceSelected(source.domain)
                                  ? 'bg-slate-800 text-white'
                                  : 'hover:bg-slate-800/50 text-slate-400'
                              }`}
                            >
                              <Checkbox
                                checked={isSourceSelected(source.domain)}
                                onCheckedChange={() => toggleSource(source.domain)}
                                className="border-slate-600 data-[state=checked]:bg-slate-700 data-[state=checked]:border-slate-700"
                              />
                              <span className="text-sm">{source.name}</span>
                            </label>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </motion.div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800">
        <p className="text-xs text-slate-500 text-center">
          Select filters to fetch news
        </p>
      </div>
    </div>
  );
}