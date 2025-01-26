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

interface PriceChartProps {
  marketId: string;
  data: PriceData[];
  events: MarketEvent[];
  selectedInterval: string;
  onIntervalSelect?: (interval: string) => void;
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

  const getInterpolatedPrice = useCallback((xValue: number) => {
    const time = timeScale.invert(xValue).getTime();
    let leftIndex = 0;

    for (let i = 0; i < data.length - 1; i++) {
      if (data[i].time <= time && data[i + 1].time > time) {
        leftIndex = i;
        break;
      }
    }

    return {
      time,
      price: data[leftIndex].price
    };
  }, [data, timeScale]);

  const handleTooltip = useCallback(
    (event: React.TouchEvent<SVGRectElement> | React.MouseEvent<SVGRectElement>) => {
      const { x } = localPoint(event) || { x: 0 };
      const xValue = x - margin.left;
      
      if (xValue < 0 || xValue > innerWidth) return;
      
      const interpolatedPoint = getInterpolatedPrice(xValue);

      showTooltip({
        tooltipData: interpolatedPoint,
        tooltipLeft: x,
        tooltipTop: priceScale(interpolatedPoint.price) + margin.top,
      });
    },
    [timeScale, priceScale, data, margin, showTooltip, innerWidth, getInterpolatedPrice]
  );

  const tooltipDateFormat = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return formatter.format.bind(formatter);
  }, []);

  const isLeftHalf = tooltipLeft < width / 2;

  return (
    <div className="relative touch-pan-y overscroll-none">
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        <defs>
          <LinearGradient id="above-gradient" from="rgba(21, 128, 61, 0.05)" to="rgba(21, 128, 61, 0.05)" />
          <LinearGradient id="below-gradient" from="rgba(153, 27, 27, 0.05)" to="rgba(153, 27, 27, 0.05)" />
        </defs>

        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Base layer - price line, segments, etc. */}
          <g>
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

            {/* Event markers - lines on bottom layer */}
            <g>
              <EventMarkers
                events={events}
                timeScale={timeScale}
                height={innerHeight}
              />
            </g>

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

          {/* Interactive layers */}
          <g>
            {/* Main price tracking area */}
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
              style={{ pointerEvents: 'all' }}
            />

            {/* Interactive event markers icons - must be on top */}
            <g>
              <EventMarkers
                events={events}
                timeScale={timeScale}
                height={innerHeight}
                iconsOnly
              />
            </g>

            {/* Price tooltip indicators - always on top */}
            {tooltipData && (
              <g style={{ pointerEvents: 'none' }}>
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
        </g>
      </svg>

      {/* Price tooltip overlay */}
      {tooltipData && (
        <div
          style={{
            position: 'absolute',
            top: tooltipTop - 25,
            left: isLeftHalf ? tooltipLeft + 15 : tooltipLeft - 15,
            transform: isLeftHalf ? 'none' : 'translateX(-100%)',
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
            <span>{tooltipDateFormat(new Date(tooltipData.time))}</span>
            <span>{tooltipData.price.toFixed(2)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PriceChart({ 
  marketId,
  data = [], 
  events = [],
  selectedInterval = '1d', 
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
