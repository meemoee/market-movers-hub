
import { MarketHeader } from "./MarketHeader";
import { MarketDetails } from "./MarketDetails";
import { MarketStats } from "./MarketStats";
import { Separator } from "@/components/ui/separator";
import { useIsMobile } from "@/hooks/use-mobile";

interface Market {
  market_id: string;
  question: string;
  price: number;
  price_change: number;
  volume: number;
  total_volume: number;
  image: string;
  url?: string;
  yes_sub_title?: string;
  final_last_traded_price: number;
  final_best_ask: number;
  final_best_bid: number;
  final_no_best_ask?: number;  
  final_no_best_bid?: number;  // Add this field for the No best bid price
  description?: string;
  outcomes?: string[];
  event_id?: string;
  primary_tags?: string[];
  tag_slugs?: string[];
  tags?: unknown[];
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
  const isMobile = useIsMobile();
  
  // Use the direct No price if available, otherwise calculate it
  const noPrice = market.final_no_best_ask !== undefined ? 
    market.final_no_best_ask : 
    market.final_best_bid !== undefined ? 
      1 - market.final_best_bid : 
      undefined;
  
  return (
    <div className={`w-full ${isMobile ? 'px-2 py-2' : 'p-3'} space-y-3 overflow-hidden`}>
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
        primaryTags={market.primary_tags}
        tagSlugs={market.tag_slugs}
        tags={market.tags}
        url={market.url}
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
          noBestBid={market.final_no_best_bid}
          noBestAsk={market.final_no_best_ask}
          outcomes={market.outcomes}
        />
      )}
      <Separator className="mt-3" />
    </div>
  );
}
