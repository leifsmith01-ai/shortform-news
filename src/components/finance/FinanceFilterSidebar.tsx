import React from 'react';
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrendingUp, ChevronDown, Search, Calendar, BarChart2 } from 'lucide-react';
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

const INDICES_BY_REGION: Record<string, { id: string; name: string; ticker: string; flag: string }[]> = {
  'Americas': [
    { id: 'sp500', name: 'S&P 500', ticker: 'SPX', flag: '🇺🇸' },
    { id: 'nasdaq', name: 'Nasdaq 100', ticker: 'NDX', flag: '🇺🇸' },
    { id: 'dow', name: 'Dow Jones', ticker: 'DJIA', flag: '🇺🇸' },
    { id: 'russell', name: 'Russell 2000', ticker: 'RUT', flag: '🇺🇸' },
    { id: 'tsx', name: 'TSX Composite', ticker: 'TSX', flag: '🇨🇦' },
    { id: 'bovespa', name: 'Bovespa', ticker: 'IBOV', flag: '🇧🇷' },
  ],
  'Europe': [
    { id: 'ftse', name: 'FTSE 100', ticker: 'UKX', flag: '🇬🇧' },
    { id: 'dax', name: 'DAX 40', ticker: 'DAX', flag: '🇩🇪' },
    { id: 'cac', name: 'CAC 40', ticker: 'CAC', flag: '🇫🇷' },
    { id: 'stoxx', name: 'Euro Stoxx 50', ticker: 'SX5E', flag: '🇪🇺' },
    { id: 'ibex', name: 'IBEX 35', ticker: 'IBEX', flag: '🇪🇸' },
    { id: 'smi', name: 'SMI', ticker: 'SMI', flag: '🇨🇭' },
  ],
  'Asia-Pacific': [
    { id: 'nikkei', name: 'Nikkei 225', ticker: 'N225', flag: '🇯🇵' },
    { id: 'hangseng', name: 'Hang Seng', ticker: 'HSI', flag: '🇭🇰' },
    { id: 'csi300', name: 'CSI 300', ticker: 'CSI300', flag: '🇨🇳' },
    { id: 'asx', name: 'ASX 200', ticker: 'AS51', flag: '🇦🇺' },
    { id: 'kospi', name: 'KOSPI', ticker: 'KOSPI', flag: '🇰🇷' },
    { id: 'sensex', name: 'Sensex', ticker: 'SENSEX', flag: '🇮🇳' },
  ],
};

export default function FinanceFilterSidebar({
  selectedMarkets,
  setSelectedMarkets,
  selectedSectors,
  setSelectedSectors,
  selectedIndices,
  setSelectedIndices,
  searchQuery,
  setSearchQuery,
  dateRange,
  setDateRange,
}: {
  selectedMarkets: string[];
  setSelectedMarkets: React.Dispatch<React.SetStateAction<string[]>>;
  selectedSectors: string[];
  setSelectedSectors: React.Dispatch<React.SetStateAction<string[]>>;
  selectedIndices: string[];
  setSelectedIndices: React.Dispatch<React.SetStateAction<string[]>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  dateRange: string;
  setDateRange: React.Dispatch<React.SetStateAction<string>>;
}) {
  const [marketsOpen, setMarketsOpen] = React.useState(true);
  const [sectorsOpen, setSectorsOpen] = React.useState(true);
  const [indicesOpen, setIndicesOpen] = React.useState(false);
  const [regionStates, setRegionStates] = React.useState<Record<string, boolean>>({
    'Americas': true,
    'Europe': false,
    'Asia-Pacific': false,
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

  const toggleIndex = (id: string) => {
    setSelectedIndices((prev: string[]) =>
      prev.includes(id)
        ? prev.filter((c: string) => c !== id)
        : [...prev, id]
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

        {/* Indices Section */}
        <Collapsible open={indicesOpen} onOpenChange={setIndicesOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full group mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-300">Indices</span>
              <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full text-slate-400">
                {selectedIndices.length}
              </span>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${indicesOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <motion.div
              className="space-y-2 mb-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {Object.entries(INDICES_BY_REGION).map(([region, indices]) => (
                <Collapsible
                  key={region}
                  open={regionStates[region]}
                  onOpenChange={(open: boolean) => setRegionStates(prev => ({ ...prev, [region]: open }))}
                >
                  <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-slate-800/50 transition-colors group">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-300">{region}</span>
                      {indices.filter(i => selectedIndices.includes(i.id)).length > 0 && (
                        <span className="text-xs bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded-full">
                          {indices.filter(i => selectedIndices.includes(i.id)).length}
                        </span>
                      )}
                    </div>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${regionStates[region] ? 'rotate-180' : ''}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-2 mt-1 space-y-1">
                      {indices.map((index) => (
                        <label
                          key={index.id}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 ${
                            selectedIndices.includes(index.id)
                              ? 'bg-slate-800 text-white'
                              : 'hover:bg-slate-800/50 text-slate-400'
                          }`}
                        >
                          <Checkbox
                            checked={selectedIndices.includes(index.id)}
                            onCheckedChange={() => toggleIndex(index.id)}
                            className="border-slate-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                          />
                          <span className="text-base">{index.flag}</span>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-sm">{index.name}</span>
                            <span className="text-xs text-slate-500">{index.ticker}</span>
                          </div>
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
