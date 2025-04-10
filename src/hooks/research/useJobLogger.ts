import { useRef } from 'react';

interface LogEntry {
  time: number;
  type: string;
  info: string;
}

/**
 * Custom hook for consistent logging in research components
 * Provides logging utility and maintains a log history that can be accessed for debugging
 */
export function useJobLogger(componentName: string) {
  const updateLogRef = useRef<Array<LogEntry>>([]);
  
  // Debug logging utils
  const logUpdate = (type: string, info: string) => {
    console.log(`🔍 ${componentName} ${type}: ${info}`);
    updateLogRef.current.push({
      time: Date.now(),
      type,
      info
    });
    
    // Keep the log at a reasonable size
    if (updateLogRef.current.length > 100) {
      updateLogRef.current.shift();
    }
  }
  
  /**
   * Get all accumulated logs
   */
  const getLogs = () => {
    return updateLogRef.current;
  }
  
  return {
    logUpdate,
    getLogs
  };
}
