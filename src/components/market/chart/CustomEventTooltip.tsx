import { cn } from "@/lib/utils";

interface CustomEventTooltipProps {
  title: string;
  description?: string;
  isVisible: boolean;
  x: number;
  y: number;
}

export const CustomEventTooltip = ({
  title,
  description,
  isVisible,
  x,
  y,
}: CustomEventTooltipProps) => {
  if (!isVisible) return null;

  return (
    <div
      className={cn(
        "absolute z-50 min-w-[200px] max-w-[240px] rounded-lg border border-border/50",
        "bg-background/95 px-3 py-2 shadow-xl backdrop-blur-sm"
      )}
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translate(-50%, -100%)',
        marginTop: '-8px',
      }}
    >
      <div className="space-y-1">
        <p className="font-medium text-sm">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div 
        className="absolute left-1/2 bottom-0 h-2 w-2 -translate-x-1/2 translate-y-1/2 rotate-45 bg-background border-r border-b border-border/50"
        aria-hidden="true"
      />
    </div>
  );
};