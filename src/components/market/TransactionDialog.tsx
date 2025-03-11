import { useState, useEffect } from 'react';
import { Loader2, Check, AlertCircle, DollarSign } from 'lucide-react';
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
import { RawOrderBookData } from './RawOrderBookData';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";

interface OrderBookData {
  bids: Record<string, number>;
  asks: Record<string, number>;
  best_bid: number | null;
  best_ask: number | null;
  spread: string | null;
  timestamp?: string;
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
  const [isClosing, setIsClosing] = useState(false);
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const [quantity, setQuantity] = useState<number>(10);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  useEffect(() => {
    if (!selectedMarket) return;
    
    const fetchUserBalance = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          console.log('[TransactionDialog] No active user session');
          return;
        }
        
        const { data, error } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', session.user.id)
          .single();
          
        if (error) {
          console.error('[TransactionDialog] Error fetching user balance:', error);
          return;
        }
        
        if (data) {
          console.log('[TransactionDialog] User balance:', data.balance);
          setUserBalance(data.balance);
        }
      } catch (error) {
        console.error('[TransactionDialog] Error fetching user data:', error);
      }
    };
    
    fetchUserBalance();
  }, [selectedMarket]);

  useEffect(() => {
    if (isConfirmed) {
      const timer = setTimeout(() => {
        handleClose();
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [isConfirmed]);

  const handleClose = () => {
    console.log('[TransactionDialog] Closing dialog');
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
      setIsConfirmed(false);
      setIsConfirming(false);
    }, 100);
  };

  const handleConfirmClick = () => {
    if (!selectedMarket || !orderBookData) return;
    
    setIsConfirming(true);
    
    // Simulate transaction processing
    setTimeout(() => {
      setIsConfirming(false);
      setIsConfirmed(true);
      onConfirm();
      
      toast({
        title: "Transaction Successful",
        description: `Your ${selectedMarket.action} order for ${quantity} shares of ${selectedMarket.selectedOutcome} has been processed.`,
        variant: "default",
      });
    }, 1500);
  };

  const getEstimatedCost = () => {
    if (!orderBookData || !selectedMarket) return 0;
    
    const price = selectedMarket.action === 'buy' 
      ? orderBookData.best_ask 
      : orderBookData.best_bid;
      
    return price !== null ? price * quantity : 0;
  };

  const hasEnoughBalance = () => {
    if (userBalance === null) return false;
    return userBalance >= getEstimatedCost();
  };

  return (
    <AlertDialog 
      open={selectedMarket !== null} 
      onOpenChange={handleClose}
    >
      <AlertDialogContent className="max-w-2xl">
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
                    {isConfirmed ? (
                      <div className="flex items-center text-green-500">
                        <Check className="mr-2 h-5 w-5" />
                        Order Confirmed!
                      </div>
                    ) : (
                      <>
                        {selectedMarket?.action === 'buy' ? 'Buy' : 'Sell'} {selectedMarket?.selectedOutcome}
                      </>
                    )}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-sm line-clamp-2">
                    {topMover.question}
                  </AlertDialogDescription>
                </div>
              </>
            )}
          </div>
          
          {isConfirmed ? (
            <div className="space-y-4 py-6">
              <div className="flex flex-col items-center justify-center text-center space-y-2">
                <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                  <Check className="h-6 w-6 text-green-600 dark:text-green-300" />
                </div>
                <h3 className="text-lg font-medium">Transaction Complete</h3>
                <p className="text-sm text-muted-foreground">
                  Your order has been processed successfully. It may take a moment to reflect in your portfolio.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm space-y-2">
                <div className="font-medium">Market Information</div>
                <div className="grid grid-cols-2 gap-2 text-xs bg-muted/50 p-2 rounded">
                  <div>Token ID:</div>
                  <div className="font-mono break-all">{selectedMarket?.clobTokenId}</div>
                  <div>Market ID:</div>
                  <div className="font-mono break-all">{topMover?.market_id}</div>
                  <div>User Balance:</div>
                  <div>{userBalance !== null ? `$${userBalance.toFixed(2)}` : 'Loading...'}</div>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="font-medium text-sm">Transaction Details</div>
                <div className="bg-muted/50 p-3 rounded space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Quantity</span>
                    <div className="flex items-center space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-7 w-7 p-0" 
                        onClick={() => setQuantity(Math.max(1, quantity - 5))}
                      >
                        -
                      </Button>
                      <span className="w-8 text-center">{quantity}</span>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-7 w-7 p-0" 
                        onClick={() => setQuantity(quantity + 5)}
                      >
                        +
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Price per Share</span>
                    <span className="font-medium">
                      {orderBookData ? 
                        `$${(selectedMarket?.action === 'buy' ? 
                          orderBookData.best_ask : 
                          orderBookData.best_bid)?.toFixed(3) || 'N/A'}` : 
                        'Loading...'}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center font-medium">
                    <span>Estimated Cost</span>
                    <span>${getEstimatedCost().toFixed(2)}</span>
                  </div>
                  
                  {!hasEnoughBalance() && userBalance !== null && (
                    <div className="flex items-center text-red-500 text-xs pt-2">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Insufficient balance
                    </div>
                  )}
                </div>
              </div>
              
              <div className="text-sm font-medium">
                Order Book Data Feed
              </div>
              
              <RawOrderBookData 
                clobTokenId={selectedMarket?.clobTokenId}
                isClosing={isClosing}
                onOrderBookData={onOrderBookData}
              />
              
              <div className="text-xs text-muted-foreground mt-4">
                This data feed updates in real-time using Polymarket's WebSocket API.
              </div>
            </div>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          {!isConfirmed && (
            <>
              <AlertDialogCancel onClick={handleClose}>Cancel</AlertDialogCancel>
              <Button 
                onClick={handleConfirmClick}
                disabled={isConfirming || !hasEnoughBalance() || !orderBookData}
                className={`${selectedMarket?.action === 'buy' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
              >
                {isConfirming ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <DollarSign className="mr-2 h-4 w-4" />
                    Confirm {selectedMarket?.action === 'buy' ? 'Purchase' : 'Sale'}
                  </>
                )}
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
