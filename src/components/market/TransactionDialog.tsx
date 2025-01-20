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

interface OrderBookData {
  bids: Record<string, number>;
  asks: Record<string, number>;
  best_bid: number;
  best_ask: number;
  spread: number;
}

interface TransactionDialogProps {
  selectedMarket: { 
    id: string; 
    action: 'buy' | 'sell';
    clobTokenId: string;
  } | null;
  onClose: () => void;
  orderBookData: OrderBookData | null;
  isOrderBookLoading: boolean;
  onOrderBookData: (data: OrderBookData) => void;
  onConfirm: () => void;
}

export function TransactionDialog({
  selectedMarket,
  onClose,
  orderBookData,
  isOrderBookLoading,
  onOrderBookData,
  onConfirm,
}: TransactionDialogProps) {
  return (
    <AlertDialog 
      open={selectedMarket !== null} 
      onOpenChange={onClose}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Confirm {selectedMarket?.action === 'buy' ? 'Purchase' : 'Sale'}
          </AlertDialogTitle>
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
            onClick={onConfirm}
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