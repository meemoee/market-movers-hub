import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { useToast } from '../ui/use-toast';
import { orderManager, OrderSide } from '@/services/OrderManager';
import { useUser } from '@supabase/auth-helpers-react';
import { Loader2 } from 'lucide-react';

interface TransactionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  market: {
    id: string;
    question: string;
    final_best_ask?: number;
    final_best_bid?: number;
  };
  action: 'buy' | 'sell';
  clobTokenId: string;
}

export function TransactionDialog({
  isOpen,
  onClose,
  market,
  action,
  clobTokenId
}: TransactionDialogProps) {
  const [amount, setAmount] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const user = useUser();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to place orders",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const size = parseFloat(amount);
      if (isNaN(size) || size <= 0) {
        throw new Error('Invalid amount');
      }

      const result = await orderManager.executeMarketOrder(
        user.id,
        market.id,
        clobTokenId,
        "Yes",
        action === 'buy' ? OrderSide.BUY : OrderSide.SELL,
        size
      );

      toast({
        title: "Order executed successfully",
        description: `Filled ${result.filledSize} at average price ${result.avgPrice.toFixed(3)}`,
      });

      onClose();
    } catch (error) {
      toast({
        title: "Order execution failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {action === 'buy' ? 'Buy' : 'Sell'} {market.question}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Amount
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="Enter amount"
              step="0.01"
              min="0"
              required
            />
          </div>

          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Best Ask: {market.final_best_ask?.toFixed(3) || 'N/A'}</span>
            <span>Best Bid: {market.final_best_bid?.toFixed(3) || 'N/A'}</span>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting || !amount}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Executing Order...
              </>
            ) : (
              `Confirm ${action}`
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}