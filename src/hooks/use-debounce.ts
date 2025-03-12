
import { useEffect, useState, useRef } from 'react'

export function useDebounce<T>(value: T, delay?: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  const previousValue = useRef<T | null>(null)
  
  useEffect(() => {
    // Skip debounce on first render or if value is null after being non-null
    if (previousValue.current === null || (value === null && previousValue.current !== null)) {
      setDebouncedValue(value)
      previousValue.current = value
      return
    }
    
    // Normal debounce behavior
    const timer = setTimeout(() => {
      setDebouncedValue(value)
      previousValue.current = value
    }, delay || 500)

    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}
