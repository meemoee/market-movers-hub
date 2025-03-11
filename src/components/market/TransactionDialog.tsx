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
import { useState, useEffect, useRef } from 'react';
import { Input } from "@/components/ui/input";
import { MultiRangeSlider } from "@/components/ui/multi-range-slider";

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
  onOrderBookData: (data: OrderBookData | null) => void;
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
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const [sharePercentage, setSharePercentage] = useState<number>(10);
  const [shareAmount, setShareAmount] = useState<number>(0);
  const [localIsLoading, setLocalIsLoading] = useState<boolean>(true);
  const initialLoadCompleteRef = useRef<boolean>(false);

  // Add effect to log when market selection changes
  useEffect(() => {
    if (selectedMarket) {
      console.log('[TransactionDialog] Market selected:', {
        id: selectedMarket.id,
        action: selectedMarket.action,
        clobTokenId: selectedMarket.clobTokenId,
        selectedOutcome: selectedMarket.selectedOutcome
      });
      
      // Reset loading state when market changes
      setLocalIsLoading(true);
      initialLoadCompleteRef.current = false;
    }
  }, [selectedMarket]);

  // Add effect to handle orderbook data changes
  useEffect(() => {
    console.log('[TransactionDialog] OrderBook data changed:', orderBookData);
    
    // If we receive non-null orderbook data, mark loading as complete
    if (orderBookData && localIsLoading && !initialLoadCompleteRef.current) {
      console.log('[TransactionDialog] Initial orderbook data received, ending loading state');
      setLocalIsLoading(false);
      initialLoadCompleteRef.current = true;
    }
  }, [orderBookData, localIsLoading]);

  // Fetch user balance when dialog opens
  useEffect(() => {
    const fetchUserBalance = async () => {
      if (!selectedMarket) return;
      
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
          // Initialize share amount to 10% of balance
          updateShareAmount(10);
        }
      } catch (error) {
        console.error('[TransactionDialog] Error fetching user data:', error);
      }
    };
    
    fetchUserBalance();
  }, [selectedMarket]);

  // Update share amount when percentage or orderbook data changes
  useEffect(() => {
    updateShareAmount(sharePercentage);
  }, [sharePercentage, orderBookData]);

  const updateShareAmount = (percentage: number) => {
    if (!userBalance || !orderBookData) return;
    
    const maxAmount = userBalance * (percentage / 100);
    const price = orderBookData.best_ask;
    
    // Calculate how many shares can be purchased with this amount at current price
    const shares = price > 0 ? (maxAmount / price) : 0;
    
    setSharePercentage(percentage);
    setSize(parseFloat(shares.toFixed(2)));
    setShareAmount(parseFloat(maxAmount.toFixed(2)));
  };

  const handleSharePercentageChange = (value: number) => {
    updateShareAmount(value);
  };

  const handleShareAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!userBalance || !orderBookData) return;
    
    const inputAmount = parseFloat(e.target.value);
    
    if (isNaN(inputAmount) || inputAmount <= 0) {
      setShareAmount(0);
      setSize(0);
      setSharePercentage(0);
      return;
    }
    
    // Calculate percentage of balance
    const percentage = Math.min((inputAmount / userBalance) * 100, 100);
    const price = orderBookData.best_ask;
    
    // Calculate shares based on amount and price
    const shares = price > 0 ? (inputAmount / price) : 0;
    
    setShareAmount(inputAmount);
    setSize(parseFloat(shares.toFixed(2)));
    setSharePercentage(percentage);
  };

  const handleShareSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!orderBookData) return;
    
    const inputSize = parseFloat(e.target.value);
    
    if (isNaN(inputSize) || inputSize <= 0) {
      setShareAmount(0);
      setSize(0);
      setSharePercentage(0);
      return;
    }
    
    // Calculate dollar amount based on size and price
    const price = orderBookData.best_ask;
    const amount = inputSize * price;
    
    // Calculate percentage of balance
    const percentage = userBalance ? Math.min((amount / userBalance) * 100, 100) : 0;
    
    setSize(inputSize);
    setShareAmount(parseFloat(amount.toFixed(2)));
    setSharePercentage(percentage);
  };

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

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;
  const formatPercentage = (value: number) => `${value}%`;

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
            {/* Always render LiveOrderBook component when we have a selectedMarket */}
            {selectedMarket && (
              <LiveOrderBook 
                onOrderBookData={(data) => {
                  console.log('[TransactionDialog] Received orderbook data from LiveOrderBook:', data);
                  onOrderBookData(data);
                }}
                isLoading={false} // Important: Don't pass isOrderBookLoading here
                clobTokenId={selectedMarket.clobTokenId}
                isClosing={isClosing}
              />
            )}
            
            <div className="space-y-4 min-h-[280px]">
              {localIsLoading && (
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin mb-2" />
                  <p className="text-muted-foreground text-sm">
                    Connecting to order book...
                  </p>
                </div>
              )}
              
              {!localIsLoading && orderBookData && (
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
                  <div className="text-sm text-muted-foreground mb-4">
                    Spread: {((orderBookData.best_ask - orderBookData.best_bid) * 100).toFixed(2)}¢
                  </div>

                  {/* Share Amount Box and Slider */}
                  <div className="bg-accent/20 p-4 rounded-lg space-y-4">
                    <div className="text-sm font-medium">Order Details</div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label htmlFor="amount" className="text-xs text-muted-foreground">Amount ($)</label>
                        <Input
                          id="amount"
                          type="number"
                          min="0"
                          step="0.01"
                          value={shareAmount}
                          onChange={handleShareAmountChange}
                          className="bg-background"
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="size" className="text-xs text-muted-foreground">Size (shares)</label>
                        <Input
                          id="size"
                          type="number"
                          min="0"
                          step="0.01"
                          value={size}
                          onChange={handleShareSizeChange}
                          className="bg-background"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-xs text-muted-foreground">Balance: {userBalance ? formatCurrency(userBalance) : 'Loading...'}</span>
                        <span className="text-xs font-medium">{formatPercentage(Math.round(sharePercentage))}</span>
                      </div>
                      
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={sharePercentage}
                        onChange={(e) => handleSharePercentageChange(parseInt(e.target.value))}
                        className="w-full h-2 bg-accent rounded-lg appearance-none cursor-pointer"
                      />
                      
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0%</span>
                        <span>25%</span>
                        <span>50%</span>
                        <span>75%</span>
                        <span>100%</span>
                      </div>
                    </div>
                    
                    <div className="flex justify-between pt-2 border-t border-border">
                      <span className="text-sm">Total Cost:</span>
                      <span className="text-sm font-medium">${(size * orderBookData.best_ask).toFixed(2)}</span>
                    </div>
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
            disabled={!orderBookData || localIsLoading || size <= 0}
            className="bg-green-500 hover:bg-green-600"
          >
            {localIsLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Connecting...
              </>
            ) : (
              `Confirm purchase of ${selectedMarket?.selectedOutcome} (${size} shares)`
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
