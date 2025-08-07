
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
import type { Holding } from '../account/AccountHoldings';

const intervals = [
  { label: '1D', value: '1d' },
  { label: '1W', value: '1w' },
  { label: '1M', value: '1m' },
  { label: '3M', value: '3m' },
  { label: 'ALL', value: 'all' }
];

const formatDate = timeFormat("%b %d");

interface ChartProps {
  dataSeries: PriceSeriesData[];
  events: MarketEvent[];
  width: number;
  height: number;
  margin?: { top: number; right: number; bottom: number; left: number };
}

function Chart({ 
  dataSeries, 
  events,
  width, 
  height, 
  margin = { top: 20, right: 30, bottom: 30, left: 40 } 
}: ChartProps) {
  // Use the first series as the primary data for scales and segments
  const primaryData = dataSeries && dataSeries.length > 0 ? dataSeries[0].data : [];
  // Define a type for our tooltip data
  interface PricePoint {
    seriesId: string;
    price: number;
    color: string;
    name: string;
    isCumulativePnL?: boolean;
  }
  
  interface TooltipData {
    time: number;
    prices: PricePoint[];
  }

  const {
    showTooltip,
    hideTooltip,
    tooltipData,
    tooltipLeft = 0,
    tooltipTop = 0,
  } = useTooltip<TooltipData>();

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Get all time points from all series for the time scale domain
  const allTimePoints = useMemo(() => {
    const points: number[] = [];
    if (dataSeries && Array.isArray(dataSeries)) {
      dataSeries.forEach(series => {
        if (series.data && Array.isArray(series.data)) {
          series.data.forEach(point => {
            points.push(point.time);
          });
        }
      });
    }
    return points;
  }, [dataSeries]);

  const timeScale = useMemo(
    () =>
      scaleTime<number>({
        range: [0, innerWidth],
        domain: allTimePoints.length > 0 ? 
          [Math.min(...allTimePoints), Math.max(...allTimePoints)] : 
          [new Date().getTime() - 86400000, new Date().getTime()], // Default to last 24h if no data
      }),
    [innerWidth, allTimePoints]
  );

  const priceScale = useMemo(
    () =>
      scaleLinear<number>({
        range: [innerHeight, 0],
        domain: [0, 100],
      }),
    [innerHeight]
  );

  const { segments } = useChartData(primaryData);

  // Get interpolated prices for all series at a given x position
  const getInterpolatedPrices = useCallback((xValue: number) => {
    const time = timeScale.invert(xValue).getTime();
    const prices: PricePoint[] = [];

    if (dataSeries && Array.isArray(dataSeries)) {
      dataSeries.forEach(series => {
        if (!series.data || series.data.length === 0) return;

        let leftIndex = 0;
        // Find the closest point to the left of the cursor
        for (let i = 0; i < series.data.length - 1; i++) {
          if (series.data[i].time <= time && series.data[i + 1].time > time) {
            leftIndex = i;
            break;
          }
        }

        // If we're past the last point, use the last point
        if (time > series.data[series.data.length - 1].time) {
          leftIndex = series.data.length - 1;
        }

        prices.push({
          seriesId: series.id,
          price: series.data[leftIndex].price,
          color: series.color,
          name: series.name,
          isCumulativePnL: series.isCumulativePnL
        });
      });
    }

    return {
      time,
      prices
    };
  }, [dataSeries, timeScale]);

  const handleTooltip = useCallback(
    (event: React.TouchEvent<SVGRectElement> | React.MouseEvent<SVGRectElement>) => {
      const { x } = localPoint(event) || { x: 0 };
      const xValue = x - margin.left;

      if (xValue < 0 || xValue > innerWidth) return;

      const interpolatedData = getInterpolatedPrices(xValue);
      
      // Use the first price for positioning if available
      const firstPrice = interpolatedData.prices[0]?.price ?? 50;

      showTooltip({
        tooltipData: interpolatedData,
        tooltipLeft: x,
        tooltipTop: priceScale(firstPrice) + margin.top,
      });
    },
    [priceScale, margin, showTooltip, innerWidth, getInterpolatedPrices]
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

  // Calculate dynamic tick values based on the price scale domain
  const tickValues = useMemo(() => {
    const [minPrice, maxPrice] = priceScale.domain();
    const range = maxPrice - minPrice;
    const step = range / 4; // Create 5 tick marks
    return [
      Math.round(minPrice),
      Math.round(minPrice + step),
      Math.round(minPrice + 2 * step),
      Math.round(minPrice + 3 * step),
      Math.round(maxPrice)
    ];
  }, [priceScale]);

  // Safely handle rendering when dataSeries is undefined or empty
  const safeDataSeries = dataSeries || [];

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

            {/* Render each data series as a separate line */}
            {safeDataSeries.map(series => (
              <LinePath
                key={series.id}
                data={series.data || []}
                x={d => timeScale(d.time)}
                y={d => priceScale(d.price)}
                stroke={series.color}
                strokeWidth={series.isCumulativePnL ? 2.5 : 2}
                curve={curveStepAfter}
              />
            ))}

            {/* Event markers - lines on bottom layer */}
            <g>
              <EventMarkers
                events={events || []}
                timeScale={timeScale}
                height={innerHeight}
              />
            </g>

            <AxisLeft
              scale={priceScale}
              tickValues={tickValues}
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
                events={events || []}
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
                {tooltipData.prices.map(price => (
                  <circle
                    key={price.seriesId}
                    cx={tooltipLeft - margin.left}
                    cy={priceScale(price.price)}
                    r={4}
                    fill={price.color}
                  />
                ))}
              </g>
            )}
          </g>
        </g>
      </svg>

      {/* Price tooltip overlay */}
      {tooltipData && tooltipData.prices.length > 0 && (
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
            <span className="mb-1">{tooltipDateFormat(new Date(tooltipData.time))}</span>
            {tooltipData.prices.map(price => (
              <div key={price.seriesId} className="flex items-center gap-1">
                <div 
                  className="w-2 h-2 rounded-full" 
                  style={{ backgroundColor: price.color }}
                ></div>
                {price.isCumulativePnL ? (
                  <span className={`font-medium ${price.price > 50 ? 'text-green-400' : price.price < 50 ? 'text-red-400' : ''}`}>
                    PnL: {((price.price - 50) > 0 ? '+' : '')}{(price.price - 50).toFixed(2)}%
                  </span>
                ) : (
                  <span>{price.price.toFixed(2)}%</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface PriceSeriesData {
  id: string;
  name: string;
  color: string;
  data: PriceData[];
  isCumulativePnL?: boolean;
    holding?: Holding;
}

interface PriceChartProps {
  dataSeries?: PriceSeriesData[];
  events?: MarketEvent[];
  selectedInterval: string;
  onIntervalSelect?: (interval: string) => void;
}

export default function PriceChart({ 
  dataSeries = [], 
  events = [],
  selectedInterval, 
  onIntervalSelect 
}: PriceChartProps) {
  // For backward compatibility, if dataSeries is empty, use an empty array
  const normalizedDataSeries = useMemo(() => {
    if (!dataSeries || !Array.isArray(dataSeries)) return [];
    
    return dataSeries.map(series => ({
      ...series,
      data: (series.data || []).map(d => ({
        ...d,
        time: d.time * (d.time < 1e12 ? 1000 : 1)
      }))
    }));
  }, [dataSeries]);

  // If we have no data series, show an empty chart
  const isEmpty = normalizedDataSeries.length === 0 || 
    normalizedDataSeries.every(series => series.data.length === 0);

  // If we have only one series, use it as the primary data
  const primaryData = normalizedDataSeries.length === 1 
    ? normalizedDataSeries[0].data 
    : normalizedDataSeries.length > 1 
      ? normalizedDataSeries[0].data 
      : [];

  return (
    <div>      
      <div className="h-[300px] w-full">
        <ParentSize>
          {({ width, height }) => (
            <Chart
              dataSeries={normalizedDataSeries}
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
