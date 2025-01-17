import { TrendingUp, TrendingDown, ChevronUp, ChevronDown } from "lucide-react";
import { Progress } from "@/components/ui/progress";

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
    return `${(price * 100).toFixed(1)}¢`;
  };

  const formatPriceChange = (change: number): string => {
    const prefix = change >= 0 ? '+' : '';
    return `${prefix}${(change * 100).toFixed(1)}%`;
  };

  const formatVolume = (volume: number): string => {
    if (volume >= 1e6) return `$${(volume / 1e6).toFixed(1)}M`;
    if (volume >= 1e3) return `$${(volume / 1e3).toFixed(1)}K`;
    return `$${volume.toFixed(0)}`;
  };

  return (
    <div className="grid grid-cols-[1fr,auto] gap-6 items-center">
      <div>
        <div className="text-3xl font-bold tracking-tight">
          {formatPrice(lastTradedPrice)}
        </div>
        <div className="space-y-1.5">
          <div className={`flex items-center gap-1 text-sm font-medium
            ${priceChange >= 0 ? 'text-[#8B5CF6]' : 'text-[#ea384c]'}`}
          >
            {priceChange >= 0 ? (
              <TrendingUp className="w-4 h-4" />
            ) : (
              <TrendingDown className="w-4 h-4" />
            )}
            {formatPriceChange(priceChange)}
          </div>
          <Progress 
            value={Math.abs(priceChange * 100)} 
            max={100}
            className={`h-1.5 ${
              priceChange >= 0 
                ? 'bg-[#8B5CF6]/20 [&>div]:bg-[#8B5CF6]' 
                : 'bg-[#ea384c]/20 [&>div]:bg-[#ea384c]'
            }`}
          />
        </div>
      </div>
      <div className="text-right">
        <div className="text-xl font-semibold">
          {formatVolume(volume)}
        </div>
        <div className="text-sm text-muted-foreground mt-1">
          24h Volume
        </div>
        <button
          onClick={onToggleExpand}
          className="mt-2 inline-flex justify-center"
        >
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
          )}
        </button>
      </div>
    </div>
  );
}