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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

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
  const [currentMarketId, setCurrentMarketId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedMarket?.id !== currentMarketId) {
      console.log('[TransactionDialog] Market changed, resetting state', {
        previous: currentMarketId,
        current: selectedMarket?.id
      });
      
      setCurrentMarketId(selectedMarket?.id || null);
      setSize(1);
      setSharePercentage(10);
      setShareAmount(0);
      
      if (selectedMarket === null || (currentMarketId !== null && selectedMarket.id !== currentMarketId)) {
        onOrderBookData(null);
      }
    }
  }, [selectedMarket, currentMarketId, onOrderBookData]);

  useEffect(() => {
    console.log('[TransactionDialog] OrderBook data changed:', orderBookData);
  }, [orderBookData]);

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
          updateShareAmount(10);
        }
      } catch (error) {
        console.error('[TransactionDialog] Error fetching user data:', error);
      }
    };
    
    fetchUserBalance();
  }, [selectedMarket]);

  useEffect(() => {
    updateShareAmount(sharePercentage);
  }, [sharePercentage, orderBookData]);

  const updateShareAmount = (percentage: number) => {
    if (!userBalance || !orderBookData) return;
    
    const maxAmount = userBalance * (percentage / 100);
    const price = orderBookData.best_ask;
    
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
    
    const percentage = Math.min((inputAmount / userBalance) * 100, 100);
    const price = orderBookData.best_ask;
    
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
    
    const price = orderBookData.best_ask;
    const amount = inputSize * price;
    
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
      setCurrentMarketId(null);
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

  // Create unified order book ladder data
  const createOrderBookLadder = () => {
    if (!orderBookData) return [];
    
    const maxRows = 8;
    
    // Get sorted bids (highest to lowest) and asks (lowest to highest)
    const sortedBids = Object.entries(orderBookData.bids)
      .sort(([priceA], [priceB]) => Number(priceB) - Number(priceA))
      .slice(0, maxRows);
    
    const sortedAsks = Object.entries(orderBookData.asks)
      .sort(([priceA], [priceB]) => Number(priceA) - Number(priceB))
      .slice(0, maxRows);

    // Create a combined price ladder
    const allPrices = new Set([
      ...sortedBids.map(([price]) => Number(price)),
      ...sortedAsks.map(([price]) => Number(price))
    ]);
    
    const sortedPrices = Array.from(allPrices).sort((a, b) => b - a);
    
    // Create ladder rows
    return sortedPrices.slice(0, maxRows).map(price => {
      const priceStr = price.toString();
      const bidSize = orderBookData.bids[priceStr] || 0;
      const askSize = orderBookData.asks[priceStr] || 0;
      
      return {
        price,
        bidSize,
        askSize,
        isBestBid: Math.abs(price - orderBookData.best_bid) < 0.0001,
        isBestAsk: Math.abs(price - orderBookData.best_ask) < 0.0001
      };
    });
  };

  const ladderData = createOrderBookLadder();

  return (
    <AlertDialog 
      open={selectedMarket !== null} 
      onOpenChange={handleClose}
    >
      <AlertDialogContent className="min-h-[700px] flex flex-col max-w-2xl">
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
          
          <div className="space-y-4 overflow-y-auto flex-1">
            <div className="h-16">
              <LiveOrderBook 
                onOrderBookData={onOrderBookData}
                isLoading={isOrderBookLoading}
                clobTokenId={selectedMarket?.clobTokenId}
                isClosing={isClosing}
              />
            </div>
            
            <div className="space-y-4">
              {/* DOM-Style Order Book Ladder */}
              <div className="bg-card/50 border rounded-lg p-4 space-y-3">
                <div className="text-sm font-medium mb-3">Market Depth</div>
                
                {/* Header */}
                <div className="grid grid-cols-5 gap-2 text-xs font-medium text-muted-foreground border-b pb-2">
                  <div className="text-right">Bid Size</div>
                  <div className="text-right">Bid</div>
                  <div className="text-center">Price</div>
                  <div className="text-left">Ask</div>
                  <div className="text-left">Ask Size</div>
                </div>
                
                {/* Loading overlay */}
                {isOrderBookLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-lg z-10">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                
                {/* Order book ladder rows */}
                <div className={`space-y-1 transition-opacity duration-300 relative ${isOrderBookLoading ? 'opacity-50' : 'opacity-100'}`}>
                  {ladderData.length > 0 ? (
                    ladderData.map((row, index) => (
                      <div 
                        key={`ladder-${row.price}-${index}`}
                        className={`grid grid-cols-5 gap-2 text-sm py-1.5 px-2 rounded transition-colors hover:bg-accent/20 ${
                          row.isBestBid || row.isBestAsk ? 'bg-accent/30' : ''
                        }`}
                      >
                        {/* Bid Size */}
                        <div className="text-right font-mono">
                          {row.bidSize > 0 ? row.bidSize.toFixed(2) : ''}
                        </div>
                        
                        {/* Bid Price */}
                        <div className={`text-right font-mono ${row.bidSize > 0 ? 'text-green-500 font-medium' : ''}`}>
                          {row.bidSize > 0 ? `${(row.price * 100).toFixed(2)}¢` : ''}
                        </div>
                        
                        {/* Center Price */}
                        <div className={`text-center font-mono font-medium ${
                          row.isBestBid ? 'text-green-500' : 
                          row.isBestAsk ? 'text-red-500' : 
                          'text-muted-foreground'
                        }`}>
                          {`${(row.price * 100).toFixed(2)}¢`}
                        </div>
                        
                        {/* Ask Price */}
                        <div className={`text-left font-mono ${row.askSize > 0 ? 'text-red-500 font-medium' : ''}`}>
                          {row.askSize > 0 ? `${(row.price * 100).toFixed(2)}¢` : ''}
                        </div>
                        
                        {/* Ask Size */}
                        <div className="text-left font-mono">
                          {row.askSize > 0 ? row.askSize.toFixed(2) : ''}
                        </div>
                      </div>
                    ))
                  ) : (
                    // Empty state
                    Array.from({ length: 8 }).map((_, index) => (
                      <div key={`empty-${index}`} className="grid grid-cols-5 gap-2 text-sm py-1.5 px-2">
                        <div className="text-right text-muted-foreground">--</div>
                        <div className="text-right text-muted-foreground">--</div>
                        <div className="text-center text-muted-foreground">--</div>
                        <div className="text-left text-muted-foreground">--</div>
                        <div className="text-left text-muted-foreground">--</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              
              {/* Market Summary */}
              <div className="grid grid-cols-3 gap-4 bg-accent/20 p-4 rounded-lg">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">Best Bid</div>
                  <div className="text-lg font-bold text-green-500">
                    {orderBookData?.best_bid ? `${(orderBookData.best_bid * 100).toFixed(2)}¢` : "--"}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">Spread</div>
                  <div className="text-lg font-bold">
                    {orderBookData?.spread ? `${(orderBookData.spread * 100).toFixed(2)}¢` : "--"}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">Best Ask</div>
                  <div className="text-lg font-bold text-red-500">
                    {orderBookData?.best_ask ? `${(orderBookData.best_ask * 100).toFixed(2)}¢` : "--"}
                  </div>
                </div>
              </div>

              {/* Order Details */}
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
                    className="w-full h-2 bg-accent rounded-lg appearance-none cursor-pointer slider"
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
                  <span className="text-sm font-medium">
                    {orderBookData && orderBookData.best_ask ? 
                      `$${(size * orderBookData.best_ask).toFixed(2)}` : 
                      '--'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!orderBookData || isOrderBookLoading || size <= 0}
            className="bg-green-500 hover:bg-green-600"
          >
            {isOrderBookLoading ? (
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
