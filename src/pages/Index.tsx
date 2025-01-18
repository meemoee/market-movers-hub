import { useState } from 'react';
import Header from "@/components/Header";
import LeftSidebar from "@/components/LeftSidebar";
import RightSidebar from "@/components/RightSidebar";
import TopMoversList from "@/components/TopMoversList";

// Demo data
const DEMO_MARKETS = [
  { 
    market_id: "1", 
    question: "Will Bitcoin reach $100k in 2024?", 
    url: "https://polymarket.com",
    subtitle: "Bitcoin Price Prediction",
    yes_sub_title: "Yes, BTC will hit 100k",
    no_sub_title: "No, BTC won't hit 100k",
    description: "Will the price of Bitcoin reach or exceed $100,000 at any point during 2024?",
    clobtokenids: null,
    outcomes: null,
    active: true,
    closed: false,
    archived: false,
    image: "/placeholder.svg",
    event_id: "crypto-1",
    event_title: "Crypto Predictions",
    final_last_traded_price: 0.65,
    final_best_ask: 0.66,
    final_best_bid: 0.64,
    final_volume: 1250,
    initial_last_traded_price: 0.53,
    initial_volume: 1150,
    price_change: 0.12,
    volume_change: 100,
    volume_change_percentage: 8
  },
  { 
    market_id: "2", 
    question: "Will SpaceX launch Starship successfully?", 
    url: "https://kalshi.com",
    subtitle: "SpaceX Launch Prediction",
    yes_sub_title: "Yes, it will launch",
    no_sub_title: "No, it won't launch",
    description: "Will SpaceX successfully launch the Starship rocket?",
    clobtokenids: null,
    outcomes: null,
    active: true,
    closed: false,
    archived: false,
    image: "/placeholder.svg",
    event_id: "space-1",
    event_title: "Space Exploration",
    final_last_traded_price: 0.78,
    final_best_ask: 0.79,
    final_best_bid: 0.77,
    final_volume: 890,
    initial_last_traded_price: 0.75,
    initial_volume: 800,
    price_change: -0.05,
    volume_change: -50,
    volume_change_percentage: -5
  },
  { 
    market_id: "3", 
    question: "Will Taylor Swift win Album of the Year?", 
    url: "https://polymarket.com",
    subtitle: "Music Awards Prediction",
    yes_sub_title: "Yes, she will win",
    no_sub_title: "No, she won't win",
    description: "Will Taylor Swift win the Album of the Year award?",
    clobtokenids: null,
    outcomes: null,
    active: true,
    closed: false,
    archived: false,
    image: "/placeholder.svg",
    event_id: "music-1",
    event_title: "Music Awards",
    final_last_traded_price: 0.92,
    final_best_ask: 0.93,
    final_best_bid: 0.91,
    final_volume: 2100,
    initial_last_traded_price: 0.85,
    initial_volume: 2000,
    price_change: 0.08,
    volume_change: 200,
    volume_change_percentage: 10
  },
  { 
    market_id: "4", 
    question: "Will AI surpass human intelligence by 2030?", 
    url: "https://kalshi.com",
    subtitle: "AI Prediction",
    yes_sub_title: "Yes, it will surpass",
    no_sub_title: "No, it won't surpass",
    description: "Will artificial intelligence surpass human intelligence by the year 2030?",
    clobtokenids: null,
    outcomes: null,
    active: true,
    closed: false,
    archived: false,
    image: "/placeholder.svg",
    event_id: "ai-1",
    event_title: "AI Predictions",
    final_last_traded_price: 0.45,
    final_best_ask: 0.46,
    final_best_bid: 0.44,
    final_volume: 1500,
    initial_last_traded_price: 0.50,
    initial_volume: 1600,
    price_change: -0.15,
    volume_change: -150,
    volume_change_percentage: -9
  },
  { 
    market_id: "5", 
    question: "Will there be a recession in 2024?", 
    url: "https://polymarket.com",
    subtitle: "Economic Prediction",
    yes_sub_title: "Yes, there will be",
    no_sub_title: "No, there won't be",
    description: "Will there be a recession in the year 2024?",
    clobtokenids: null,
    outcomes: null,
    active: true,
    closed: false,
    archived: false,
    image: "/placeholder.svg",
    event_id: "economy-1",
    event_title: "Economic Predictions",
    final_last_traded_price: 0.33,
    final_best_ask: 0.34,
    final_best_bid: 0.32,
    final_volume: 1800,
    initial_last_traded_price: 0.30,
    initial_volume: 1700,
    price_change: 0.03,
    volume_change: 80,
    volume_change_percentage: 4
  },
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
