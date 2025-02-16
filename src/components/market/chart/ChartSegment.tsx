
import * as React from 'react';
import { curveStepAfter } from '@visx/curve';
import { LinePath, AreaClosed } from '@visx/shape';
import type { ScaleTime, ScaleLinear } from 'd3-scale';
import { PriceData, FillSegment } from './types';

interface ChartSegmentProps {
  segment: FillSegment;
  timeScale: ScaleTime<number, number>;
  priceScale: ScaleLinear<number, number>;
}

export const ChartSegment = ({ segment, timeScale, priceScale }: ChartSegmentProps) => {
  // Define gradient IDs based on segment type
  const gradientId = segment.type === 'above' ? 'above-gradient' : 'below-gradient';
  
  // Calculate baseline value (50%)
  const baselineY = priceScale(50);

  return (
    <g>
      {/* Area fill */}
      <AreaClosed
        data={segment.data}
        x={d => timeScale(d.time)}
        y={d => priceScale(d.price)}
        yScale={priceScale}
        curve={curveStepAfter}
        fill={`url(#${gradientId})`}
        y0={baselineY}
      />
      
      {/* Line path */}
      <LinePath
        data={segment.data}
        x={d => timeScale(d.time)}
        y={d => priceScale(d.price)}
        stroke={segment.type === 'above' ? 'rgb(21, 128, 61)' : 'rgb(153, 27, 27)'}
        strokeWidth={1}
        curve={curveStepAfter}
      />
    </g>
  );
};
