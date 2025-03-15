
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Define global space for request pool management
// @ts-ignore - Using Deno namespace to maintain global state
const global = globalThis as any;

// Initialize the request tracking in global scope if not already present
if (!global.braveRequestPool) {
  global.braveRequestPool = {
    requests: [],
    maxConcurrent: 2,
    windowMs: 1000, // 1 second window
  };
}

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
  },
  
  /**
   * Wait until a request can be made
   * @returns Promise that resolves when a request can be made
   */
  waitForAvailableSlot: async (): Promise<void> => {
    const checkInterval = 100; // Check every 100ms
    const maxWaitTime = 10000; // Maximum wait time of 10 seconds
    let waitedTime = 0;
    
    while (!braveRequestPool.canMakeRequest()) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waitedTime += checkInterval;
      
      if (waitedTime >= maxWaitTime) {
        console.log("Exceeded maximum wait time for Brave request slot");
        break; // Prevent infinite waiting
      }
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
    
    return { remaining, reset };
  }
};
