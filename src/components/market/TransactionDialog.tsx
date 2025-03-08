
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
import { useState, useEffect } from 'react';

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
  clobtokenids?: string[];
  outcomes?: string[];
  selectedOutcome?: string;
}

interface TransactionDialogProps {
  selectedMarket: { 
    id: string; 
    action: 'buy' | 'sell';
    clobTokenId: string;
    selectedOutcome: string;
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
  const [size, setSize] = useState(1);
  const [isClosing, setIsClosing] = useState(false);

  // Add effect to log when orderbook data changes
  useEffect(() => {
    console.log('[TransactionDialog] OrderBook data changed:', orderBookData);
  }, [orderBookData]);

  // Add effect to log when market selection changes
  useEffect(() => {
    if (selectedMarket) {
      console.log('[TransactionDialog] Market selected:', {
        id: selectedMarket.id,
        action: selectedMarket.action,
        clobTokenId: selectedMarket.clobTokenId,
        selectedOutcome: selectedMarket.selectedOutcome
      });
    }
  }, [selectedMarket]);

  const handleClose = () => {
    console.log('[TransactionDialog] Closing dialog');
    setIsClosing(true);
    setTimeout(() => {
      console.log('[TransactionDialog] Dialog closed, cleaning up orderbook data');
      onOrderBookData(null);
      onClose();
      setIsClosing(false);
    }, 100);
  };

  const handleConfirm = async () => {
    if (!selectedMarket || !orderBookData) {
      console.warn('[TransactionDialog] Cannot confirm order: missing market data or orderbook data');
      return;
    }

    console.log('[TransactionDialog] Confirming order for:', {
      marketId: selectedMarket.id,
      outcome: selectedMarket.selectedOutcome,
      size,
      price: orderBookData.best_ask
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        console.error('[TransactionDialog] No active user session');
        toast({
          variant: "destructive",
          title: "Error",
          description: "You must be logged in to place orders.",
        });
        return;
      }

      const price = orderBookData.best_ask;
      console.log('[TransactionDialog] Executing market order:', {
        user_id: session.user.id,
        market_id: selectedMarket.id,
        token_id: selectedMarket.clobTokenId,
        outcome: selectedMarket.selectedOutcome,
        size,
        price
      });
      
      const { data, error } = await supabase.functions.invoke('execute-market-order', {
        body: {
          user_id: session.user.id,
          market_id: selectedMarket.id,
          token_id: selectedMarket.clobTokenId,
          outcome: selectedMarket.selectedOutcome,
          side: 'buy',
          size,
          price
        }
      });

      if (error) {
        console.error('[TransactionDialog] Error executing order:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: error.message || "Failed to place your order. Please try again.",
        });
        return;
      }

      console.log('[TransactionDialog] Order executed successfully:', data);
      toast({
        title: "Order confirmed",
        description: `Your order to buy ${selectedMarket.selectedOutcome} has been placed successfully at ${(price * 100).toFixed(2)}¢`,
      });
      
      onConfirm();
    } catch (error: any) {
      console.error('[TransactionDialog] Error executing order:', error);
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
      onOpenChange={handleClose}
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
                    Buy {selectedMarket?.selectedOutcome}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-sm line-clamp-2">
                    {topMover.question}
                  </AlertDialogDescription>
                </div>
              </>
            )}
          </div>
          <div className="space-y-4">
            <LiveOrderBook 
              onOrderBookData={(data) => {
                console.log('[TransactionDialog] Received orderbook data from LiveOrderBook:', data);
                onOrderBookData(data);
              }}
              isLoading={isOrderBookLoading}
              clobTokenId={selectedMarket?.clobTokenId}
              isClosing={isClosing}
            />
            
            <div className="space-y-4 min-h-[280px]">
              {orderBookData && (
                <>
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
                </>
              )}
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!orderBookData || isOrderBookLoading}
            className="bg-green-500 hover:bg-green-600"
          >
            {isOrderBookLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Connecting...
              </>
            ) : (
              `Confirm purchase of ${selectedMarket?.selectedOutcome}`
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
