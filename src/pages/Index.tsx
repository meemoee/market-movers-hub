import { useState, useEffect } from "react";
import Header from "@/components/Header";
import LeftSidebar from "@/components/LeftSidebar";
import MarketMoverCard from "@/components/MarketMoverCard";

// Demo data
const DEMO_MARKETS = [
  { id: 1, title: "Will Bitcoin reach $100k in 2024?", price: 0.65, change: 0.12, volume: 1250 },
  { id: 2, title: "Will SpaceX launch Starship successfully?", price: 0.78, change: -0.05, volume: 890 },
  { id: 3, title: "Will Taylor Swift win Album of the Year?", price: 0.92, change: 0.08, volume: 2100 },
  { id: 4, title: "Will AI surpass human intelligence by 2030?", price: 0.45, change: -0.15, volume: 1500 },
  { id: 5, title: "Will there be a recession in 2024?", price: 0.33, change: 0.03, volume: 1800 },
];

export default function Index() {
  const [markets, setMarkets] = useState(DEMO_MARKETS);

  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setMarkets(prevMarkets => 
        prevMarkets.map(market => ({
          ...market,
          price: Math.max(0.01, Math.min(0.99, market.price + (Math.random() - 0.5) * 0.02)),
          change: (Math.random() - 0.5) * 0.2,
          volume: market.volume + Math.random() * 100
        }))
      );
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <LeftSidebar />
      
      <main className="pt-20 px-4 lg:pl-[320px]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-6">Top Market Movers</h2>
          
          <div className="grid gap-4 sm:grid-cols-2">
            {markets.map(market => (
              <MarketMoverCard
                key={market.id}
                title={market.title}
                price={market.price}
                change={market.change}
                volume={market.volume}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}