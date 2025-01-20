import { AxisLeft, AxisBottom } from '@visx/axis';
import { ScaleLinear, ScaleTime } from '@visx/scale';
import { timeFormat } from 'd3-time-format';

const formatDate = timeFormat("%b %d");

interface ChartAxesProps {
  timeScale: ScaleTime<number, number>;
  priceScale: ScaleLinear<number, number>;
  innerHeight: number;
}

export function ChartAxes({ timeScale, priceScale, innerHeight }: ChartAxesProps) {
  return (
    <>
      <AxisLeft
        scale={priceScale}
        tickValues={[0, 25, 50, 75, 100]}
        tickFormat={(value) => `${value}`}
        stroke="#4a5568"
        tickStroke="#4a5568"
        tickLength={0}
        hideTicks
        tickLabelProps={() => ({
          fill: '#9ca3af',
          fontSize: 11,
          textAnchor: 'end',
          dy: '0.33em',
          dx: '-0.5em',
        })}
      />
      <AxisBottom
        top={innerHeight}
        scale={timeScale}
        stroke="#4a5568"
        tickStroke="#4a5568"
        tickLength={0}
        hideTicks
        numTicks={6}
        tickFormat={(value) => formatDate(new Date(+value))}
        tickLabelProps={() => ({
          fill: '#9ca3af',
          fontSize: 11,
          textAnchor: 'middle',
          dy: '1em',
        })}
      />
    </>
  );
}