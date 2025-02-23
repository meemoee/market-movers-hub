
import React, { useState } from 'react';
import { TopMoversHeader } from './market/TopMoversHeader';
import { TopMoversContent } from './market/TopMoversContent';
import { useTopMovers } from '../hooks/useTopMovers';

export interface TopMover {
  market_id: string;
  question: string;
  price_change: string;
  volume_change: string;
  final_volume: string;
  probability: string;
  volume: string;
  image?: string;
  yes_sub_title?: string;
  final_last_traded_price: string;
  final_best_ask: string;
  final_best_bid: string;
  description?: string;
  outcomes?: string[];
  event_id?: string;
  clobtokenids?: string[];
}

const timeIntervals = [
  { label: '5 minutes', value: '5' },
  { label: '10 minutes', value: '10' },
  { label: '30 minutes', value: '30' },
  { label: '60 minutes', value: '60' },
  { label: '4 hours', value: '240' },
  { label: '12 hours', value: '720' },
  { label: '24 hours', value: '1440' },
  { label: '7 days', value: '10080' }
] as const;

const TopMoversList = () => {
  const [selectedInterval, setSelectedInterval] = useState('1440');
  const [isTimeIntervalDropdownOpen, setIsTimeIntervalDropdownOpen] = useState(false);
  const [openMarketsOnly, setOpenMarketsOnly] = useState(true);
  const [showMinThumb, setShowMinThumb] = useState(true);
  const [showMaxThumb, setShowMaxThumb] = useState(true);
  const [showPriceChangeMinThumb, setShowPriceChangeMinThumb] = useState(true);
  const [showPriceChangeMaxThumb, setShowPriceChangeMaxThumb] = useState(true);
  const [showVolumeMinThumb, setShowVolumeMinThumb] = useState(true);
  const [showVolumeMaxThumb, setShowVolumeMaxThumb] = useState(true);
  const [sortBy, setSortBy] = useState<'price_change' | 'volume'>('price_change');
  
  const [filters, setFilters] = useState({
    probability: [0, 100] as [number, number],
    priceChange: [-100, 100] as [number, number],
    volume: [0, 10000] as [number, number]
  });

  const { data, isLoading } = useTopMovers(
    selectedInterval,
    openMarketsOnly,
    '',
    undefined,
    filters.probability[0],
    filters.probability[1],
    filters.priceChange[0],
    filters.priceChange[1],
    sortBy
  );
  
  const movers = data?.pages?.[0]?.data || [];

  const handleProbabilityChange = (value: [number, number]) => {
    setFilters(prev => ({ ...prev, probability: value }));
  };

  const handlePriceChange = (value: [number, number]) => {
    setFilters(prev => ({ ...prev, priceChange: value }));
  };

  const handleVolumeChange = (value: [number, number]) => {
    setFilters(prev => ({ ...prev, volume: value }));
  };

  const filteredMovers = movers.filter(mover => {
    const prob = parseFloat(mover.probability);
    const priceChange = parseFloat(mover.price_change);
    const volume = parseFloat(mover.volume);

    return (
      prob >= filters.probability[0] &&
      prob <= filters.probability[1] &&
      priceChange >= filters.priceChange[0] &&
      priceChange <= filters.priceChange[1] &&
      volume >= filters.volume[0] &&
      volume <= filters.volume[1]
    );
  });

  return (
    <div className="w-full h-full flex flex-col">
      <TopMoversHeader
        timeIntervals={timeIntervals}
        selectedInterval={selectedInterval}
        onIntervalChange={setSelectedInterval}
        openMarketsOnly={openMarketsOnly}
        onOpenMarketsChange={setOpenMarketsOnly}
        isTimeIntervalDropdownOpen={isTimeIntervalDropdownOpen}
        setIsTimeIntervalDropdownOpen={setIsTimeIntervalDropdownOpen}
        probabilityRange={filters.probability}
        setProbabilityRange={handleProbabilityChange}
        showMinThumb={showMinThumb}
        setShowMinThumb={setShowMinThumb}
        showMaxThumb={showMaxThumb}
        setShowMaxThumb={setShowMaxThumb}
        priceChangeRange={filters.priceChange}
        setPriceChangeRange={handlePriceChange}
        showPriceChangeMinThumb={showPriceChangeMinThumb}
        setShowPriceChangeMinThumb={setShowPriceChangeMinThumb}
        showPriceChangeMaxThumb={showPriceChangeMaxThumb}
        setShowPriceChangeMaxThumb={setShowPriceChangeMaxThumb}
        volumeRange={filters.volume}
        setVolumeRange={handleVolumeChange}
        showVolumeMinThumb={showVolumeMinThumb}
        setShowVolumeMinThumb={setShowVolumeMinThumb}
        showVolumeMaxThumb={showVolumeMaxThumb}
        setShowVolumeMaxThumb={setShowVolumeMaxThumb}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />
      <TopMoversContent movers={filteredMovers} isLoading={isLoading} />
    </div>
  );
};

export default TopMoversList;
