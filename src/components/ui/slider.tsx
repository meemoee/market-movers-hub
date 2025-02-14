
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
>(({ className, showMinThumb = true, showMaxThumb = true, value, ...props }, ref) => {
  // Convert single thumb mode to dual thumb mode internally
  const values = value as number[];
  const [defaultMin, defaultMax] = [props.min || 0, props.max || 100];
  
  // Determine which values to show based on enabled thumbs
  let displayValues: number[];
  
  if (!showMinThumb && showMaxThumb) {
    // Only max thumb: First value is min, second is the actual max value
    displayValues = [defaultMin, values[1]];
  } else if (showMinThumb && !showMaxThumb) {
    // Only min thumb: First value is the actual min value, second is max
    displayValues = [values[0], defaultMax];
  } else if (!showMinThumb && !showMaxThumb) {
    // No thumbs: Use defaults
    displayValues = [defaultMin, defaultMax];
  } else {
    // Both thumbs: Use actual values
    displayValues = values;
  }

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        className
      )}
      {...props}
      value={displayValues}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      
      {/* Render thumbs based on what's enabled */}
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
    </SliderPrimitive.Root>
  )
})
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
