import { useMemo, useCallback } from 'react';
import { ParentSize } from '@visx/responsive';
import { scaleTime, scaleLinear } from '@visx/scale';
import { LinePath } from '@visx/shape';
import { useTooltip } from '@visx/tooltip';
import { localPoint } from '@visx/event';
import { LinearGradient } from '@visx/gradient';
import { bisector } from 'd3-array';
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

const bisectDate = bisector<PriceData, number>((d) => d.time).left;
const formatDate = timeFormat("%b %d");

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

  const tooltipDateFormat = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }, []);

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

          {/* Event markers */}
          <EventMarkers
            events={events}
            timeScale={timeScale}
            height={innerHeight}
          />

          {/* Price line */}
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

          {/* Tooltip overlay */}
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
        </g>
      </svg>

      {tooltipData && (
        <div
          style={{
            position: 'absolute',
            top: tooltipTop - 25,
            left: tooltipLeft + 15,
            background: 'rgba(17, 24, 39, 0.9)',
            padding: '4px 8px',
            borderRadius: '4px',
            color: 'white',
            fontSize: '11px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 100,
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