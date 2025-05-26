import { Button } from "@/components/ui/button";

interface AccountBalanceProps {
  balance: number | null;
  onAddBalance: () => void;
  onRemoveBalance: () => void;
}

export function AccountBalance({ balance, onAddBalance, onRemoveBalance }: AccountBalanceProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Balance</h3>
        <p className="text-2xl font-bold">${balance?.toFixed(2) ?? '0.00'}</p>
      </div>

      <div className="space-y-2">
        <Button 
          onClick={onAddBalance}
          className="w-full"
          variant="outline"
        >
          Add $100
        </Button>
        <Button
          onClick={onRemoveBalance}
          className="w-full"
          variant="outline"
        >
          Remove $100
        </Button>
      </div>
    </div>
  );
}