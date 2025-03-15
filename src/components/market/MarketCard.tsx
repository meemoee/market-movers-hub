
import { MarketHeader } from "./MarketHeader";
import { MarketDetails } from "./MarketDetails";
import { MarketStats } from "./MarketStats";
import { Separator } from "@/components/ui/separator";

interface Market {
  market_id: string;
  question: string;
  price: number;
  price_change: number;
  volume: number;
  total_volume: number;
  image: string;
  yes_sub_title?: string;
  final_last_traded_price: number;
  final_best_ask: number;
  final_best_bid: number;
  final_no_best_ask?: number;  // Add this field for the No best ask price
  description?: string;
  outcomes?: string[];
  event_id?: string;
}

interface MarketCardProps {
  market: Market;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onBuy: () => void;
  onSell: () => void;
  selectedInterval: string;
}

export function MarketCard({
  market,
  isExpanded,
  onToggleExpand,
  onBuy,
  onSell,
  selectedInterval,
}: MarketCardProps) {
  // Use the direct No price if available, otherwise calculate it
  const noPrice = market.final_no_best_ask !== undefined ? 
    market.final_no_best_ask : 
    market.final_best_bid !== undefined ? 
      1 - market.final_best_bid : 
      undefined;
  
  return (
    <div className="w-full p-3 space-y-3">
      <MarketHeader
        image={market.image}
        question={market.question}
        yesSubTitle={market.yes_sub_title}
        bestBid={market.final_best_bid}
        bestAsk={market.final_best_ask}
        noPrice={noPrice}
        onBuy={onBuy}
        onSell={onSell}
        outcomes={market.outcomes}
        onToggleExpand={onToggleExpand}
      />
      <MarketStats
        lastTradedPrice={market.final_last_traded_price}
        priceChange={market.price_change}
        volume={market.volume}
        totalVolume={market.total_volume}
        isExpanded={isExpanded}
      />
      {isExpanded && (
        <MarketDetails
          description={market.description}
          marketId={market.market_id}
          question={market.question}
          selectedInterval={selectedInterval}
          eventId={market.event_id}
          bestBid={market.final_best_bid}
          bestAsk={market.final_best_ask}
          outcomes={market.outcomes}
        />
      )}
      <Separator className="mt-3" />
    </div>
  );
}
