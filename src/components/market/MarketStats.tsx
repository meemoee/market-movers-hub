import { ChevronDown } from 'lucide-react';
import { formatPercent } from '@/lib/utils';

interface MarketStatsProps {
  price: number;
  priceChange: number;
  volume: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function MarketStats({
  price,
  priceChange,
  volume,
  isExpanded,
  onToggleExpand,
}: MarketStatsProps) {
  const isPositive = priceChange >= 0;
  const absChange = Math.abs(priceChange);
  const percentChange = absChange * 100;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold">
            {(price * 100).toFixed(1)}¢
          </span>
          <span
            className={`text-sm font-medium ${
              isPositive ? 'text-emerald-500' : 'text-red-500'
            }`}
          >
            {isPositive ? '+' : '-'}
            {formatPercent(percentChange)}
          </span>
        </div>

        <button
          onClick={onToggleExpand}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>Details</span>
          <ChevronDown 
            className={`w-4 h-4 transition-transform duration-500 ease-out ${
              isExpanded ? 'rotate-180' : 'rotate-0'
            }`}
          />
        </button>
      </div>

      <div className="relative">
        <div className="absolute inset-0 h-[3px] bg-gradient-to-r from-emerald-500/20 via-transparent to-red-500/20" />
        <div className="relative h-1.5">
          <div
            className={`absolute top-0 h-1.5 ${
              isPositive ? 'bg-emerald-500' : 'bg-red-500'
            }`}
            style={{
              width: `${Math.min(Math.abs(percentChange), 100)}%`,
              left: isPositive ? '50%' : `${50 - Math.min(Math.abs(percentChange), 100)}%`,
            }}
          />
          <div className="absolute top-0 left-1/2 h-2.5 w-0.5 -translate-x-1/2 bg-foreground/50" />
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>24h Volume: {volume.toLocaleString()} shares</span>
      </div>
    </div>
  );
}