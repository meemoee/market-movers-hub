export interface PriceData {
  time: number;
  price: number;
}

export interface ChartDimensions {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
}

export interface FillSegment {
  data: PriceData[];
  type: 'above' | 'below';
}

export interface MarketEvent {
  id: string;
  event_type: string;
  title: string;
  description?: string;
  timestamp: number;
  icon: string;
}