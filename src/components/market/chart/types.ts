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