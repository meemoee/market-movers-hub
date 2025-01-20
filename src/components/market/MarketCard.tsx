import { TrendingUp, TrendingDown, ChevronUp, ChevronDown } from "lucide-react";
import { MarketHeader } from "./MarketHeader";
import { MarketDetails } from "./MarketDetails";

interface Market {
  market_id: string;
  question: string;
  price: number;
  price_change: number;
  volume: number;
  image: string;
  yes_sub_title?: string;
  final_last_traded_price: number;
  final_best_ask: number;
  final_best_bid: number;
  description?: string;
  outcomes?: string[];
}

interface MarketCardProps {
  market: Market;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onBuy: () => void;
  onSell: () => void;
}

export function MarketCard({
  market,
  isExpanded,
  onToggleExpand,
  onBuy,
  onSell,
}: MarketCardProps) {
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
    <div className="w-full rounded-lg bg-card border border-border p-3 space-y-3">
      <MarketHeader
        image={market.image}
        question={market.question}
        yesSubTitle={market.yes_sub_title}
        bestBid={market.final_best_bid}
        bestAsk={market.final_best_ask}
        onBuy={onBuy}
        onSell={onSell}
        outcomes={market.outcomes}
      />
      <div className="w-full grid grid-cols-[1fr_200px] gap-4">
        <div>
          <div className="text-3xl font-bold tracking-tight">
            {formatPrice(market.final_last_traded_price)}
          </div>
          <div className={`flex items-center gap-1 text-sm font-medium mt-0.5
            ${market.price_change >= 0 ? 'text-green-500' : 'text-red-500'}`}
          >
            {market.price_change >= 0 ? (
              <TrendingUp className="w-4 h-4" />
            ) : (
              <TrendingDown className="w-4 h-4" />
            )}
            {formatPriceChange(market.price_change)}
          </div>
        </div>
        <div className="flex flex-col items-end justify-between">
          <div className="flex flex-col items-end">
            <span className="text-xl font-semibold">
              {formatVolume(market.volume)}
            </span>
            <span className="text-sm text-muted-foreground">
              24h Volume
            </span>
          </div>
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
      {isExpanded && market.description && (
        <MarketDetails
          description={market.description}
          bestBid={market.final_best_bid}
          bestAsk={market.final_best_ask}
          marketId={market.market_id}
        />
      )}
    </div>
  );
}