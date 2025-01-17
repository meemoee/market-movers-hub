import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";

interface OrderBookDisplayProps {
  bids: Record<string, number>;
  asks: Record<string, number>;
  best_bid: number;
  best_ask: number;
  spread: number;
}

export function OrderBookDisplay({ bids, asks, best_bid, best_ask, spread }: OrderBookDisplayProps) {
  const formatPrice = (price: number | string) => `${(Number(price) * 100).toFixed(2)}¢`;
  const formatSize = (size: number) => size.toFixed(2);

  const sortedBids = Object.entries(bids)
    .sort(([a], [b]) => parseFloat(b) - parseFloat(a));
  
  const sortedAsks = Object.entries(asks)
    .sort(([a], [b]) => parseFloat(a) - parseFloat(b));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4 mb-4">
        <Card className="p-3">
          <p className="text-sm text-muted-foreground">Best Bid</p>
          <p className="text-lg font-medium text-green-500">
            {formatPrice(best_bid)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-sm text-muted-foreground">Best Ask</p>
          <p className="text-lg font-medium text-red-500">
            {formatPrice(best_ask)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-sm text-muted-foreground">Spread</p>
          <p className="text-lg font-medium">
            {formatPrice(spread)}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm font-medium mb-2">Bids</h4>
          <ScrollArea className="h-[200px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Price</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedBids.map(([price, size]) => (
                  <TableRow key={price}>
                    <TableCell className="text-green-500">{formatPrice(price)}</TableCell>
                    <TableCell className="text-right">{formatSize(size)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">Asks</h4>
          <ScrollArea className="h-[200px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Price</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAsks.map(([price, size]) => (
                  <TableRow key={price}>
                    <TableCell className="text-red-500">{formatPrice(price)}</TableCell>
                    <TableCell className="text-right">{formatSize(size)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}