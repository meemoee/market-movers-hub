import { Button } from "@/components/ui/button";

interface AccountBalanceProps {
  balance: number | null;
  onAddBalance: () => void;
  onRemoveBalance: () => void;
}

export function AccountBalance({ balance, onAddBalance, onRemoveBalance }: AccountBalanceProps) {
  return (
    <div className="space-y-3">
      <div className="bg-muted/20 rounded-lg p-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">Balance</h3>
        <p className="text-2xl font-bold">${balance?.toFixed(2) ?? '0.00'}</p>
      </div>

      <div className="flex gap-2">
        <Button 
          onClick={onAddBalance}
          className="flex-1 h-9 text-sm bg-primary/10 hover:bg-primary/20 text-primary border-primary/20"
          variant="outline"
        >
          Add $100
        </Button>
        <Button
          onClick={onRemoveBalance}
          className="flex-1 h-9 text-sm"
          variant="outline"
        >
          Remove $100
        </Button>
      </div>
    </div>
  );
}