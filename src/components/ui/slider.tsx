import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

interface SliderProps
  extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  showMinThumb?: boolean;
  showMaxThumb?: boolean;
}

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(
  (
    {
      className,
      showMinThumb = true,
      showMaxThumb = true,
      onValueChange,
      ...props
    },
    ref
  ) => {
    // This ref tracks which thumb is currently active (0 for left, 1 for right)
    const activeThumbRef = React.useRef<number | null>(null);

    // Wrap the onValueChange to clamp the active thumb
    const handleValueChange = (values: number[]) => {
      const clamped = [...values];
      if (
        props.value &&
        Array.isArray(props.value) &&
        props.value.length === 2 &&
        activeThumbRef.current !== null
      ) {
        // When dragging the left thumb, ensure it does not exceed the right value.
        if (activeThumbRef.current === 0) {
          clamped[0] = Math.min(clamped[0], clamped[1]);
        }
        // When dragging the right thumb, ensure it does not go below the left value.
        if (activeThumbRef.current === 1) {
          clamped[1] = Math.max(clamped[1], clamped[0]);
        }
      }
      if (onValueChange) {
        onValueChange(clamped);
      }
    };

    const values = props.value as number[];
    const isRange = values?.length === 2;

    // We pass the values directly since we rely on our pointer logic for clamping.
    const displayValues = values;

    return (
      <SliderPrimitive.Root
        ref={ref}
        className={cn(
          "relative flex w-full touch-none select-none items-center",
          className
        )}
        {...props}
        value={displayValues}
        onValueChange={handleValueChange}
        // Reset the active thumb on pointer up
        onPointerUp={() => {
          activeThumbRef.current = null;
        }}
      >
        <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
          <SliderPrimitive.Range className="absolute h-full bg-primary" />
        </SliderPrimitive.Track>
        {isRange ? (
          <>
            {showMinThumb && (
              <SliderPrimitive.Thumb
                onPointerDown={() => {
                  activeThumbRef.current = 0;
                }}
                className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
              />
            )}
            {showMaxThumb && (
              <SliderPrimitive.Thumb
                onPointerDown={() => {
                  activeThumbRef.current = 1;
                }}
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
    );
  }
);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
