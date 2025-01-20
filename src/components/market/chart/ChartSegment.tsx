import { Area } from '@visx/shape';
import { curveStepAfter } from '@visx/curve';
import { ScaleTime, ScaleLinear } from '@visx/scale';
import { FillSegment } from './types';

interface ChartSegmentProps {
  segment: FillSegment;
  timeScale: ScaleTime<number>;
  priceScale: ScaleLinear<number>;
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