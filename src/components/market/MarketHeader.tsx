
import { HoverButton } from "@/components/ui/hover-button";

interface MarketHeaderProps {
  image: string;
  question: string;
  yesSubTitle?: string;
  bestBid?: number;
  bestAsk?: number;
  noPrice?: number;  // Added noPrice prop to the interface
  onBuy: () => void;
  onSell: () => void;
  outcomes?: string[];
  onToggleExpand: () => void;
}

export function MarketHeader({ 
  image, 
  question, 
  yesSubTitle, 
  bestBid,
  bestAsk,
  noPrice,  // Added noPrice to destructured props
  onBuy, 
  onSell,
  outcomes = ["Yes", "No"],
  onToggleExpand
}: MarketHeaderProps) {
  const truncateOutcome = (outcome: string) => {
    return outcome.length > 8 ? `${outcome.slice(0, 6)}...` : outcome;
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <img
          src={image}
          alt=""
          className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
        />
        <div 
          className="flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity py-1.5"
          onClick={onToggleExpand}
        >
          <h3 className="font-medium text-base leading-tight">
            {question}
          </h3>
          {yesSubTitle && (
            <p className="text-sm text-muted-foreground mt-1">
              {yesSubTitle}
            </p>
          )}
        </div>
      </div>
      <div className="flex w-full sm:w-auto gap-2 h-12">
        <HoverButton
          variant="buy"
          onClick={onBuy}
          className="flex-1 sm:flex-initial flex flex-col items-center justify-center"
        >
          <span className="text-xs truncate max-w-[80px]">{truncateOutcome(outcomes[0])}</span>
          {bestAsk !== undefined && (
            <span className="text-[11px] font-medium opacity-90">
              {(bestAsk * 100).toFixed(1)}¢
            </span>
          )}
        </HoverButton>
        <HoverButton
          variant="sell"
          onClick={onSell}
          className="flex-1 sm:flex-initial flex flex-col items-center justify-center"
        >
          <span className="text-xs truncate max-w-[80px]">{truncateOutcome(outcomes[1])}</span>
          {noPrice !== undefined ? (
            <span className="text-[11px] font-medium opacity-90">
              {(noPrice * 100).toFixed(1)}¢
            </span>
          ) : bestBid !== undefined ? (
            <span className="text-[11px] font-medium opacity-90">
              {(100 - (bestBid * 100)).toFixed(1)}¢
            </span>
          ) : null}
        </HoverButton>
      </div>
    </div>
  );
}
