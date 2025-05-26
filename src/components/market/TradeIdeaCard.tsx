import { HoverButton } from "@/components/ui/hover-button";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface TradeIdeaCardProps {
  trade: {
    market_id: string;
    market_title: string;
    outcome: string;
    current_price: number;
    target_price: number;
    stop_price?: number;
    rationale: string;
    image?: string;
  };
}

export function TradeIdeaCard({ trade }: TradeIdeaCardProps) {
  const isMobile = useIsMobile();
  
  const formatPrice = (price: number): string => {
    return `${(price * 100).toFixed(1)}¢`;
  };

  const calculatePosition = (price: number): number => {
    return price * 100;
  };

  // Determine which outcome is being recommended
  const isYesOutcome = trade.outcome.toLowerCase().includes('yes');
  const outcomes = ['Yes', 'No'];
  
  // For display purposes - if recommending "No", we need to show the inverted CURRENT price
  // but keep target and stop as-is since the LLM already calculated them correctly
  const displayCurrentPrice = isYesOutcome ? trade.current_price : (1 - trade.current_price);
  const displayTargetPrice = trade.target_price; // Keep as-is from LLM
  const displayStopPrice = trade.stop_price; // Keep as-is from LLM
  
  // Button prices - always show actual market prices
  const yesPrice = trade.current_price; // This is the "Yes" price from market data
  const noPrice = 1 - trade.current_price; // This is the "No" price (complement)

  const truncateOutcome = (outcome: string) => {
    return outcome.length > 8 ? `${outcome.slice(0, 6)}...` : outcome;
  };

  // Calculate price change using display current price vs target
  const displayPriceChange = displayTargetPrice - displayCurrentPrice;
  const displayIsPositive = displayPriceChange >= 0;

  return (
    <div className={`w-full ${isMobile ? 'px-2 py-2' : 'p-3'} space-y-3 overflow-hidden border border-border rounded-lg`}>
      {/* Market Header */}
      <div className={`flex flex-col ${isMobile ? 'gap-2' : 'sm:flex-row sm:items-center gap-4'}`}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {trade.image && (
            <img
              src={trade.image}
              alt=""
              className={`${isMobile ? 'w-9 h-9' : 'w-12 h-12'} rounded-lg object-cover flex-shrink-0`}
            />
          )}
          <div className="flex-1 min-w-0">
            <h3 className={`font-medium ${isMobile ? 'text-sm' : 'text-base'} leading-tight line-clamp-2`}>
              {trade.market_title}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Recommended: {trade.outcome}
            </p>
          </div>
        </div>
        
        {/* Buy/Sell Buttons */}
        <div className={`flex ${isMobile ? 'w-full' : 'w-auto'} gap-2 ${isMobile ? 'h-9' : 'h-12'} flex-shrink-0`}>
          <HoverButton
            variant="buy"
            className={`flex-1 flex flex-col items-center justify-center ${isMobile ? 'max-w-[48%]' : 'w-[90px]'} ${isYesOutcome ? 'ring-2 ring-green-400/50' : ''}`}
          >
            <span className="text-xs truncate max-w-full px-1">{truncateOutcome(outcomes[0])}</span>
            <span className="text-[11px] font-medium opacity-90">
              {formatPrice(yesPrice)}
            </span>
          </HoverButton>
          <HoverButton
            variant="sell"
            className={`flex-1 flex flex-col items-center justify-center ${isMobile ? 'max-w-[48%]' : 'w-[90px]'} ${!isYesOutcome ? 'ring-2 ring-green-400/50' : ''}`}
          >
            <span className="text-xs truncate max-w-full px-1">{truncateOutcome(outcomes[1])}</span>
            <span className="text-[11px] font-medium opacity-90">
              {formatPrice(noPrice)}
            </span>
          </HoverButton>
        </div>
      </div>

      {/* Market Stats */}
      <div className="w-full flex flex-col space-y-2 pb-2">
        <div className="flex justify-between items-start pt-0.5">
          <div className="flex flex-col">
            <span className="text-3xl font-bold tracking-tight">
              {formatPrice(displayCurrentPrice)}
            </span>
            <span className={`text-sm font-medium flex items-center gap-1
              ${displayIsPositive ? 'text-green-500' : 'text-red-500'}`}
            >
              {displayIsPositive ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              Target: {formatPrice(displayTargetPrice)}
            </span>
          </div>
          <div className="flex flex-col items-end justify-end h-[60px]">
            <span className="text-lg font-semibold text-primary">
              Target
            </span>
            <span className="text-sm text-muted-foreground">
              {displayStopPrice ? `Stop: ${formatPrice(displayStopPrice)}` : 'No stop set'}
            </span>
          </div>
        </div>
        
        {/* Price visualization with target and stop indicators */}
        <div className="relative h-[3px] w-full">
          {/* Base line showing current price position */}
          <div 
            className="absolute bg-white/50 h-2 top-[-4px]" 
            style={{ 
              width: `${calculatePosition(displayCurrentPrice)}%`
            }}
          />
          
          {/* Current price indicator */}
          <div 
            className="absolute h-3 w-0.5 bg-white top-[-6px]"
            style={{ 
              left: `${calculatePosition(displayCurrentPrice)}%`
            }}
          />
          
          {/* Target price indicator - use original target from LLM */}
          <div 
            className="absolute h-4 w-0.5 bg-green-400 top-[-7px]"
            style={{ 
              left: `${Math.min(Math.max(calculatePosition(displayTargetPrice), 0), 100)}%`
            }}
          />
          
          {/* Stop price indicator - use original stop from LLM */}
          {displayStopPrice && (
            <div 
              className="absolute h-4 w-0.5 bg-red-400 top-[-7px]"
              style={{ 
                left: `${Math.min(Math.max(calculatePosition(displayStopPrice), 0), 100)}%`
              }}
            />
          )}
          
          {/* Price change visualization */}
          {displayIsPositive ? (
            <div 
              className="absolute bg-green-500/30 h-2 top-[-4px]" 
              style={{ 
                left: `${calculatePosition(displayCurrentPrice)}%`,
                width: `${Math.max(0, Math.min(calculatePosition(displayTargetPrice) - calculatePosition(displayCurrentPrice), 100 - calculatePosition(displayCurrentPrice)))}%`
              }}
            />
          ) : (
            <div 
              className="absolute bg-red-500/30 h-2 top-[-4px]" 
              style={{ 
                left: `${Math.max(calculatePosition(displayTargetPrice), 0)}%`,
                width: `${Math.max(0, Math.min(calculatePosition(displayCurrentPrice) - calculatePosition(displayTargetPrice), calculatePosition(displayCurrentPrice)))}%`
              }}
            />
          )}
        </div>
        
        {/* Legend for the indicators */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-0.5 h-3 bg-white"></div>
            <span>Current</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-0.5 h-4 bg-green-400"></div>
            <span>Target</span>
          </div>
          {displayStopPrice && (
            <div className="flex items-center gap-1">
              <div className="w-0.5 h-4 bg-red-400"></div>
              <span>Stop</span>
            </div>
          )}
        </div>
      </div>

      {/* Rationale */}
      <div className="pt-2 border-t border-border">
        <p className="text-sm text-muted-foreground">
          {trade.rationale}
        </p>
      </div>
    </div>
  );
}
