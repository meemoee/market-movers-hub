import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"
import { cn } from "@/lib/utils"

interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  showMinThumb?: boolean;
  showMaxThumb?: boolean;
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (value: number[]) => void;
}

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(({ 
  className, 
  showMinThumb = true, 
  showMaxThumb = true,
  value,
  defaultValue,
  onValueChange,
  ...props 
}, ref) => {
  // Keep track of full values internally
  const [internalValues, setInternalValues] = React.useState([0, 100]);

  // Update internal values when props change
  React.useEffect(() => {
    if (value) {
      setInternalValues(value);
    } else if (defaultValue) {
      setInternalValues(defaultValue);
    }
  }, [value, defaultValue]);

  // Get displayed values based on which thumbs are shown
  const getDisplayedValues = React.useCallback(() => {
    if (showMinThumb && showMaxThumb) {
      return [internalValues[0], internalValues[1]];
    }
    if (showMinThumb) {
      return [internalValues[0]];
    }
    if (showMaxThumb) {
      return [internalValues[1]];
    }
    return [];
  }, [showMinThumb, showMaxThumb, internalValues]);

  // Handle value changes from the slider
  const handleValueChange = (newValues: number[]) => {
    let updatedValues = [...internalValues];
    
    if (showMinThumb && showMaxThumb) {
      updatedValues = newValues;
    } else if (showMinThumb) {
      updatedValues[0] = newValues[0];
    } else if (showMaxThumb) {
      updatedValues[1] = newValues[0];
    }

    setInternalValues(updatedValues);
    onValueChange?.(updatedValues);
  };

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        className
      )}
      {...props}
      value={getDisplayedValues()}
      onValueChange={handleValueChange}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      
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
