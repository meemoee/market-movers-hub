
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
import { Slider } from "@/components/ui/slider";

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
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const [investmentPercentage, setInvestmentPercentage] = useState([25]); // Start at 25%

  useEffect(() => {
    const fetchUserBalance = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', session.user.id)
          .single();

        if (!error && data) {
          setUserBalance(data.balance);
        }
      }
    };

    fetchUserBalance();
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onOrderBookData(null);
      onClose();
      setIsClosing(false);
    }, 100);
  };

  const calculateInvestmentAmount = () => {
    if (!userBalance || !orderBookData) return 0;
    const percentage = investmentPercentage[0];
    const amount = (userBalance * (percentage / 100));
    const price = orderBookData.best_ask;
    return amount / price;
  };

  // Update size when investment percentage changes
  useEffect(() => {
    if (orderBookData) {
      setSize(calculateInvestmentAmount());
    }
  }, [investmentPercentage, orderBookData, userBalance]);

  const handleConfirm = async () => {
    if (!selectedMarket || !orderBookData) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "You must be logged in to place orders.",
        });
        return;
      }

      const price = orderBookData.best_ask;
      
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
        description: `Your order to buy ${selectedMarket.selectedOutcome} has been placed successfully at ${(price * 100).toFixed(2)}¢`,
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

  const getSliderBackground = (percentage: number) => {
    // Start with a neutral color at 0% and gradually increase intensity
    const intensity = Math.min(percentage / 100, 1);
    const baseColor = [139, 92, 246]; // Vivid purple (matches the brand color)
    const r = Math.round(baseColor[0] * intensity);
    const g = Math.round(baseColor[1] * intensity);
    const b = Math.round(baseColor[2] * intensity);
    return `rgb(${r}, ${g}, ${b})`;
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
                  <div className="text-sm text-muted-foreground mb-4">
                    Spread: {((orderBookData.best_ask - orderBookData.best_bid) * 100).toFixed(2)}¢
                  </div>

                  <div className="space-y-4 bg-accent/20 p-4 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Investment Size</span>
                      <span className="text-sm font-medium">{investmentPercentage}% of balance</span>
                    </div>
                    <div 
                      className="p-2 rounded-lg" 
                      style={{ 
                        background: `linear-gradient(90deg, ${getSliderBackground(0)} 0%, ${getSliderBackground(100)} 100%)` 
                      }}
                    >
                      <Slider
                        value={investmentPercentage}
                        onValueChange={setInvestmentPercentage}
                        max={100}
                        step={1}
                        className="[&>[role=slider]]:h-4 [&>[role=slider]]:w-4"
                      />
                    </div>
                    {userBalance && (
                      <div className="text-sm text-muted-foreground">
                        {`$${(userBalance * (investmentPercentage[0] / 100)).toFixed(2)} of $${userBalance.toFixed(2)} available`}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </AlertDialogDescription>
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
