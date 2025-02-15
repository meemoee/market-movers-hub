
import { useState, useEffect } from 'react';
import { ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

interface MarketStatsProps {
  currentPrice: number;
  priceChange: number;
  volumeChange: number;
  totalVolume: number;
}

export function MarketStats({ currentPrice, priceChange, volumeChange, totalVolume }: MarketStatsProps) {
  const isPricePositive = priceChange >= 0;
  const isVolumePositive = volumeChange >= 0;
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="flex gap-8 animate-pulse">
        <div className="space-y-2">
          <div className="h-4 w-24 bg-muted rounded" />
          <div className="h-6 w-32 bg-muted rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-24 bg-muted rounded" />
          <div className="h-6 w-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-8">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Price</span>
          {isPricePositive ? (
            <ArrowUpCircle className="w-4 h-4 text-green-500" />
          ) : (
            <ArrowDownCircle className="w-4 h-4 text-red-500" />
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold">{(currentPrice * 100).toFixed(2)}¢</span>
          <span className={`text-sm ${isPricePositive ? 'text-green-500' : 'text-red-500'}`}>
            {isPricePositive ? '+' : ''}{(priceChange * 100).toFixed(2)}%
          </span>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">${formatNumber(totalVolume)} Volume</span>
          {isVolumePositive ? (
            <ArrowUpCircle className="w-4 h-4 text-green-500" />
          ) : (
            <ArrowDownCircle className="w-4 h-4 text-red-500" />
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold">${formatNumber(Math.abs(volumeChange))}</span>
          <span className={`text-sm ${isVolumePositive ? 'text-green-500' : 'text-red-500'}`}>
            {isVolumePositive ? '+' : ''}{(volumeChange / (totalVolume - volumeChange) * 100).toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
}
