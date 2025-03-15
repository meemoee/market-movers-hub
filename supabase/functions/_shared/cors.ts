export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Define global space for request pool management
// @ts-ignore - Using Deno namespace to maintain global state
const global = globalThis as any;

// Metrics tracking structure
interface BraveUsageMetrics {
  totalRequests: number;
  rateExceededCount: number;
  waitTimeTotal: number;
  maxWaitTime: number;
  lastResetTimestamp: number;
  rateLimitHeaders: {
    remaining: number[];
    reset: number[];
  };
}

// Initialize the request tracking in global scope if not already present
if (!global.braveRequestPool) {
  global.braveRequestPool = {
    requests: [],
    maxConcurrent: 15, // Increased from 2 to 15 requests per second
    windowMs: 1000, // 1 second window
    metrics: {
      totalRequests: 0,
      rateExceededCount: 0,
      waitTimeTotal: 0,
      maxWaitTime: 0,
      lastResetTimestamp: Date.now(),
      rateLimitHeaders: {
        remaining: [],
        reset: []
      }
    } as BraveUsageMetrics
  };
}

// Helper to log current pool status
const logPoolStatus = (message: string, additionalData?: Record<string, any>) => {
  const pool = global.braveRequestPool;
  const now = Date.now();
  
  // Clean expired requests for accurate count
  pool.requests = pool.requests.filter((timestamp: number) => 
    now - timestamp < pool.windowMs
  );
  
  console.log(`[BravePool] ${message}`, {
    activeRequests: pool.requests.length,
    maxConcurrent: pool.maxConcurrent,
    queuedPercentage: Math.round((pool.requests.length / pool.maxConcurrent) * 100),
    ...additionalData
  });
};

// Reset metrics daily to prevent unbounded growth
const resetMetricsIfNeeded = () => {
  const pool = global.braveRequestPool;
  const now = Date.now();
  const oneDayMs = 86400000; // 24 hours
  
  if (now - pool.metrics.lastResetTimestamp > oneDayMs) {
    console.log("[BravePool] Resetting daily metrics", {
      previousMetrics: { ...pool.metrics }
    });
    
    pool.metrics = {
      totalRequests: 0,
      rateExceededCount: 0,
      waitTimeTotal: 0,
      maxWaitTime: 0,
      lastResetTimestamp: now,
      rateLimitHeaders: {
        remaining: [],
        reset: []
      }
    };
  }
};

// Sliding window rate limiter for Brave API
export const braveRequestPool = {
  /**
   * Check if a new request can be made within rate limits
   * @returns boolean indicating if request can proceed
   */
  canMakeRequest: (): boolean => {
    const pool = global.braveRequestPool;
    const now = Date.now();
    
    // Clean up old requests outside the time window
    pool.requests = pool.requests.filter((timestamp: number) => 
      now - timestamp < pool.windowMs
    );
    
    // Check if we're under the concurrent request limit
    return pool.requests.length < pool.maxConcurrent;
  },
  
  /**
   * Track a new request
   */
  trackRequest: (): void => {
    const pool = global.braveRequestPool;
    pool.requests.push(Date.now());
    pool.metrics.totalRequests++;
    resetMetricsIfNeeded();
    
    // Log high load situations (over 80% capacity)
    if (pool.requests.length > pool.maxConcurrent * 0.8) {
      logPoolStatus("High load warning", { 
        loadLevel: "high",
        requestCount: pool.requests.length 
      });
    }
  },
  
  /**
   * Wait until a request can be made
   * @returns Promise that resolves when a request can be made
   */
  waitForAvailableSlot: async (): Promise<void> => {
    const pool = global.braveRequestPool;
    const checkInterval = 100; // Check every 100ms
    const maxWaitTime = 10000; // Maximum wait time of 10 seconds
    let waitedTime = 0;
    let startWaitTime = Date.now();
    
    // If we can make the request immediately, don't log anything
    if (braveRequestPool.canMakeRequest()) {
      return;
    }
    
    // Log the queue status when waiting begins
    logPoolStatus("Waiting for available slot", { waitingStartedAt: new Date().toISOString() });
    
    while (!braveRequestPool.canMakeRequest()) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waitedTime += checkInterval;
      
      // Log periodic updates for long waits (every second)
      if (waitedTime % 1000 === 0) {
        logPoolStatus("Still waiting for slot", { 
          waitedMs: waitedTime,
          queuePosition: pool.requests.length - pool.maxConcurrent + 1
        });
      }
      
      if (waitedTime >= maxWaitTime) {
        const waitMessage = "Exceeded maximum wait time for Brave request slot";
        pool.metrics.rateExceededCount++;
        logPoolStatus(waitMessage, { 
          criticalWarning: true,
          waitedMs: waitedTime,
          rateExceededTotal: pool.metrics.rateExceededCount
        });
        break; // Prevent infinite waiting
      }
    }
    
    const actualWaitTime = Date.now() - startWaitTime;
    
    // Update wait time metrics
    pool.metrics.waitTimeTotal += actualWaitTime;
    pool.metrics.maxWaitTime = Math.max(pool.metrics.maxWaitTime, actualWaitTime);
    
    if (actualWaitTime > 500) {
      logPoolStatus("Long wait completed", { 
        waitedMs: actualWaitTime,
        avgWaitTime: Math.round(pool.metrics.waitTimeTotal / pool.metrics.totalRequests)
      });
    }
  },
  
  /**
   * Parse rate limit headers from Brave API response
   * @param headers Response headers
   * @returns Object with rate limit information
   */
  parseRateLimitHeaders: (headers: Headers): {remaining: number, reset: number} => {
    const remaining = parseInt(headers.get('X-RateLimit-Remaining') || '1000');
    const reset = parseInt(headers.get('X-RateLimit-Reset') || '0');
    const pool = global.braveRequestPool;
    
    // Store rate limit data for trending analysis (keep last 10 values)
    pool.metrics.rateLimitHeaders.remaining.push(remaining);
    pool.metrics.rateLimitHeaders.reset.push(reset);
    
    // Trim arrays to last 10 entries to avoid unbounded growth
    if (pool.metrics.rateLimitHeaders.remaining.length > 10) {
      pool.metrics.rateLimitHeaders.remaining.shift();
    }
    if (pool.metrics.rateLimitHeaders.reset.length > 10) {
      pool.metrics.rateLimitHeaders.reset.shift();
    }
    
    // Log warnings when rate limits are getting low
    if (remaining < 100) {
      logPoolStatus("Rate limit running low", { 
        remainingRequests: remaining, 
        resetInSeconds: reset,
        warning: remaining < 20 ? "critical" : "moderate"
      });
    }
    
    return { remaining, reset };
  },
  
  /**
   * Get current pool metrics for monitoring
   * @returns Current metrics object
   */
  getMetrics: (): Record<string, any> => {
    const pool = global.braveRequestPool;
    const now = Date.now();
    
    // Clean up expired requests for accurate count
    pool.requests = pool.requests.filter((timestamp: number) => 
      now - timestamp < pool.windowMs
    );
    
    // Calculate some derived metrics
    const activeRequestCount = pool.requests.length;
    const utilizationPercent = Math.round((activeRequestCount / pool.maxConcurrent) * 100);
    const avgWaitTime = pool.metrics.totalRequests > 0 
      ? Math.round(pool.metrics.waitTimeTotal / pool.metrics.totalRequests) 
      : 0;
      
    // Remaining rate limit trend
    const remainingTrend = pool.metrics.rateLimitHeaders.remaining.length > 1
      ? pool.metrics.rateLimitHeaders.remaining[pool.metrics.rateLimitHeaders.remaining.length - 1] - 
        pool.metrics.rateLimitHeaders.remaining[0]
      : 0;
    
    return {
      currentLoad: {
        activeRequests: activeRequestCount,
        maxConcurrent: pool.maxConcurrent,
        utilizationPercent,
        windowMs: pool.windowMs
      },
      cumulative: {
        totalRequests: pool.metrics.totalRequests,
        rateExceededCount: pool.metrics.rateExceededCount,
        avgWaitTimeMs: avgWaitTime,
        maxWaitTimeMs: pool.metrics.maxWaitTime,
        sinceReset: new Date(pool.metrics.lastResetTimestamp).toISOString()
      },
      rateLimits: {
        remainingRequests: pool.metrics.rateLimitHeaders.remaining.length > 0 
          ? pool.metrics.rateLimitHeaders.remaining[pool.metrics.rateLimitHeaders.remaining.length - 1]
          : "unknown",
        remainingTrend,
        resetTime: pool.metrics.rateLimitHeaders.reset.length > 0
          ? new Date(pool.metrics.rateLimitHeaders.reset[pool.metrics.rateLimitHeaders.reset.length - 1] * 1000).toISOString()
          : "unknown"
      }
    };
  }
};
