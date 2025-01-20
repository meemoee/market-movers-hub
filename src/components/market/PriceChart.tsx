import { useMemo, useCallback } from 'react';
import { ParentSize } from '@visx/responsive';
import { scaleTime, scaleLinear } from '@visx/scale';
import { LinePath } from '@visx/shape';
import { useTooltip } from '@visx/tooltip';
import { localPoint } from '@visx/event';
import { LinearGradient } from '@visx/gradient';
import { bisector } from 'd3-array';
import { curveStepAfter } from '@visx/curve';
import { ChartSegment } from './chart/ChartSegment';
import { EventMarkers } from './chart/EventMarkers';
import { useChartData } from './chart/useChartData';
import { ChartTooltip } from './chart/ChartTooltip';
import { ChartAxes } from './chart/ChartAxes';
import type { PriceData, MarketEvent } from './chart/types';

const intervals = [
  { label: '1D', value: '1d' },
  { label: '1W', value: '1w' },
  { label: '1M', value: '1m' },
  { label: '3M', value: '3m' },
  { label: 'ALL', value: 'all' }
];

const bisectDate = bisector<PriceData, number>((d) => d.time).left;

interface ChartProps {
  data: PriceData[];
  events: MarketEvent[];
  width: number;
  height: number;
  margin?: { top: number; right: number; bottom: number; left: number };
}

function Chart({ 
  data, 
  events,
  width, 
  height, 
  margin = { top: 20, right: 30, bottom: 30, left: 40 } 
}: ChartProps) {
  const {
    showTooltip,
    hideTooltip,
    tooltipData,
    tooltipLeft = 0,
    tooltipTop = 0,
  } = useTooltip<PriceData>();

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const timeScale = useMemo(
    () =>
      scaleTime<number>({
        range: [0, innerWidth],
        domain: [
          Math.min(...data.map((d) => d.time)),
          Math.max(...data.map((d) => d.time)),
        ],
      }),
    [innerWidth, data]
  );

  const priceScale = useMemo(
    () =>
      scaleLinear<number>({
        range: [innerHeight, 0],
        domain: [0, 100],
        nice: true,
      }),
    [innerHeight]
  );

  const { segments } = useChartData(data);

  const handleTooltip = useCallback(
    (event: React.TouchEvent<SVGRectElement> | React.MouseEvent<SVGRectElement>) => {
      const { x } = localPoint(event) || { x: 0 };
      const xValue = timeScale.invert(x - margin.left);
      const index = bisectDate(data, xValue.getTime());
      
      if (index >= data.length || index < 0) return;
      
      const d0 = data[Math.max(0, index - 1)];
      const d1 = data[Math.min(data.length - 1, index)];
      
      if (!d0 || !d1) return;
      
      const d = xValue.getTime() - d0.time > d1.time - xValue.getTime() ? d1 : d0;

      showTooltip({
        tooltipData: d,
        tooltipLeft: timeScale(d.time) + margin.left,
        tooltipTop: priceScale(d.price) + margin.top,
      });
    },
    [timeScale, priceScale, data, margin, showTooltip]
  );

  return (
    <div className="relative">
      <svg width={width} height={height}>
        <defs>
          <LinearGradient
            id="above-gradient"
            from="rgba(21, 128, 61, 0.05)"
            to="rgba(21, 128, 61, 0.05)"
          />
          <LinearGradient
            id="below-gradient"
            from="rgba(153, 27, 27, 0.05)"
            to="rgba(153, 27, 27, 0.05)"
          />
        </defs>

        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* 50% reference line */}
          <line
            x1={0}
            x2={innerWidth}
            y1={priceScale(50)}
            y2={priceScale(50)}
            stroke="#4a5568"
            strokeWidth={1}
          />

          {/* Render segments */}
          {segments.map((segment, i) => (
            <ChartSegment
              key={i}
              segment={segment}
              timeScale={timeScale}
              priceScale={priceScale}
            />
          ))}

          {/* Price line */}
          <LinePath
            data={data}
            x={d => timeScale(d.time)}
            y={d => priceScale(d.price)}
            stroke="#3b82f6"
            strokeWidth={2}
            curve={curveStepAfter}
          />

          <ChartAxes
            timeScale={timeScale}
            priceScale={priceScale}
            innerHeight={innerHeight}
          />

          {/* Event markers */}
          <EventMarkers
            events={events}
            timeScale={timeScale}
            height={innerHeight}
          />

          {/* Price tooltip line */}
          {tooltipData && (
            <g>
              <line
                x1={timeScale(tooltipData.time)}
                x2={timeScale(tooltipData.time)}
                y1={0}
                y2={innerHeight}
                stroke="#4a5568"
                strokeWidth={1}
                pointerEvents="none"
              />
              <circle
                cx={timeScale(tooltipData.time)}
                cy={priceScale(tooltipData.price)}
                r={4}
                fill="#3b82f6"
                pointerEvents="none"
              />
            </g>
          )}

          {/* Price tooltip overlay */}
          <rect
            x={0}
            y={0}
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onTouchStart={handleTooltip}
            onTouchMove={handleTooltip}
            onMouseMove={handleTooltip}
            onMouseLeave={hideTooltip}
          />
        </g>
      </svg>

      <ChartTooltip
        tooltipData={tooltipData}
        tooltipLeft={tooltipLeft}
        tooltipTop={tooltipTop}
      />
    </div>
  );
}

interface PriceChartProps {
  data: PriceData[];
  events: MarketEvent[];
  selectedInterval: string;
  onIntervalSelect?: (interval: string) => void;
}

export default function PriceChart({ 
  data, 
  events,
  selectedInterval, 
  onIntervalSelect 
}: PriceChartProps) {
  const normalizedData = useMemo(() => 
    data.map(d => ({
      ...d,
      time: d.time * (d.time < 1e12 ? 1000 : 1)
    }))
  , [data]);

  return (
    <div>      
      <div className="h-[300px] w-full">
        <ParentSize>
          {({ width, height }) => (
            <Chart
              data={normalizedData}
              events={events}
              width={width}
              height={height}
            />
          )}
        </ParentSize>
      </div>
      
      <div className="flex justify-center gap-2 mt-4">
        {intervals.map((interval) => (
          <button
            key={interval.value}
            onClick={(e) => {
              e.stopPropagation();
              onIntervalSelect?.(interval.value);
            }}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors relative ${
              selectedInterval === interval.value
                ? 'text-white after:content-[""] after:absolute after:left-0 after:right-0 after:bottom-[-4px] after:h-[2px] after:bg-white/50'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            {interval.label}
          </button>
        ))}
      </div>
    </div>
  );
}