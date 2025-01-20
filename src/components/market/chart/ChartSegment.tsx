import { Area } from '@visx/shape';
import { curveStepAfter } from '@visx/curve';
import { ScaleLinear, ScaleTime } from '@visx/scale';
import { FillSegment } from './types';

interface ChartSegmentProps {
  segment: FillSegment;
  timeScale: ScaleTime<number, number>;
  priceScale: ScaleLinear<number, number>;
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