
import { HoverButton } from "@/components/ui/hover-button";
import { useIsMobile } from "@/hooks/use-mobile";
import { MarketTags } from "./MarketTags";
import { ExternalLink } from "lucide-react";

interface MarketHeaderProps {
  image: string;
  question: string;
  url?: string;
  yesSubTitle?: string;
  bestBid?: number;
  bestAsk?: number;
  noPrice?: number;  // Price for the "No" outcome
  onBuy: () => void;
  onSell: () => void;
  outcomes?: string[];
  onToggleExpand: () => void;
  primaryTags?: string[];
  tagSlugs?: string[];
  tags?: unknown[];
}

export function MarketHeader({
  image,
  question,
  url,
  yesSubTitle,
  bestBid,
  bestAsk,
  noPrice,
  onBuy,
  onSell,
  outcomes = ["Yes", "No"],
  onToggleExpand,
  primaryTags,
  tagSlugs,
  tags
}: MarketHeaderProps) {
  const isMobile = useIsMobile();
  
  const truncateOutcome = (outcome: string) => {
    return outcome.length > 8 ? `${outcome.slice(0, 6)}...` : outcome;
  };

  return (
    <div className={`flex flex-col ${isMobile ? 'gap-2' : 'sm:flex-row sm:items-center gap-4'}`}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <img
          src={image}
          alt=""
          className={`${isMobile ? 'w-9 h-9' : 'w-12 h-12'} rounded-lg object-cover flex-shrink-0`}
        />
        <div className="flex-1 min-w-0 py-1">
          <div className="flex items-start gap-2">
            <div
              className="flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={onToggleExpand}
            >
              <h3 className={`font-medium ${isMobile ? 'text-sm' : 'text-base'} leading-tight line-clamp-2`}>
                {question}
              </h3>
              {yesSubTitle && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {yesSubTitle}
                </p>
              )}
            </div>
          </div>
          <div className="mt-1">
            <MarketTags
              primaryTags={primaryTags}
              tagSlugs={tagSlugs}
              tags={tags}
              maxTags={isMobile ? 2 : 3}
            />
          </div>
        </div>
      </div>
      <div className={`flex items-center ${isMobile ? 'w-full' : 'w-auto'} gap-2 ${isMobile ? 'h-9' : 'h-12'} flex-shrink-0`}>
        <HoverButton
          variant="buy"
          onClick={onBuy}
          className={`flex-1 flex flex-col items-center justify-center ${isMobile ? '' : 'w-[90px]'}`}
        >
          <span className="text-xs truncate max-w-full px-1">{truncateOutcome(outcomes[0])}</span>
          {bestAsk !== undefined && (
            <span className="text-[11px] font-medium opacity-90">
              {(bestAsk * 100).toFixed(1)}¢
            </span>
          )}
        </HoverButton>
        <HoverButton
          variant="sell"
          onClick={onSell}
          className={`flex-1 flex flex-col items-center justify-center ${isMobile ? '' : 'w-[90px]'}`}
        >
          <span className="text-xs truncate max-w-full px-1">{truncateOutcome(outcomes[1])}</span>
          {noPrice !== undefined ? (
            <span className="text-[11px] font-medium opacity-90">
              {(noPrice * 100).toFixed(1)}¢
            </span>
          ) : null}
        </HoverButton>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`flex items-center justify-center text-muted-foreground hover:text-foreground ${isMobile ? 'w-8 h-9' : 'w-8 h-12'}`}
          >
            <ExternalLink className={isMobile ? 'w-3 h-3' : 'w-4 h-4'} />
          </a>
        )}
      </div>
    </div>
  );
}
