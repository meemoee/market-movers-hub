
import { MarketHeader } from "./MarketHeader";
import { MarketDetails } from "./MarketDetails";
import { MarketStats } from "./MarketStats";
import { Separator } from "@/components/ui/separator";

interface Market {
  market_id: string;
  question: string;
  price?: number;
  price_change?: number;
  volume?: number;
  image?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  subtitle?: string;
  final_last_traded_price?: number;
  final_best_ask?: number;
  final_best_bid?: number;
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
  // Ensure we have default values for all potentially undefined properties
  const {
    image = '',
    question = '',
    yes_sub_title,
    final_best_bid = 0,
    final_best_ask = 0,
    final_last_traded_price = 0,
    price_change = 0,
    volume = 0,
    outcomes = [],
    market_id = '',
    description,
    event_id,
    subtitle,
    no_sub_title,
  } = market;

  return (
    <div className="w-full p-3 space-y-3">
      <MarketHeader
        image={image}
        question={question}
        yesSubTitle={yes_sub_title}
        bestBid={final_best_bid}
        bestAsk={final_best_ask}
        onBuy={onBuy}
        onSell={onSell}
        outcomes={outcomes}
        onToggleExpand={onToggleExpand}
      />
      <MarketStats
        lastTradedPrice={final_last_traded_price}
        priceChange={price_change}
        volume={volume}
        isExpanded={isExpanded}
      />
      {isExpanded && (
        <MarketDetails
          description={description}
          marketId={market_id}
          question={question}
          selectedInterval={selectedInterval}
          eventId={event_id}
          subtitle={subtitle}
          yesSubTitle={yes_sub_title}
          noSubTitle={no_sub_title}
        />
      )}
      <Separator className="mt-3" />
    </div>
  );
}
