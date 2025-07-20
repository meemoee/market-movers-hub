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

// CRITICAL FIX: Validate and correct trade idea pricing (same as PortfolioResults)
const validateAndFixTradeIdea = (trade: TradeIdeaCardProps['trade']) => {
  console.log(`Validating trade idea: ${trade.market_title}`);
  console.log(`Original - Current: ${trade.current_price}, Target: ${trade.target_price}, Stop: ${trade.stop_price}`);
  
  let correctedTrade = { ...trade };
  
  // Rule 1: Target MUST be higher than current (for profit)
  if (correctedTrade.target_price <= correctedTrade.current_price) {
    console.log(`FIXING: Target price ${correctedTrade.target_price} is not higher than current ${correctedTrade.current_price}`);
    correctedTrade.target_price = correctedTrade.current_price + 0.05; // Add 5 cents for reasonable target
  }
  
  // Rule 2: Stop MUST be lower than current (to limit losses)
  if (correctedTrade.stop_price && correctedTrade.stop_price >= correctedTrade.current_price) {
    console.log(`FIXING: Stop price ${correctedTrade.stop_price} is not lower than current ${correctedTrade.current_price}`);
    correctedTrade.stop_price = Math.max(0.01, correctedTrade.current_price - 0.05); // Subtract 5 cents, but never go below 1 cent
  }
  
  // Rule 3: Ensure stop is not higher than target (basic sanity check)
  if (correctedTrade.stop_price && correctedTrade.stop_price >= correctedTrade.target_price) {
    console.log(`FIXING: Stop price ${correctedTrade.stop_price} is not lower than target ${correctedTrade.target_price}`);
    correctedTrade.stop_price = Math.max(0.01, correctedTrade.target_price - 0.10); // 10 cents below target
  }
  
  console.log(`Corrected - Current: ${correctedTrade.current_price}, Target: ${correctedTrade.target_price}, Stop: ${correctedTrade.stop_price}`);
  
  return correctedTrade;
};

export function TradeIdeaCard({ trade: rawTrade }: TradeIdeaCardProps) {
  const isMobile = useIsMobile();
  
  // CRITICAL: Validate trade before using it
  const trade = validateAndFixTradeIdea(rawTrade);
  
  const formatPrice = (price: number): string => {
    return `${(price * 100).toFixed(1)}¢`;
  };

  const calculatePosition = (price: number): number => {
    return price * 100;
  };

  // Determine which outcome is being recommended
  const isYesOutcome = trade.outcome.toLowerCase().includes('yes');
  const outcomes = ['Yes', 'No'];
  
  // DON'T INVERT ANYTHING! The LLM now gives us the correct prices directly
  const actualCurrentPrice = trade.current_price;
  const actualTargetPrice = trade.target_price;
  const actualStopPrice = trade.stop_price;
  
  // For button prices, we need to show the actual market prices
  // The LLM gives us the trading price, but we need to show both outcomes
  let yesPrice, noPrice;
  if (isYesOutcome) {
    // If recommending Yes, current_price is the Yes price
    yesPrice = trade.current_price;
    noPrice = 1 - trade.current_price;
  } else {
    // If recommending No, current_price is the No price
    noPrice = trade.current_price;
    yesPrice = 1 - trade.current_price;
  }

  const truncateOutcome = (outcome: string) => {
    return outcome.length > 8 ? `${outcome.slice(0, 6)}...` : outcome;
  };

  // Calculate price change using the LLM's direct prices
  const priceChange = actualTargetPrice - actualCurrentPrice;
  const isPositive = priceChange >= 0;

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
      <div className="w-full flex flex-col space-y-4 pb-2">
        <div className="flex justify-between items-start pt-0.5">
          <div className="flex flex-col">
            <span className="text-3xl font-bold tracking-tight">
              {formatPrice(actualCurrentPrice)}
            </span>
          </div>
        </div>
        
        {/* Price visualization with target and stop indicators */}
        <div className="relative w-full" style={{ height: '60px' }}>
          {/* Labels positioned much higher above their respective indicators */}
          
          {/* Current price label with text and value */}
          <div 
            className="absolute text-[10px] text-white font-medium transform -translate-x-1/2 text-center leading-tight"
            style={{ 
              left: `${calculatePosition(actualCurrentPrice)}%`,
              top: '0px'
            }}
          >
            <div>Current</div>
            <div className="mt-1">{formatPrice(actualCurrentPrice)}</div>
          </div>
          
          {/* Target price label with text and value */}
          <div 
            className="absolute text-[10px] text-green-400 font-medium transform -translate-x-1/2 text-center leading-tight"
            style={{ 
              left: `${Math.min(Math.max(calculatePosition(actualTargetPrice), 0), 100)}%`,
              top: '0px'
            }}
          >
            <div>Target</div>
            <div className="mt-1">{formatPrice(actualTargetPrice)}</div>
          </div>
          
          {/* Stop price label with text and value */}
          {actualStopPrice && (
            <div 
              className="absolute text-[10px] text-red-400 font-medium transform -translate-x-1/2 text-center leading-tight"
              style={{ 
                left: `${Math.min(Math.max(calculatePosition(actualStopPrice), 0), 100)}%`,
                top: '0px'
              }}
            >
              <div>Stop</div>
              <div className="mt-1">{formatPrice(actualStopPrice)}</div>
            </div>
          )}
          
          {/* Price visualization bar - positioned at the bottom with proper spacing */}
          <div className="absolute w-full h-[3px]" style={{ top: '45px' }}>
            {/* Base line showing current price position */}
            <div 
              className="absolute bg-white/50 h-2 top-[-4px]" 
              style={{ 
                width: `${calculatePosition(actualCurrentPrice)}%`
              }}
            />
            
            {/* Current price indicator */}
            <div 
              className="absolute h-3 w-0.5 bg-white top-[-6px]"
              style={{ 
                left: `${calculatePosition(actualCurrentPrice)}%`
              }}
            />
            
            {/* Target price indicator */}
            <div 
              className="absolute h-4 w-0.5 bg-green-400 top-[-7px]"
              style={{ 
                left: `${Math.min(Math.max(calculatePosition(actualTargetPrice), 0), 100)}%`
              }}
            />
            
            {/* Stop price indicator */}
            {actualStopPrice && (
              <div 
                className="absolute h-4 w-0.5 bg-red-400 top-[-7px]"
                style={{ 
                  left: `${Math.min(Math.max(calculatePosition(actualStopPrice), 0), 100)}%`
                }}
              />
            )}
            
            {/* Price change visualization */}
            {isPositive ? (
              <div 
                className="absolute bg-green-500/30 h-2 top-[-4px]" 
                style={{ 
                  left: `${calculatePosition(actualCurrentPrice)}%`,
                  width: `${Math.max(0, Math.min(calculatePosition(actualTargetPrice) - calculatePosition(actualCurrentPrice), 100 - calculatePosition(actualCurrentPrice)))}%`
                }}
              />
            ) : (
              <div 
                className="absolute bg-red-500/30 h-2 top-[-4px]" 
                style={{ 
                  left: `${Math.max(calculatePosition(actualTargetPrice), 0)}%`,
                  width: `${Math.max(0, Math.min(calculatePosition(actualCurrentPrice) - calculatePosition(actualTargetPrice), calculatePosition(actualCurrentPrice)))}%`
                }}
              />
            )}
          </div>
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
