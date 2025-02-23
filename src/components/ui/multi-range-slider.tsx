
import React, { useCallback, useEffect, useState, useRef } from "react";
import "./multi-range-slider.css";

interface MultiRangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  showMinThumb?: boolean;
  showMaxThumb?: boolean;
  className?: string;
}

export const MultiRangeSlider = ({
  min,
  max,
  value = [0, 100] as [number, number],
  onChange,
  showMinThumb = true,
  showMaxThumb = true,
  className = "",
}: MultiRangeSliderProps) => {
  const [minVal, setMinVal] = useState(value?.[0] ?? min);
  const [maxVal, setMaxVal] = useState(value?.[1] ?? max);
  const minValRef = useRef(value?.[0] ?? min);
  const maxValRef = useRef(value?.[1] ?? max);
  const range = useRef<HTMLDivElement>(null);

  // Convert to percentage
  const getPercent = useCallback(
    (value: number) => Math.round(((value - min) / (max - min)) * 100),
    [min, max]
  );

  // Set width of the range to decrease from the left side
  useEffect(() => {
    const minPercent = getPercent(showMinThumb ? minVal : min);
    const maxPercent = getPercent(maxValRef.current);

    if (range.current) {
      range.current.style.left = `${minPercent}%`;
      range.current.style.width = `${maxPercent - minPercent}%`;
    }
  }, [minVal, getPercent, showMinThumb, min]);

  // Set width of the range to decrease from the right side
  useEffect(() => {
    const minPercent = getPercent(minValRef.current);
    const maxPercent = getPercent(showMaxThumb ? maxVal : max);

    if (range.current) {
      range.current.style.width = `${maxPercent - minPercent}%`;
    }
  }, [maxVal, getPercent, showMaxThumb, max]);

  // Get min and max values when their state changes
  useEffect(() => {
    onChange([
      showMinThumb ? minVal : min,
      showMaxThumb ? maxVal : max
    ] as [number, number]);
  }, [minVal, maxVal, onChange, showMinThumb, showMaxThumb, min, max]);

  // Update local state when props change
  useEffect(() => {
    if (value && Array.isArray(value) && value.length === 2) {
      setMinVal(value[0]);
      setMaxVal(value[1]);
      minValRef.current = value[0];
      maxValRef.current = value[1];
    }
  }, [value]);

  return (
    <div className={`relative touch-none select-none ${className}`}>
      {showMinThumb && (
        <input
          type="range"
          min={min}
          max={max}
          value={minVal}
          onChange={(event) => {
            const value = Math.min(Number(event.target.value), maxVal - 1);
            setMinVal(value);
            minValRef.current = value;
          }}
          className="thumb thumb--left"
          style={{ zIndex: minVal > max - 100 ? 5 : undefined }}
        />
      )}
      {showMaxThumb && (
        <input
          type="range"
          min={min}
          max={max}
          value={maxVal}
          onChange={(event) => {
            const value = Math.max(Number(event.target.value), minVal + 1);
            setMaxVal(value);
            maxValRef.current = value;
          }}
          className="thumb thumb--right"
        />
      )}

      <div className="slider">
        <div className="slider__track" />
        <div ref={range} className="slider__range" />
      </div>
    </div>
  );
};
