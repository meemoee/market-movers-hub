import { QADisplay } from "./QADisplay";
import { MarketWebSearchCard } from "./MarketWebSearchCard";

interface MarketDetailsProps {
  description?: string;
  bestBid?: number;
  bestAsk?: number;
  marketId: string;
  question: string;
}

export function MarketDetails({
  description,
  bestBid,
  bestAsk,
  marketId,
  question
}: MarketDetailsProps) {
  return (
    <div className="space-y-4">
      {description && (
        <div className="text-sm text-muted-foreground">
          {description}
        </div>
      )}
      
      {description && (
        <MarketWebSearchCard marketDescription={description} />
      )}

      <QADisplay
        marketId={marketId}
        marketQuestion={question}
        bestBid={bestBid}
        bestAsk={bestAsk}
      />
    </div>
  );
}