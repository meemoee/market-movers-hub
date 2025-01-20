import { useEffect, useState } from 'react';
import { OrderBook } from './OrderBook';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { LiveOrderBook } from './LiveOrderBook';
import { Loader2 } from 'lucide-react';

interface TransactionDialogProps {
  selectedMarket: { id: string; action: 'buy' | 'sell'; clobTokenId: string } | null;
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
  const [amount, setAmount] = useState('1');

  const price = selectedMarket?.action === 'buy' 
    ? orderBookData?.best_ask || 0 
    : orderBookData?.best_bid || 0;

  const totalCost = Number(amount) * price;

  return (
    <Dialog open={!!selectedMarket} onOpenChange={() => onClose()}>
      <DialogContent className="bg-[#1a1b1e] border-none max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogTitle className="text-xl font-bold">
          {selectedMarket?.action === 'buy' ? 'Buy' : 'Sell'} Order
        </DialogTitle>
        
        <div className="space-y-6">
          {selectedMarket && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-400">Amount</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full p-2 bg-[#2a2b2e] rounded mt-1 text-center"
                    min="0"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400">Price (%)</label>
                  <input
                    type="number"
                    value={(price * 100).toFixed(1)}
                    readOnly
                    className="w-full p-2 bg-[#2a2b2e] rounded mt-1 text-center"
                  />
                </div>
              </div>

              <div className="text-center">
                <div className="text-xl font-bold">
                  Total: ${totalCost.toFixed(2)}
                </div>
                <div className="text-sm text-gray-400 mt-1">
                  MARKET ORDER
                </div>
              </div>

              {!isOrderBookLoading && (
                <OrderBook marketId={selectedMarket.id} />
              )}

              <LiveOrderBook
                onOrderBookData={onOrderBookData}
                isLoading={isOrderBookLoading}
                clobTokenId={selectedMarket.clobTokenId}
              />

              <div className="flex gap-4">
                <Button
                  onClick={onConfirm}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  Confirm
                </Button>
                <Button
                  onClick={onClose}
                  variant="destructive"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}