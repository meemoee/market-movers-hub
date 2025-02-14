
import { TrendingUp, TrendingDown } from "lucide-react";

interface MarketStatsProps {
  lastTradedPrice: number;
  priceChange: number;
  volume: number;
  isExpanded: boolean;
}

export function MarketStats({ 
  lastTradedPrice = 0, 
  priceChange = 0, 
  volume = 0,
  isExpanded,
}: MarketStatsProps) {
  const formatPrice = (price: number): string => {
    return `${(price * 100).toFixed(1)}%`;
  };

  const formatPriceChange = (change: number): string => {
    const prefix = change >= 0 ? '+' : '';
    return `${prefix}${(change * 100).toFixed(1)} pp`;
  };

  const formatVolume = (vol: number): string => {
    if (!vol && vol !== 0) return '$0';
    if (vol >= 1e6) return `$${(vol / 1e6).toFixed(1)}M`;
    if (vol >= 1e3) return `$${(vol / 1e3).toFixed(1)}K`;
    return `$${vol.toFixed(0)}`;
  };

  const calculatePosition = (price: number): number => {
    return price * 100;
  };

  return (
    <div className="w-full flex flex-col space-y-2 pb-2">
      <div className="flex justify-between items-start">
        <div className="flex flex-col">
          <span className="text-3xl font-bold tracking-tight">
            {formatPrice(lastTradedPrice)}
          </span>
          <span className={`text-sm font-medium flex items-center gap-1 mb-2
            ${priceChange >= 0 ? 'text-green-500' : 'text-red-500'}`}
          >
            {priceChange >= 0 ? (
              <TrendingUp className="w-4 h-4" />
            ) : (
              <TrendingDown className="w-4 h-4" />
            )}
            {formatPriceChange(priceChange)}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xl font-semibold">
            {formatVolume(volume)}
          </span>
          <span className="text-sm text-muted-foreground">
            24h Volume
          </span>
        </div>
      </div>
      
      <div className="relative h-[3px] w-full">
        {/* Base white line showing current price position */}
        <div 
          className="absolute bg-white/50 h-2 top-[-4px]" 
          style={{ 
            width: `${calculatePosition(lastTradedPrice)}%`
          }}
        />
        
        {/* Price change visualization */}
        {priceChange >= 0 ? (
          <>
            <div 
              className="absolute bg-green-900/90 h-2 top-[-4px]" 
              style={{ 
                width: `${Math.abs(priceChange * 100)}%`,
                right: `${100 - calculatePosition(lastTradedPrice)}%`
              }}
            />
            <div 
              className="absolute h-3 w-0.5 bg-gray-400 top-[-6px]"
              style={{ 
                right: `${100 - calculatePosition(lastTradedPrice)}%`
              }}
            />
          </>
        ) : (
          <>
            <div 
              className="absolute bg-red-500/50 h-2 top-[-4px]" 
              style={{ 
                width: `${Math.abs(priceChange * 100)}%`,
                left: `${calculatePosition(lastTradedPrice)}%`
              }}
            />
            <div 
              className="absolute h-3 w-0.5 bg-gray-400 top-[-6px]"
              style={{ 
                left: `${calculatePosition(lastTradedPrice)}%`
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
