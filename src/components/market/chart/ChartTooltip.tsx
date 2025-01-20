import { useTooltip } from '@visx/tooltip';
import { PriceData } from './types';

interface ChartTooltipProps {
  tooltipData?: PriceData;
  tooltipLeft?: number;
  tooltipTop?: number;
}

export function ChartTooltip({ tooltipData, tooltipLeft, tooltipTop }: ChartTooltipProps) {
  if (!tooltipData) return null;

  const tooltipDateFormat = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return (
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
  );
}