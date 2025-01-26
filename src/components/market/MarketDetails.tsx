import { QADisplay } from "./QADisplay";
import { OrderBook } from "./OrderBook";
import { PriceChart } from "./PriceChart";
import { WebResearchCard } from "./WebResearchCard";

interface MarketDetailsProps {
  description?: string;
  bestBid: number;
  bestAsk: number;
  marketId: string;
  question: string;
}

export function MarketDetails({
  description,
  bestBid,
  bestAsk,
  marketId,
  question,
}: MarketDetailsProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PriceChart marketId={marketId} />
        <OrderBook marketId={marketId} bestBid={bestBid} bestAsk={bestAsk} />
      </div>
      
      {description && (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground whitespace-pre-wrap">
            {description}
          </div>
          <WebResearchCard description={description} />
        </div>
      )}

      <QADisplay marketId={marketId} question={question} />
    </div>
  );
}