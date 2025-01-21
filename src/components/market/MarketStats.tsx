import { TrendingUp, TrendingDown } from "lucide-react";

interface MarketStatsProps {
  lastTradedPrice: number;
  priceChange: number;
  volume: number;
  isExpanded: boolean;
}

export function MarketStats({ 
  lastTradedPrice, 
  priceChange, 
  volume,
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

  return (
    <div className="w-full grid grid-cols-[1fr_200px] gap-4 -mt-2">
      <div className="flex-1">
        <div className="flex flex-col pt-1">
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
        
        <div className="relative h-[2px] w-full mt-2">
          {/* Price bar container */}
          <div className="absolute inset-0 bg-white/10" />
          
          {/* Current price position */}
          <div 
            className="absolute h-2 w-0.5 bg-gray-400 top-[-4px] transform -translate-x-1/2"
            style={{ 
              left: `${lastTradedPrice * 100}%`
            }}
          />

          {/* Price change visualization */}
          {priceChange >= 0 ? (
            <div 
              className="absolute h-1 top-[-2px] bg-green-900/90"
              style={{
                left: `${(lastTradedPrice - priceChange) * 100}%`,
                width: `${Math.abs(priceChange * 100)}%`
              }}
            />
          ) : (
            <div 
              className="absolute h-1 top-[-2px] bg-red-500/50"
              style={{
                left: `${lastTradedPrice * 100}%`,
                width: `${Math.abs(priceChange * 100)}%`
              }}
            />
          )}
        </div>
      </div>

      <div className="flex flex-col items-end justify-between">
        <div className="flex flex-col items-end pt-2">
          <span className="text-xl font-semibold">
            {formatVolume(volume)}
          </span>
          <span className="text-sm text-muted-foreground">
            24h Volume
          </span>
        </div>
      </div>
    </div>
  );
}