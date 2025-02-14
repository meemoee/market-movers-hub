
import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"
import { cn } from "@/lib/utils"

interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  showMinThumb?: boolean;
  showMaxThumb?: boolean;
}

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(({ className, showMinThumb = true, showMaxThumb = true, value, onValueChange, ...props }, ref) => {
  const isRange = Array.isArray(value) && value.length === 2;
  const min = props.min ?? 0;
  const max = props.max ?? 100;

  // Handle value changes and enforce constraints
  const handleValueChange = (newValue: number[]) => {
    if (!onValueChange) return;

    if (isRange) {
      let [newMin, newMax] = newValue;
      
      // If thumbs are disabled, force their respective values
      if (!showMinThumb) newMin = min;
      if (!showMaxThumb) newMax = max;

      // Enforce min/max constraints
      if (showMinThumb && showMaxThumb) {
        const currentValues = value as number[];
        const isMovingMin = newMin !== currentValues[0];
        
        if (isMovingMin) {
          // If moving min thumb, clamp it to max value
          newMin = Math.min(newMin, currentValues[1]);
        } else {
          // If moving max thumb, clamp it to min value
          newMax = Math.max(newMax, currentValues[0]);
        }
      }

      onValueChange([newMin, newMax]);
    } else {
      onValueChange(newValue);
    }
  };

  const displayValues = isRange ? [
    showMinThumb ? (value as number[])[0] : min,
    showMaxThumb ? (value as number[])[1] : max
  ] : value;

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        className
      )}
      value={displayValues as number[]}
      onValueChange={handleValueChange}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {isRange ? (
        <>
          {showMinThumb && (
            <SliderPrimitive.Thumb
              className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            />
          )}
          {showMaxThumb && (
            <SliderPrimitive.Thumb
              className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            />
          )}
        </>
      ) : (
        <SliderPrimitive.Thumb
          className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        />
      )}
    </SliderPrimitive.Root>
  )
})
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
