import { useState, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Search } from 'lucide-react';
import { Input } from './ui/input';
import { TopMoversHeader } from './market/TopMoversHeader';
import { TopMoversContent } from './market/TopMoversContent';
import { TransactionDialog } from './market/TransactionDialog';
import { MarketStatsBento } from './market/MarketStatsBento';
import { InsightPostBox } from './market/InsightPostBox';
import { useDebounce } from '@/hooks/use-debounce';
import { useTopMovers } from '@/hooks/useTopMovers';
import { useMarketSearch } from '@/hooks/useMarketSearch';

interface TimeInterval {
  label: string;
  value: string;
}

const formatInterval = (minutes: number): string => {
  if (minutes < 60) return `${minutes} mins`;
  if (minutes === 60) return '1 hour';
  if (minutes < 1440) return `${minutes / 60} hours`;
  if (minutes === 1440) return '1 day';
  if (minutes === 10080) return '1 week';
  return `${minutes / 1440} days`;
};

const TIME_INTERVALS: TimeInterval[] = [
  { label: formatInterval(5), value: '5' },
  { label: formatInterval(10), value: '10' },
  { label: formatInterval(30), value: '30' },
  { label: formatInterval(60), value: '60' },
  { label: formatInterval(240), value: '240' },
  { label: formatInterval(480), value: '480' },
  { label: formatInterval(1440), value: '1440' },
  { label: formatInterval(10080), value: '10080' },
];

export interface TopMover {
  market_id: string;
  question: string;
  url: string;
  subtitle?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  description?: string;
  clobtokenids?: string[];
  outcomes?: string[];
  active: boolean;
  closed: boolean;
  archived: boolean;
  image: string;
  event_id: string;
  event_title?: string;
  final_last_traded_price: number;
  final_best_ask: number;
  final_best_bid: number;
  final_volume: number;
  initial_last_traded_price: number;
  initial_volume: number;
  price_change: number;
  volume_change: number;
  volume_change_percentage: number;
}

interface TopMoversListProps {
  timeIntervals: readonly TimeInterval[];
  selectedInterval: string;
  onIntervalChange: (interval: string) => void;
  openMarketsOnly: boolean;
  onOpenMarketsChange: (value: boolean) => void;
}

interface OrderBookData {
  bids: Record<string, number>;
  asks: Record<string, number>;
  best_bid: number;
  best_ask: number;
  spread: number;
}

export default function TopMoversList({
  timeIntervals = TIME_INTERVALS,
  selectedInterval,
  onIntervalChange,
  openMarketsOnly,
  onOpenMarketsChange,
}: TopMoversListProps) {
  const [isTimeIntervalDropdownOpen, setIsTimeIntervalDropdownOpen] = useState(false);
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());
  const [selectedMarket, setSelectedMarket] = useState<{ 
    id: string; 
    action: 'buy' | 'sell';
    clobTokenId: string;
  } | null>(null);
  const [orderBookData, setOrderBookData] = useState<OrderBookData | null>(null);
  const [isOrderBookLoading, setIsOrderBookLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchPage, setSearchPage] = useState(1);
  const debouncedSearch = useDebounce(searchQuery, 300);
  const { toast } = useToast();

  // Use infinite query for top movers
  const topMoversQuery = useTopMovers(selectedInterval, openMarketsOnly, '');
  const marketSearchQuery = useMarketSearch(debouncedSearch, searchPage);

  // Reset search page when search query changes
  useEffect(() => {
    setSearchPage(1);
  }, [debouncedSearch]);

  const isSearching = debouncedSearch.length > 0;
  const activeQuery = isSearching ? marketSearchQuery : topMoversQuery;

  // For search results, we need to maintain a list of all loaded markets
  const [loadedSearchResults, setLoadedSearchResults] = useState<TopMover[]>([]);

  // Update loaded search results when we get new data
  useEffect(() => {
    if (isSearching && marketSearchQuery.data) {
      if (searchPage === 1) {
        // Reset results for new search
        setLoadedSearchResults(marketSearchQuery.data.data);
      } else {
        // Append new results for pagination
        setLoadedSearchResults(prev => [...prev, ...marketSearchQuery.data.data]);
      }
    }
  }, [isSearching, marketSearchQuery.data, searchPage]);

  const allTopMovers = isSearching 
    ? loadedSearchResults
    : topMoversQuery.data?.pages.flatMap(page => page.data) || [];
  
  const hasMore = isSearching 
    ? marketSearchQuery.data?.hasMore || false 
    : topMoversQuery.hasNextPage || false;

  useEffect(() => {
    if (!selectedMarket) {
      setOrderBookData(null);
      return;
    }
    setIsOrderBookLoading(true);
  }, [selectedMarket]);

  const handleTransaction = () => {
    if (!selectedMarket || !orderBookData) return;
    
    const action = selectedMarket.action;
    const price = action === 'buy' ? orderBookData.best_ask : orderBookData.best_bid;
    
    toast({
      title: "Transaction Submitted",
      description: `Your ${action} order has been submitted at ${(price * 100).toFixed(2)}¢`,
    });
    setSelectedMarket(null);
  };

  const toggleMarket = (marketId: string) => {
    setExpandedMarkets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(marketId)) {
        newSet.delete(marketId);
      } else {
        newSet.add(marketId);
      }
      return newSet;
    });
  };

  const handleLoadMore = () => {
    if (isSearching) {
      // For search, increment page number and fetch next page
      setSearchPage(prev => prev + 1);
    } else {
      // For infinite scroll, use fetchNextPage
      topMoversQuery.fetchNextPage();
    }
  };

  const selectedTopMover = selectedMarket 
    ? allTopMovers.find(m => m.market_id === selectedMarket.id)
    : null;

  return (
    <div className="flex flex-col w-full">
      <div className="sticky top-0 z-40 w-full">
        <div className="flex items-center w-full px-4 py-3 bg-background/95 backdrop-blur-sm border-b">
          <div className="relative flex-1 max-w-2xl mx-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search markets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 bg-background"
            />
          </div>
        </div>
      </div>

      <TopMoversHeader
        timeIntervals={timeIntervals}
        selectedInterval={selectedInterval}
        onIntervalChange={onIntervalChange}
        openMarketsOnly={openMarketsOnly}
        onOpenMarketsChange={onOpenMarketsChange}
        isTimeIntervalDropdownOpen={isTimeIntervalDropdownOpen}
        setIsTimeIntervalDropdownOpen={setIsTimeIntervalDropdownOpen}
      />
      
      <div className="w-full px-0 sm:px-4 -mt-20">
        <div className="flex flex-col items-center space-y-6 pt-28 border border-white/5 rounded-lg bg-black/20">
          <InsightPostBox />
          
          <MarketStatsBento selectedInterval={selectedInterval} />

          <TopMoversContent
            isLoading={!isSearching && !topMoversQuery.data && topMoversQuery.isLoading}
            error={activeQuery.error ? String(activeQuery.error) : null}
            topMovers={allTopMovers}
            expandedMarkets={expandedMarkets}
            toggleMarket={toggleMarket}
            setSelectedMarket={setSelectedMarket}
            onLoadMore={handleLoadMore}
            hasMore={hasMore}
            isLoadingMore={
              isSearching 
                ? marketSearchQuery.isFetching 
                : topMoversQuery.isFetchingNextPage
            }
          />
        </div>
      </div>

      <TransactionDialog
        selectedMarket={selectedMarket}
        topMover={selectedTopMover}
        onClose={() => setSelectedMarket(null)}
        orderBookData={orderBookData}
        isOrderBookLoading={isOrderBookLoading}
        onOrderBookData={(data) => {
          setOrderBookData(data);
          setIsOrderBookLoading(false);
        }}
        onConfirm={handleTransaction}
      />
    </div>
  );
}
