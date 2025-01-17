import { useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { Card } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { MarketCard } from './market/MarketCard';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

interface TimeInterval {
  label: string;
  value: string;
}

interface TopMoversListProps {
  topMovers: TopMover[];
  error: string | null;
  timeIntervals: readonly TimeInterval[];
  selectedInterval: string;
  onIntervalChange: (interval: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  openMarketsOnly: boolean;
  onOpenMarketsChange: (value: boolean) => void;
  isLoading?: boolean;
  isLoadingMore?: boolean;
}

interface TopMover {
  market_id: string;
  question: string;
  price: number;
  price_change: number;
  volume: number;
  image: string;
  yes_sub_title?: string;
  final_last_traded_price: number;
  final_best_ask: number;
  final_best_bid: number;
  volume_change: number;
  volume_change_percentage: number;
  url: string;
  outcomes?: string[] | string;
  description?: string;
}

export default function TopMoversList({
  timeIntervals,
  selectedInterval,
  onIntervalChange,
  topMovers,
  error,
  onLoadMore,
  hasMore,
  openMarketsOnly,
  onOpenMarketsChange,
  isLoading,
  isLoadingMore,
}: TopMoversListProps) {
  const [isTimeIntervalDropdownOpen, setIsTimeIntervalDropdownOpen] = useState(false);
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());
  const [selectedMarket, setSelectedMarket] = useState<{ id: string; action: 'buy' | 'sell' } | null>(null);
  const { toast } = useToast();

  const toggleMarket = (marketId: string) => {
    setExpandedMarkets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(marketId)) {
        newSet.delete(marketId);
      } else {
        newSet.add(marketId);
      }
      return newSet;
    });
  };

  const handleTransaction = () => {
    if (!selectedMarket) return;
    
    const action = selectedMarket.action;
    toast({
      title: "Transaction Submitted",
      description: `Your ${action} order has been submitted successfully.`,
    });
    setSelectedMarket(null);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Card className="sticky top-14 bg-card/95 backdrop-blur-sm z-40 mb-4 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">Market Movers</h2>
            <div className="relative">
              <button
                onClick={() => setIsTimeIntervalDropdownOpen(!isTimeIntervalDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/50 hover:bg-accent/70 transition-colors"
              >
                <span>{timeIntervals.find(i => i.value === selectedInterval)?.label}</span>
                <ChevronDown className="w-4 h-4" />
              </button>

              {isTimeIntervalDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 bg-card border border-border rounded-lg shadow-xl">
                  {timeIntervals.map((interval) => (
                    <button
                      key={interval.value}
                      className={`w-full px-4 py-2 text-left hover:bg-accent/50 transition-colors ${
                        selectedInterval === interval.value ? 'bg-accent/30' : ''
                      }`}
                      onClick={() => {
                        setIsTimeIntervalDropdownOpen(false);
                        onIntervalChange(interval.value);
                      }}
                    >
                      {interval.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={openMarketsOnly}
              onChange={e => onOpenMarketsChange(e.target.checked)}
              className="rounded border-border bg-transparent"
            />
            <span className="text-sm text-muted-foreground">Open Markets Only</span>
          </label>
        </div>
      </Card>

      <ScrollArea className="h-[calc(100vh-200px)]">
        <div className="space-y-3 px-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : (
            topMovers.map((mover) => (
              <MarketCard
                key={mover.market_id}
                market={mover}
                isExpanded={expandedMarkets.has(mover.market_id)}
                onToggleExpand={() => toggleMarket(mover.market_id)}
                onBuy={() => setSelectedMarket({ id: mover.market_id, action: 'buy' })}
                onSell={() => setSelectedMarket({ id: mover.market_id, action: 'sell' })}
              />
            ))
          )}

          {hasMore && !isLoading && (
            <button
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="w-full py-3 bg-accent/50 hover:bg-accent/70 rounded-lg transition-colors
                flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLoadingMore ? 'Loading...' : 'Load More'}
            </button>
          )}
        </div>
      </ScrollArea>

      <AlertDialog 
        open={selectedMarket !== null} 
        onOpenChange={() => setSelectedMarket(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirm {selectedMarket?.action === 'buy' ? 'Purchase' : 'Sale'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {selectedMarket?.action} this position?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTransaction}
              className={selectedMarket?.action === 'buy' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}
            >
              Confirm {selectedMarket?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}