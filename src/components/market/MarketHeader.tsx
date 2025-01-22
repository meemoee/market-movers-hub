import { HoverButton } from "@/components/ui/hover-button";

interface MarketHeaderProps {
  image: string;
  question: string;
  yesSubTitle?: string;
  bestBid?: number;
  bestAsk?: number;
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
  onBuy, 
  onSell,
  outcomes = ["Yes", "No"],
  onToggleExpand
}: MarketHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex items-start gap-4 flex-1">
        <img
          src={image}
          alt=""
          className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
        />
        <div 
          className="flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
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
          <span className="text-xs truncate max-w-full">{outcomes[0]}</span>
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
          <span className="text-xs truncate max-w-full">{outcomes[1]}</span>
          {bestBid !== undefined && (
            <span className="text-[11px] font-medium opacity-90">
              {(bestBid * 100).toFixed(1)}¢
            </span>
          )}
        </HoverButton>
      </div>
    </div>
  );
}