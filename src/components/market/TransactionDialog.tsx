import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { LiveOrderBook } from "./LiveOrderBook";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface TransactionDialogProps {
  selectedMarket: { 
    id: string; 
    action: 'buy' | 'sell';
    clobTokenId: string;
  } | null;
  onClose: () => void;
  orderBookData: {
    bids: Record<string, number>;
    asks: Record<string, number>;
    best_bid: number;
    best_ask: number;
    spread: number;
  } | null;
  isOrderBookLoading: boolean;
  onOrderBookData: (data: any) => void;
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
  const { toast } = useToast();

  const handleConfirm = () => {
    if (!orderBookData) {
      toast({
        title: "Error",
        description: "Please wait for orderbook data to load",
        variant: "destructive",
      });
      return;
    }
    onConfirm();
  };

  return (
    <AlertDialog open={!!selectedMarket} onOpenChange={() => onClose()}>
      <AlertDialogContent className="sm:max-w-[500px]">
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-[9999]">
          <div className="bg-[#1a1b1e] w-[90%] max-w-[500px] rounded-lg p-6 max-h-[90vh] overflow-y-auto">
            {selectedMarket && (
              <>
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 bg-gray-800 rounded-lg" /> {/* Placeholder for image */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Button
                        variant={selectedMarket.action === 'buy' ? 'default' : 'outline'}
                        className={selectedMarket.action === 'buy' ? 'bg-green-600' : ''}
                        disabled
                      >
                        Buy
                      </Button>
                      <Button
                        variant={selectedMarket.action === 'sell' ? 'default' : 'outline'}
                        className={selectedMarket.action === 'sell' ? 'bg-red-600' : ''}
                        disabled
                      >
                        Sell
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <LiveOrderBook
                    onOrderBookData={onOrderBookData}
                    isLoading={isOrderBookLoading}
                    clobTokenId={selectedMarket.clobTokenId}
                  />
                </div>

                {orderBookData && (
                  <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Best Bid</p>
                        <p className="font-medium text-green-500">
                          {(orderBookData.best_bid * 100).toFixed(2)}¢
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Best Ask</p>
                        <p className="font-medium text-red-500">
                          {(orderBookData.best_ask * 100).toFixed(2)}¢
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-4 mt-6">
                  <Button
                    onClick={handleConfirm}
                    className="flex-1 bg-green-600 text-white hover:bg-green-700"
                  >
                    Confirm
                  </Button>
                  <Button
                    onClick={onClose}
                    className="flex-1 bg-red-600 text-white hover:bg-red-700"
                  >
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}