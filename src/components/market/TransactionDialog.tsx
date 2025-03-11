
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
import { RawOrderBookData } from './RawOrderBookData';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useState, useEffect } from 'react';
import { Input } from "@/components/ui/input";

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
  const [sharePercentage, setSharePercentage] = useState<number>(10);
  const [shareAmount, setShareAmount] = useState<number>(0);

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
          updateShareAmount(10, data.balance);
        }
      } catch (error) {
        console.error('[TransactionDialog] Error fetching user data:', error);
      }
    };
    
    fetchUserBalance();
  }, [selectedMarket]);

  const updateShareAmount = (percentage: number, balance: number = userBalance || 0) => {
    const maxAmount = balance * (percentage / 100);
    const price = 0.5; // Default price if no orderbook data
    
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
    if (!userBalance) return;
    
    const inputAmount = parseFloat(e.target.value);
    
    if (isNaN(inputAmount) || inputAmount <= 0) {
      setShareAmount(0);
      setSize(0);
      setSharePercentage(0);
      return;
    }
    
    // Calculate percentage of balance
    const percentage = Math.min((inputAmount / userBalance) * 100, 100);
    const price = 0.5; // Default price if no orderbook data
    
    // Calculate shares based on amount and price
    const shares = price > 0 ? (inputAmount / price) : 0;
    
    setShareAmount(inputAmount);
    setSize(parseFloat(shares.toFixed(2)));
    setSharePercentage(percentage);
  };

  const handleClose = () => {
    console.log('[TransactionDialog] Closing dialog');
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 100);
  };

  const handleConfirm = async () => {
    if (!selectedMarket) {
      console.warn('[TransactionDialog] Cannot confirm order: missing market data');
      return;
    }

    console.log('[TransactionDialog] Confirming order for:', {
      marketId: selectedMarket.id,
      outcome: selectedMarket.selectedOutcome,
      size
    });

    toast({
      title: "Debug Mode",
      description: "Order execution is disabled in debug mode",
    });
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
                    WebSocket Debug: {selectedMarket?.selectedOutcome}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-sm line-clamp-2">
                    {topMover.question}
                  </AlertDialogDescription>
                </div>
              </>
            )}
          </div>
          
          <div className="space-y-4">
            <div className="text-sm font-medium">Raw WebSocket Data (Debug Mode)</div>
            <RawOrderBookData 
              clobTokenId={selectedMarket?.clobTokenId}
              isClosing={isClosing}
            />
            
            <div className="text-sm text-muted-foreground mt-4">
              This is a debug view showing raw data from the WebSocket connection.
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleClose}>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
