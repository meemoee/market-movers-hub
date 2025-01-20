import { Area } from '@visx/shape';
import { curveStepAfter } from '@visx/curve';
import { ScaleInput } from '@visx/scale';
import { FillSegment } from './types';

interface ChartSegmentProps {
  segment: FillSegment;
  timeScale: (n: ScaleInput<number>) => number;
  priceScale: (n: ScaleInput<number>) => number;
}

export const ChartSegment = ({ segment, timeScale, priceScale }: ChartSegmentProps) => {
  return (
    <Area
      data={segment.data}
      x={d => timeScale(d.time)}
      y={d => priceScale(d.price)}
      y1={() => priceScale(50)}
      curve={curveStepAfter}
      fill={`url(#${segment.type}-gradient)`}
    />
  );
};