
import React, { useState } from 'react';
import TopMoversHeader from './market/TopMoversHeader';
import TopMoversContent from './market/TopMoversContent';
import { useTopMovers } from '../hooks/useTopMovers';

interface FilterState {
  probability: [number, number];
  priceChange: [number, number];
  volume: [number, number];
}

const TopMoversList = () => {
  const [filters, setFilters] = useState<FilterState>({
    probability: [0, 100],
    priceChange: [-100, 100],
    volume: [0, 100]
  });

  const { data: movers, isLoading } = useTopMovers();

  const handleProbabilityChange = (value: [number, number]) => {
    setFilters(prev => ({ ...prev, probability: value }));
  };

  const handlePriceChange = (value: [number, number]) => {
    setFilters(prev => ({ ...prev, priceChange: value }));
  };

  const handleVolumeChange = (value: [number, number]) => {
    setFilters(prev => ({ ...prev, volume: value }));
  };

  const filteredMovers = movers?.filter(mover => {
    const prob = parseFloat(mover.probability);
    const change = parseFloat(mover.price_change);
    const vol = parseFloat(mover.volume);

    return (
      prob >= filters.probability[0] &&
      prob <= filters.probability[1] &&
      change >= filters.priceChange[0] &&
      change <= filters.priceChange[1] &&
      vol >= filters.volume[0] &&
      vol <= filters.volume[1]
    );
  });

  return (
    <div className="w-full h-full flex flex-col">
      <TopMoversHeader
        probabilityRange={filters.probability}
        onProbabilityChange={handleProbabilityChange}
        priceChangeRange={filters.priceChange}
        onPriceChangeChange={handlePriceChange}
        volumeRange={filters.volume}
        onVolumeChange={handleVolumeChange}
      />
      <TopMoversContent movers={filteredMovers || []} isLoading={isLoading} />
    </div>
  );
};

export default TopMoversList;
