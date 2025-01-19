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
    // Convert decimal to percentage with 1 decimal place
    return `${(price * 100).toFixed(1)}%`;
  };

  const formatPriceChange = (change: number): string => {
    // Format price change as percentage points
    const prefix = change >= 0 ? '+' : '';
    return `${prefix}${(change * 100).toFixed(1)} pp`;
  };

  const formatVolume = (vol: number): string => {
    if (!vol && vol !== 0) return '$0';
    if (vol >= 1e6) return `$${(vol / 1e6).toFixed(1)}M`;
    if (vol >= 1e3) return `$${(vol / 1e3).toFixed(1)}K`;
    return `$${vol.toFixed(0)}`;
  };

  // Calculate the progress value based on the absolute price change
  // Cap it at 100% for visualization purposes
  const progressValue = Math.min(Math.abs(priceChange * 100), 100);

  return (
    <div className="grid grid-cols-[1fr,auto] gap-6 items-center">
      <div>
        <div className="text-3xl font-bold tracking-tight">
          {formatPrice(lastTradedPrice)}
        </div>
        <div className="space-y-1.5">
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
          <Progress 
            value={progressValue} 
            max={100}
            className={`h-1.5 ${
              priceChange >= 0 
                ? 'bg-green-100 [&>div]:bg-green-500' 
                : 'bg-red-100 [&>div]:bg-red-500'
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