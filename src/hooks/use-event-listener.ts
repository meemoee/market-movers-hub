import { useEffect, useRef } from 'react';

type EventHandler = (event: any) => void;

export function useEventListener(
  eventName: string,
  handler: EventHandler,
  element: HTMLElement | Window | null = window,
  options?: AddEventListenerOptions
) {
  // Create a ref that stores handler
  const savedHandler = useRef<EventHandler>();

  useEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

  useEffect(() => {
    // Make sure element supports addEventListener
    const targetElement = element;
    if (!(targetElement && targetElement.addEventListener)) {
      return;
    }

    // Create event listener that calls handler function stored in ref
    const eventListener = (event: Event) => {
      if (savedHandler.current) {
        savedHandler.current(event);
      }
    };

    targetElement.addEventListener(eventName, eventListener, options);

    // Remove event listener on cleanup
    return () => {
      targetElement.removeEventListener(eventName, eventListener);
    };
  }, [eventName, element, options]);
}