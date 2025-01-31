import { Card } from "@/components/ui/card";

interface MarketStatsBentoProps {
  selectedInterval: string;
}

export function MarketStatsBento({ selectedInterval }: MarketStatsBentoProps) {
  const stats = [
    { label: "Total Volume", value: "1,234,567" },
    { label: "Market Cap", value: "$12,345,678" },
    { label: "Price Change", value: "5%" },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
      {stats.map((stat, index) => (
        <Card key={index} className="p-4 backdrop-blur-md bg-black/30 border border-white/10">
          <h3 className="text-lg font-semibold">{stat.label}</h3>
          <p className="text-xl">{stat.value}</p>
        </Card>
      ))}
    </div>
  );
}
