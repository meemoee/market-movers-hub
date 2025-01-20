import { TrendingUp, TrendingDown, ChevronUp, ChevronDown } from "lucide-react";
import { StatsRow } from "./StatsRow";

interface MarketStatsProps {
  lastTradedPrice: number;
  priceChange: number;
  volume: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function MarketStats({ 
  lastTradedPrice, 
  priceChange, 
  volume,
  isExpanded,
  onToggleExpand
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
    <div className="grid grid-cols-[1fr,auto] gap-6 items-start">
      <div>
        <div className="text-3xl font-bold tracking-tight">
          {formatPrice(lastTradedPrice)}
        </div>
        <div className="mt-1 flex flex-col justify-between h-[48px]">
          <StatsRow
            leftContent={
              <div className={`flex items-center gap-1 text-sm font-medium
                ${priceChange >= 0 ? 'text-green-500' : 'text-red-500'}`}
              >
                {priceChange >= 0 ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
                {formatPriceChange(priceChange)}
              </div>
            }
            rightContent={null}
          />
          
          <div className="relative h-[3px] w-full">
            {/* Base white line showing current price position */}
            <div 
              className="absolute bg-white/50 h-1.5 top-[-3px]" 
              style={{ width: `${Math.abs(lastTradedPrice * 100)}%` }}
            />
            
            {/* Price change visualization */}
            {priceChange >= 0 ? (
              <>
                <div 
                  className="absolute bg-green-900/90 h-1.5 top-[-3px]" 
                  style={{ 
                    width: `${Math.abs(priceChange * 100)}%`,
                    right: `${100 - Math.abs(lastTradedPrice * 100)}%`
                  }}
                />
                <div 
                  className="absolute h-2.5 w-0.5 bg-gray-400 top-[-5px]"
                  style={{ 
                    right: `${100 - Math.abs(lastTradedPrice * 100)}%`
                  }}
                />
              </>
            ) : (
              <>
                <div 
                  className="absolute bg-red-500/50 h-1.5 top-[-3px]" 
                  style={{ 
                    width: `${Math.abs(priceChange * 100)}%`,
                    left: `${Math.abs(lastTradedPrice * 100)}%`
                  }}
                />
                <div 
                  className="absolute h-2.5 w-0.5 bg-gray-400 top-[-5px]"
                  style={{ 
                    left: `${Math.abs(lastTradedPrice * 100)}%`
                  }}
                />
              </>
            )}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-xl font-semibold">
          {formatVolume(volume)}
        </div>
        <div className="mt-1 flex flex-col justify-between h-[48px]">
          <StatsRow
            leftContent={null}
            rightContent={
              <span className="text-sm text-muted-foreground">
                24h Volume
              </span>
            }
          />
          <button
            onClick={onToggleExpand}
            className="inline-flex justify-center"
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}