
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
  const values = value as number[];
  const [min, max] = [props.min || 0, props.max || 100];

  // If only max thumb is shown, we need to render it differently
  const isMaxOnly = !showMinThumb && showMaxThumb;
  
  // When only max thumb is shown, we use a different array structure
  // where the max value is in the first position
  const displayValues = isMaxOnly ? 
    [values[1], max] :  // For max-only, show max value in first position
    values;             // Otherwise use normal array

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

      {/* For max-only mode, we only render one thumb */}
      {isMaxOnly ? (
        <SliderPrimitive.Thumb
          className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        />
      ) : (
        // For all other modes, render thumbs normally
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
      )}
    </SliderPrimitive.Root>
  )
})
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
