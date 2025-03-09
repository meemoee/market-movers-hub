
import { useMemo } from 'react';
import { PriceData, FillSegment } from './types';

export const useChartData = (data: PriceData[]) => {
  return useMemo(() => {
    if (!data.length) return { segments: [], domain: { min: 0, max: 100 } };

    const segments: FillSegment[] = [];
    let currentSegment: PriceData[] = [];
    let currentType: 'above' | 'below' | null = null;

    // Helper to add a segment
    const addSegment = (type: 'above' | 'below') => {
      if (currentSegment.length > 0) {
        segments.push({ data: [...currentSegment], type });
        currentSegment = [];
      }
    };

    // Process each point
    data.forEach((point, index) => {
      const prevPoint = index > 0 ? data[index - 1] : null;
      const isAbove = point.price >= 50;
      
      // Handle gaps in data (more than 1 hour)
      if (prevPoint && point.time - prevPoint.time > 3600000) {
        // Close current segment
        addSegment(currentType!);
        
        // Add a connecting segment at the previous price
        segments.push({
          data: [
            { time: prevPoint.time, price: prevPoint.price },
            { time: point.time, price: prevPoint.price },
          ],
          type: prevPoint.price >= 50 ? 'above' : 'below'
        });
        
        currentType = isAbove ? 'above' : 'below';
        currentSegment = [point];
        return;
      }

      // Handle crossing the 50% line
      if (prevPoint && ((prevPoint.price - 50) * (point.price - 50) < 0)) {
        // Calculate intersection point
        const ratio = (50 - prevPoint.price) / (point.price - prevPoint.price);
        const intersectionTime = prevPoint.time + (point.time - prevPoint.time) * ratio;
        const intersectionPoint = { time: intersectionTime, price: 50 };

        // Close current segment
        addSegment(currentType!);

        // Add segments for both sides of the intersection
        segments.push({
          data: [prevPoint, intersectionPoint],
          type: prevPoint.price >= 50 ? 'above' : 'below'
        });
        
        segments.push({
          data: [intersectionPoint, point],
          type: point.price >= 50 ? 'above' : 'below'
        });
        
        currentType = isAbove ? 'above' : 'below';
        currentSegment = [point];
        return;
      }

      // Normal point processing
      if (currentType === null) {
        currentType = isAbove ? 'above' : 'below';
      }

      if (isAbove && currentType === 'above' || !isAbove && currentType === 'below') {
        currentSegment.push(point);
      } else {
        addSegment(currentType);
        currentType = isAbove ? 'above' : 'below';
        currentSegment = [point];
      }
    });

    // Add final segment
    if (currentSegment.length > 0 && currentType) {
      addSegment(currentType);
    }

    return {
      segments,
      domain: { min: 0, max: 100 }
    };
  }, [data]);
};
