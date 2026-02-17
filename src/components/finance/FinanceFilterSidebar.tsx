import React from 'react';
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrendingUp, ChevronDown, Search, Calendar, Globe } from 'lucide-react';
import { motion } from 'framer-motion';
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

const MARKETS = [
  { id: 'stocks', name: 'Stocks & Equities', icon: '📈' },
  { id: 'crypto', name: 'Cryptocurrency', icon: '₿' },
  { id: 'forex', name: 'Forex & Currencies', icon: '💱' },
  { id: 'commodities', name: 'Commodities', icon: '🛢️' },
  { id: 'bonds', name: 'Bonds & Fixed Income', icon: '📜' },
  { id: 'realestate', name: 'Real Estate', icon: '🏠' },
];

const SECTORS = [
  { id: 'tech', name: 'Technology', icon: '💻' },
  { id: 'healthcare', name: 'Healthcare', icon: '🏥' },
  { id: 'energy', name: 'Energy', icon: '⚡' },
  { id: 'financial', name: 'Financial Services', icon: '🏦' },
  { id: 'consumer', name: 'Consumer Goods', icon: '🛒' },
  { id: 'industrial', name: 'Industrials', icon: '🏭' },
  { id: 'materials', name: 'Materials', icon: '⛏️' },
  { id: 'utilities', name: 'Utilities', icon: '💡' },
];

const COUNTRIES_BY_CONTINENT: Record<string, { code: string; name: string; flag: string }[]> = {
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

export default function FinanceFilterSidebar({
  selectedMarkets,
  setSelectedMarkets,
  selectedSectors,
  setSelectedSectors,
  selectedRegions,
  setSelectedRegions,
  searchQuery,
  setSearchQuery,
  dateRange,
  setDateRange,
}: {
  selectedMarkets: string[];
  setSelectedMarkets: React.Dispatch<React.SetStateAction<string[]>>;
  selectedSectors: string[];
  setSelectedSectors: React.Dispatch<React.SetStateAction<string[]>>;
  selectedRegions: string[];
  setSelectedRegions: React.Dispatch<React.SetStateAction<string[]>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  dateRange: string;
  setDateRange: React.Dispatch<React.SetStateAction<string>>;
}) {
  const [marketsOpen, setMarketsOpen] = React.useState(true);
  const [sectorsOpen, setSectorsOpen] = React.useState(true);
  const [countriesOpen, setCountriesOpen] = React.useState(false);
  const [continentStates, setContinentStates] = React.useState<Record<string, boolean>>({
    'North America': true,
    'South America': false,
    'Europe': false,
    'Asia': false,
    'Middle East': false,
    'Africa': false,
    'Oceania': false,
  });

  const toggleMarket = (id: string) => {
    setSelectedMarkets((prev: string[]) =>
      prev.includes(id)
        ? prev.filter((c: string) => c !== id)
        : [...prev, id]
    );
  };

  const toggleSector = (id: string) => {
    setSelectedSectors((prev: string[]) =>
      prev.includes(id)
        ? prev.filter((c: string) => c !== id)
        : [...prev, id]
    );
  };

  const toggleRegion = (code: string) => {
    setSelectedRegions((prev: string[]) =>
      prev.includes(code)
        ? prev.filter((c: string) => c !== code)
        : [...prev, code]
    );
  };

  return (
    <div className="h-full bg-slate-900 text-white flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Finance</h1>
            <p className="text-xs text-slate-400">Markets & business news</p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 py-6">
        {/* Search Section */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Search className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-300">Search</span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              type="text"
              placeholder="e.g., AAPL, interest rates..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className="pl-9 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-slate-500 focus:ring-slate-500"
            />
          </div>
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

        {/* Markets Section */}
        <Collapsible open={marketsOpen} onOpenChange={setMarketsOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full group mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-300">Markets</span>
              <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full text-slate-400">
                {selectedMarkets.length}
              </span>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${marketsOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <motion.div
              className="space-y-1 mb-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {MARKETS.map((market) => (
                <label
                  key={market.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 ${
                    selectedMarkets.includes(market.id)
                      ? 'bg-slate-800 text-white'
                      : 'hover:bg-slate-800/50 text-slate-400'
                  }`}
                >
                  <Checkbox
                    checked={selectedMarkets.includes(market.id)}
                    onCheckedChange={() => toggleMarket(market.id)}
                    className="border-slate-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                  />
                  <span className="text-lg">{market.icon}</span>
                  <span className="text-sm">{market.name}</span>
                </label>
              ))}
            </motion.div>
          </CollapsibleContent>
        </Collapsible>

        {/* Sectors Section */}
        <Collapsible open={sectorsOpen} onOpenChange={setSectorsOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full group mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-300">Sectors</span>
              <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full text-slate-400">
                {selectedSectors.length}
              </span>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${sectorsOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <motion.div
              className="space-y-1 mb-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {SECTORS.map((sector) => (
                <label
                  key={sector.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 ${
                    selectedSectors.includes(sector.id)
                      ? 'bg-slate-800 text-white'
                      : 'hover:bg-slate-800/50 text-slate-400'
                  }`}
                >
                  <Checkbox
                    checked={selectedSectors.includes(sector.id)}
                    onCheckedChange={() => toggleSector(sector.id)}
                    className="border-slate-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                  />
                  <span className="text-lg">{sector.icon}</span>
                  <span className="text-sm">{sector.name}</span>
                </label>
              ))}
            </motion.div>
          </CollapsibleContent>
        </Collapsible>

        {/* Countries Section */}
        <Collapsible open={countriesOpen} onOpenChange={setCountriesOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full group mb-4">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-300">Countries</span>
              <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full text-slate-400">
                {selectedRegions.length}
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
              {Object.entries(COUNTRIES_BY_CONTINENT).map(([continent, countries]) => (
                <Collapsible
                  key={continent}
                  open={continentStates[continent]}
                  onOpenChange={(open: boolean) => setContinentStates(prev => ({ ...prev, [continent]: open }))}
                >
                  <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-slate-800/50 transition-colors group">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-300">{continent}</span>
                      {countries.filter(c => selectedRegions.includes(c.code)).length > 0 && (
                        <span className="text-xs bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded-full">
                          {countries.filter(c => selectedRegions.includes(c.code)).length}
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
                            selectedRegions.includes(country.code)
                              ? 'bg-slate-800 text-white'
                              : 'hover:bg-slate-800/50 text-slate-400'
                          }`}
                        >
                          <Checkbox
                            checked={selectedRegions.includes(country.code)}
                            onCheckedChange={() => toggleRegion(country.code)}
                            className="border-slate-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
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
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800">
        <p className="text-xs text-slate-500 text-center">
          Select markets & sectors to fetch finance news
        </p>
      </div>
    </div>
  );
}
