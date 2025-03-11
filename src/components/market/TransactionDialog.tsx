
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
  const [isClosing, setIsClosing] = useState(false);
  const [userBalance, setUserBalance] = useState<number | null>(null);

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
        }
      } catch (error) {
        console.error('[TransactionDialog] Error fetching user data:', error);
      }
    };
    
    fetchUserBalance();
  }, [selectedMarket]);

  const handleClose = () => {
    console.log('[TransactionDialog] Closing dialog');
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 100);
  };

  // Get the WebSocket URL for display
  const getWebSocketUrl = (tokenId?: string) => {
    if (!tokenId) return "";
    return `wss://lfmkoismabbhujycnqpn.functions.supabase.co/polymarket-ws?assetId=${tokenId}`;
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
                    Polymarket WebSocket Debug: {selectedMarket?.selectedOutcome}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-sm line-clamp-2">
                    {topMover.question}
                  </AlertDialogDescription>
                </div>
              </>
            )}
          </div>
          
          <div className="space-y-4">
            <div className="text-sm space-y-2">
              <div className="font-medium">WebSocket Debug Information</div>
              <div className="grid grid-cols-2 gap-2 text-xs bg-muted/50 p-2 rounded">
                <div>Token ID:</div>
                <div className="font-mono break-all">{selectedMarket?.clobTokenId}</div>
                <div>Market ID:</div>
                <div className="font-mono break-all">{topMover?.market_id}</div>
                <div>User Balance:</div>
                <div>{userBalance !== null ? `$${userBalance}` : 'Loading...'}</div>
                <div>WebSocket URL:</div>
                <div className="font-mono break-all text-[10px]">
                  {getWebSocketUrl(selectedMarket?.clobTokenId)}
                </div>
              </div>
            </div>
            
            <div className="text-sm font-medium">
              Basic WebSocket Test
            </div>
            
            <RawOrderBookData 
              clobTokenId={selectedMarket?.clobTokenId}
              isClosing={isClosing}
            />
            
            <div className="text-xs text-muted-foreground mt-4">
              This is a basic WebSocket test showing raw connection data.
              <br />
              All received messages will be displayed above.
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
