import { useMemo, useCallback } from 'react';
import { ParentSize } from '@visx/responsive';
import { scaleTime, scaleLinear } from '@visx/scale';
import { LinePath } from '@visx/shape';
import { useTooltip } from '@visx/tooltip';
import { localPoint } from '@visx/event';
import { LinearGradient } from '@visx/gradient';
import { timeFormat } from 'd3-time-format';
import { curveStepAfter } from '@visx/curve';
import { AxisLeft, AxisBottom } from '@visx/axis';
import { ChartSegment } from './chart/ChartSegment';
import { EventMarkers } from './chart/EventMarkers';
import { useChartData } from './chart/useChartData';
import type { PriceData, MarketEvent } from './chart/types';

const intervals = [
  { label: '1D', value: '1d' },
  { label: '1W', value: '1w' },
  { label: '1M', value: '1m' },
  { label: '3M', value: '3m' },
  { label: 'ALL', value: 'all' }
];

const formatDate = timeFormat("%b %d");

interface ChartProps {
  data: PriceData[];
  events: MarketEvent[];
  width: number;
  height: number;
  margin?: { top: number; right: number; bottom: number; left: number };
}

return (
    <div className="relative">
      <svg 
        width={width} 
        height={height} 
        style={{ overflow: 'visible' }}
      >
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
          {/* Price tooltip overlay - MOVED TO BOTTOM */}
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
            className="pointer-events-auto"
          />

          {/* Base chart elements */}
          <g className="pointer-events-none">
            <line
              x1={0}
              x2={innerWidth}
              y1={priceScale(50)}
              y2={priceScale(50)}
              stroke="#4a5568"
              strokeWidth={1}
            />

            {segments.map((segment, i) => (
              <ChartSegment
                key={i}
                segment={segment}
                timeScale={timeScale}
                priceScale={priceScale}
              />
            ))}

            <LinePath
              data={data}
              x={d => timeScale(d.time)}
              y={d => priceScale(d.price)}
              stroke="#3b82f6"
              strokeWidth={2}
              curve={curveStepAfter}
            />

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
          </g>

          {/* Event markers - ON TOP with pointer events */}
          <g style={{ pointerEvents: 'none' }} className="z-10">
            <EventMarkers
              events={events}
              timeScale={timeScale}
              height={innerHeight}
            />
          </g>

          {/* Price tooltip elements - MOVED TO TOP */}
          {tooltipData && (
            <g className="pointer-events-none">
              <line
                x1={tooltipLeft - margin.left}
                x2={tooltipLeft - margin.left}
                y1={0}
                y2={innerHeight}
                stroke="#4a5568"
                strokeWidth={1}
              />
              <circle
                cx={tooltipLeft - margin.left}
                cy={priceScale(tooltipData.price)}
                r={4}
                fill="#3b82f6"
              />
            </g>
          )}
        </g>
      </svg>

      {/* Price tooltip overlay */}
      {tooltipData && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: tooltipTop - 25,
            left: tooltipLeft + 15,
            background: 'rgba(17, 24, 39, 0.9)',
            padding: '4px 8px',
            borderRadius: '4px',
            color: 'white',
            fontSize: '11px',
            whiteSpace: 'nowrap',
          }}
        >
          <div className="flex flex-col leading-tight">
            <span>{tooltipDateFormat.format(tooltipData.time)}</span>
            <span>{tooltipData.price.toFixed(2)}%</span>
          </div>
        </div>
      )}
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
