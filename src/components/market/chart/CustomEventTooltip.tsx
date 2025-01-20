import { cn } from "@/lib/utils";

interface CustomEventTooltipProps {
  title: string;
  description?: string;
  x: number;
  y: number;
}

export const CustomEventTooltip = ({
  title,
  description,
  x,
  y,
}: CustomEventTooltipProps) => {
  return (
    <div
      className={cn(
        "fixed z-[100] min-w-[200px] max-w-[240px] rounded-lg border border-border/50",
        "bg-background/95 px-3 py-2 shadow-xl backdrop-blur-sm"
      )}
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translate(-50%, -100%)',
        marginTop: '-8px',
        pointerEvents: 'none',
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