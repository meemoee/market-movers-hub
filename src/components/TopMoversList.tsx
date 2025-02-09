import React, { useState } from 'react';
import { TopMoversHeader } from './TopMoversHeader';
import { TopMoversContent } from './TopMoversContent';
import { useTopMovers } from '@/hooks/useTopMovers';

export type TopMover = {
  market_id: string;
  question: string;
  image?: string;
  yes_sub_title?: string;
  description?: string;
  outcomes?: string[];
  final_last_traded_price: number;
  final_best_ask: number;
  final_best_bid: number;
  final_volume: number;
  price_change: number;
  clobtokenids?: string[];
  // add any other fields as needed
};

const timeIntervals = [
  { label: '15 minutes', value: '15' },
  { label: '60 minutes', value: '60' },
  { label: '1440 minutes', value: '1440' },
];

export function TopMoversList() {
  const [selectedInterval, setSelectedInterval] = useState('1440');
  const [openMarketsOnly, setOpenMarketsOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());
  const [isTimeIntervalDropdownOpen, setIsTimeIntervalDropdownOpen] = useState(false);

  const {
    data,
    isLoading,
    error,
    isFetching: isLoadingMore,
  } = useTopMovers(selectedInterval, openMarketsOnly, page, searchQuery);

  // Toggle expand state for a given market ID
  const toggleMarket = (marketId: string) => {
    setExpandedMarkets((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(marketId)) {
        newSet.delete(marketId);
      } else {
        newSet.add(marketId);
      }
      return newSet;
    });
  };

  // Handler for selecting a market action (buy/sell)
  const setSelectedMarket = (market: {
    id: string;
    action: 'buy' | 'sell';
    clobTokenId: string;
  } | null) => {
    // Implement your selection logic here
    console.log('Selected market:', market);
  };

  // When any of the filter criteria change, reset pagination to page 1.
  const onIntervalChange = (interval: string) => {
    setSelectedInterval(interval);
    setPage(1);
  };

  const onOpenMarketsChange = (value: boolean) => {
    setOpenMarketsOnly(value);
    setPage(1);
  };

  const onSearchChange = (query: string) => {
    setSearchQuery(query);
    setPage(1);
  };

  // Load more will increment the page number
  const onLoadMore = () => {
    setPage((prev) => prev + 1);
  };

  return (
    <div className="w-full">
      <TopMoversHeader
        timeIntervals={timeIntervals}
        selectedInterval={selectedInterval}
        onIntervalChange={onIntervalChange}
        openMarketsOnly={openMarketsOnly}
        onOpenMarketsChange={onOpenMarketsChange}
        isTimeIntervalDropdownOpen={isTimeIntervalDropdownOpen}
        setIsTimeIntervalDropdownOpen={setIsTimeIntervalDropdownOpen}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
      />
      <TopMoversContent
        isLoading={isLoading}
        error={error ? error.message : null}
        topMovers={(data?.data as TopMover[]) || []}
        expandedMarkets={expandedMarkets}
        toggleMarket={toggleMarket}
        setSelectedMarket={setSelectedMarket}
        onLoadMore={onLoadMore}
        hasMore={data?.hasMore || false}
        isLoadingMore={isLoadingMore}
      />
    </div>
  );
}
