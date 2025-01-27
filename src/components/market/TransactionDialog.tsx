import { Loader2 } from 'lucide-react';
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
import { LiveOrderBook } from './LiveOrderBook';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface OrderBookData {
  bids: Record<string, number>;
  asks: Record<string, number>;
  best_bid: number;
  best_ask: number;
  spread: number;
}

interface TopMover {
  market_id: string;
  question: string;
  image: string;
}

interface TransactionDialogProps {
  selectedMarket: { 
    id: string; 
    action: 'buy' | 'sell';
    clobTokenId: string;
  } | null;
  topMover: TopMover | null;
  onClose: () => void;
  orderBookData: OrderBookData | null;
  isOrderBookLoading: boolean;
  onOrderBookData: (data: OrderBookData) => void;
  onConfirm: () => void;
}

export function TransactionDialog({
  selectedMarket,
  topMover,
  onClose,
  orderBookData,
  isOrderBookLoading,
  onOrderBookData,
  onConfirm,
}: TransactionDialogProps) {
  const { toast } = useToast();

  const handleConfirm = async () => {
    if (!selectedMarket || !orderBookData) return;

    try {
      // First get the current user's session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "You must be logged in to place orders.",
        });
        return;
      }

      const price = selectedMarket.action === 'buy' ? orderBookData.best_ask : orderBookData.best_bid;
      const size = 1; // Default size for now

      // Call the execute_market_order function
      const { data, error } = await supabase.rpc('execute_market_order', {
        p_user_id: session.user.id,
        p_market_id: selectedMarket.id,
        p_token_id: selectedMarket.clobTokenId,
        p_outcome: 'yes', // Default to 'yes' for now
        p_side: selectedMarket.action,
        p_size: size,
        p_price: price
      });

      if (error) {
        console.error('Error executing order:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: error.message || "Failed to place your order. Please try again.",
        });
        return;
      }
      
      toast({
        title: "Order confirmed",
        description: `Your ${selectedMarket.action} order has been placed successfully at ${(price * 100).toFixed(2)}¢`,
      });
      
      onConfirm();
    } catch (error: any) {
      console.error('Error executing order:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to place your order. Please try again.",
      });
    }
  };

  return (
    <AlertDialog 
      open={selectedMarket !== null} 
      onOpenChange={onClose}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-start gap-4 mb-4">
            {topMover && (
              <>
                <img
                  src={topMover.image}
                  alt=""
                  className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <AlertDialogTitle className="text-lg font-semibold mb-1">
                    {selectedMarket?.action === 'buy' ? 'Buy' : 'Sell'}
                  </AlertDialogTitle>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {topMover.question}
                  </p>
                </div>
              </>
            )}
          </div>
          <AlertDialogDescription className="space-y-4">
            <LiveOrderBook 
              onOrderBookData={onOrderBookData}
              isLoading={isOrderBookLoading}
              clobTokenId={selectedMarket?.clobTokenId}
            />
            
            {orderBookData && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Bids</div>
                    <div className="bg-accent/20 p-3 rounded-lg space-y-1">
                      {Object.entries(orderBookData.bids)
                        .sort(([priceA], [priceB]) => Number(priceB) - Number(priceA))
                        .slice(0, 5)
                        .map(([price, size]) => (
                          <div key={price} className="flex justify-between text-sm">
                            <span className="text-green-500">{(Number(price) * 100).toFixed(2)}¢</span>
                            <span>{size.toFixed(2)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Asks</div>
                    <div className="bg-accent/20 p-3 rounded-lg space-y-1">
                      {Object.entries(orderBookData.asks)
                        .sort(([priceA], [priceB]) => Number(priceA) - Number(priceB))
                        .slice(0, 5)
                        .map(([price, size]) => (
                          <div key={price} className="flex justify-between text-sm">
                            <span className="text-red-500">{(Number(price) * 100).toFixed(2)}¢</span>
                            <span>{size.toFixed(2)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 bg-accent/20 p-4 rounded-lg">
                  <div>
                    <div className="text-sm text-muted-foreground">Best Bid</div>
                    <div className="text-lg font-medium text-green-500">
                      {(orderBookData.best_bid * 100).toFixed(2)}¢
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Best Ask</div>
                    <div className="text-lg font-medium text-red-500">
                      {(orderBookData.best_ask * 100).toFixed(2)}¢
                    </div>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  Spread: {((orderBookData.best_ask - orderBookData.best_bid) * 100).toFixed(2)}¢
                </div>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!orderBookData || isOrderBookLoading}
            className={selectedMarket?.action === 'buy' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}
          >
            {isOrderBookLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Connecting...
              </>
            ) : (
              `Confirm ${selectedMarket?.action}`
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}