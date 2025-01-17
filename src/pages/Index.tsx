import { useState } from 'react';
import Header from "@/components/Header";
import LeftSidebar from "@/components/LeftSidebar";
import RightSidebar from "@/components/RightSidebar";
import TopMoversList from "@/components/TopMoversList";

// Demo data
const DEMO_MARKETS = [
  { id: 1, title: "Will Bitcoin reach $100k in 2024?", price: 0.65, change: 0.12, volume: 1250, market_id: "1", question: "Will Bitcoin reach $100k in 2024?", image: "/placeholder.svg", final_last_traded_price: 0.65, price_change: 0.12, volume_change: 100, volume_change_percentage: 8, url: "https://polymarket.com", final_best_ask: 0.66, final_best_bid: 0.64 },
  { id: 2, title: "Will SpaceX launch Starship successfully?", price: 0.78, change: -0.05, volume: 890, market_id: "2", question: "Will SpaceX launch Starship successfully?", image: "/placeholder.svg", final_last_traded_price: 0.78, price_change: -0.05, volume_change: -50, volume_change_percentage: -5, url: "https://kalshi.com", final_best_ask: 0.79, final_best_bid: 0.77 },
  { id: 3, title: "Will Taylor Swift win Album of the Year?", price: 0.92, change: 0.08, volume: 2100, market_id: "3", question: "Will Taylor Swift win Album of the Year?", image: "/placeholder.svg", final_last_traded_price: 0.92, price_change: 0.08, volume_change: 200, volume_change_percentage: 10, url: "https://polymarket.com", final_best_ask: 0.93, final_best_bid: 0.91 },
  { id: 4, title: "Will AI surpass human intelligence by 2030?", price: 0.45, change: -0.15, volume: 1500, market_id: "4", question: "Will AI surpass human intelligence by 2030?", image: "/placeholder.svg", final_last_traded_price: 0.45, price_change: -0.15, volume_change: -150, volume_change_percentage: -9, url: "https://kalshi.com", final_best_ask: 0.46, final_best_bid: 0.44 },
  { id: 5, title: "Will there be a recession in 2024?", price: 0.33, change: 0.03, volume: 1800, market_id: "5", question: "Will there be a recession in 2024?", image: "/placeholder.svg", final_last_traded_price: 0.33, price_change: 0.03, volume_change: 80, volume_change_percentage: 4, url: "https://polymarket.com", final_best_ask: 0.34, final_best_bid: 0.32 },
];

const TIME_INTERVALS = [
  { label: "1 hour", value: "1h" },
  { label: "24 hours", value: "24h" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
] as const;

export default function Index() {
  const [markets] = useState(DEMO_MARKETS);
  const [selectedInterval, setSelectedInterval] = useState<string>("24h");
  const [openMarketsOnly, setOpenMarketsOnly] = useState(true);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <LeftSidebar />
      
      <main className="pt-20 px-4 lg:pl-[320px] lg:pr-[420px]">
        <div className="max-w-4xl mx-auto space-y-6">
          <TopMoversList
            topMovers={markets}
            error={null}
            timeIntervals={TIME_INTERVALS}
            selectedInterval={selectedInterval}
            onIntervalChange={setSelectedInterval}
            onLoadMore={() => {}}
            hasMore={false}
            openMarketsOnly={openMarketsOnly}
            onOpenMarketsChange={setOpenMarketsOnly}
            isLoading={false}
          />
        </div>
      </main>

      <RightSidebar />
    </div>
  );
}
