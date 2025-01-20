import { useEffect, useState } from 'react';
import { OrderBook } from './OrderBook';
import { Button } from '../ui/button';
import { Sheet, SheetContent } from '../ui/sheet';

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
  const [balancePercentage, setBalancePercentage] = useState(1); // 1% default
  const [takeProfitEnabled, setTakeProfitEnabled] = useState(false);
  const [stopLossEnabled, setStopLossEnabled] = useState(false);
  const [takeProfitPrice, setTakeProfitPrice] = useState(0.75);
  const [stopLossPrice, setStopLossPrice] = useState(0.25);

  // Color interpolation helper
  const interpolateColor = (percentage: number): string => {
    const colors = [
      { point: 0, color: '#1B5E20' },   // Deep Green
      { point: 15, color: '#4CAF50' },  // Light Green
      { point: 30, color: '#FFC107' },  // Yellow
      { point: 45, color: '#FF9800' },  // Light Orange
      { point: 60, color: '#F44336' }   // Red
    ];
    
    let startColor = colors[0];
    let endColor = colors[colors.length - 1];
    
    for (let i = 0; i < colors.length - 1; i++) {
      if (percentage >= colors[i].point && percentage <= colors[i + 1].point) {
        startColor = colors[i];
        endColor = colors[i + 1];
        break;
      }
    }
    
    const range = endColor.point - startColor.point;
    const factor = range === 0 ? 1 : (percentage - startColor.point) / range;
    
    const start = {
      r: parseInt(startColor.color.slice(1, 3), 16),
      g: parseInt(startColor.color.slice(3, 5), 16),
      b: parseInt(startColor.color.slice(5, 7), 16)
    };
    
    const end = {
      r: parseInt(endColor.color.slice(1, 3), 16),
      g: parseInt(endColor.color.slice(3, 5), 16),
      b: parseInt(endColor.color.slice(5, 7), 16)
    };
    
    const r = Math.round(start.r + (end.r - start.r) * factor);
    const g = Math.round(start.g + (end.g - start.g) * factor);
    const b = Math.round(start.b + (end.b - start.b) * factor);
    
    return `rgb(${r}, ${g}, ${b})`;
  };

  const price = selectedMarket?.action === 'buy' 
    ? orderBookData?.best_ask || 0 
    : orderBookData?.best_bid || 0;

  const totalCost = Number(amount) * price;

  return (
    <Sheet open={!!selectedMarket} onOpenChange={() => onClose()}>
      <SheetContent className="bg-[#1a1b1e] border-none">
        <div className="space-y-6">
          {selectedMarket && (
            <>
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-gray-800 rounded-lg" />
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Button
                      variant={selectedMarket.action === 'buy' ? 'default' : 'outline'}
                      className={selectedMarket.action === 'buy' ? 'bg-green-600' : ''}
                      size="sm"
                    >
                      Buy
                    </Button>
                    <Button
                      variant={selectedMarket.action === 'sell' ? 'default' : 'outline'}
                      className={selectedMarket.action === 'sell' ? 'bg-red-600' : ''}
                      size="sm"
                    >
                      Sell
                    </Button>
                  </div>
                  <h3 className="font-bold text-xl">Market Order</h3>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400">Balance Percentage</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={balancePercentage}
                    onChange={(e) => setBalancePercentage(Number(e.target.value))}
                    className="w-full h-2 bg-[#2a2b2e] rounded-lg appearance-none cursor-pointer mt-2"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                  <div className="text-sm mt-2 text-center" style={{ color: interpolateColor(balancePercentage) }}>
                    Using {balancePercentage}% of balance
                  </div>
                </div>

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
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
