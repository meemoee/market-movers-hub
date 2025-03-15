
import { getRedisClient, closeRedisConnection } from "./redis.ts";

// Rate limit key prefixes
const RATE_LIMIT_PREFIX = "research:ratelimit:";

// Service rate limits (requests per minute)
const SERVICE_LIMITS = {
  "brave": 10,     // 10 requests per minute
  "openrouter": 5, // 5 requests per minute
  "default": 20    // Default limit
};

/**
 * Check if a request should be rate limited
 * Uses a sliding window algorithm for rate limiting
 */
export async function checkRateLimit(
  service: string,
  identifier: string,
  limit?: number
): Promise<boolean> {
  const redis = await getRedisClient();
  
  try {
    const now = Date.now();
    const windowSizeMs = 60 * 1000; // 1 minute window
    const windowStart = now - windowSizeMs;
    
    // Key for this service and identifier
    const key = `${RATE_LIMIT_PREFIX}${service}:${identifier}`;
    
    // Get service limit or use provided limit or default
    const serviceLimit = limit || SERVICE_LIMITS[service] || SERVICE_LIMITS.default;
    
    // Remove expired timestamps (older than 1 minute)
    await redis.zRemRangeByScore(key, 0, windowStart);
    
    // Count current requests in the time window
    const requestCount = await redis.zCard(key);
    
    // Check if limit exceeded
    if (requestCount >= serviceLimit) {
      console.log(`Rate limit exceeded for ${service}:${identifier} - ${requestCount}/${serviceLimit}`);
      return true; // Rate limited
    }
    
    // Add current timestamp to sorted set
    await redis.zAdd(key, { score: now, member: now.toString() });
    
    // Set expiration for the rate limit key (2 minutes)
    await redis.expire(key, 120);
    
    return false; // Not rate limited
  } catch (error) {
    console.error(`Error checking rate limit for ${service}:${identifier}:`, error);
    return false; // On error, allow request to proceed
  } finally {
    await closeRedisConnection();
  }
}

/**
 * Get remaining requests for a service
 */
export async function getRemainingRequests(
  service: string,
  identifier: string
): Promise<number> {
  const redis = await getRedisClient();
  
  try {
    const now = Date.now();
    const windowSizeMs = 60 * 1000; // 1 minute window
    const windowStart = now - windowSizeMs;
    
    // Key for this service and identifier
    const key = `${RATE_LIMIT_PREFIX}${service}:${identifier}`;
    
    // Get service limit
    const serviceLimit = SERVICE_LIMITS[service] || SERVICE_LIMITS.default;
    
    // Remove expired timestamps
    await redis.zRemRangeByScore(key, 0, windowStart);
    
    // Count current requests
    const requestCount = await redis.zCard(key);
    
    // Calculate remaining requests
    return Math.max(0, serviceLimit - requestCount);
  } catch (error) {
    console.error(`Error getting remaining requests for ${service}:${identifier}:`, error);
    return 0;
  } finally {
    await closeRedisConnection();
  }
}

/**
 * Get time until reset (in milliseconds)
 */
export async function getTimeUntilReset(
  service: string,
  identifier: string
): Promise<number> {
  const redis = await getRedisClient();
  
  try {
    const now = Date.now();
    const windowSizeMs = 60 * 1000; // 1 minute window
    
    // Key for this service and identifier
    const key = `${RATE_LIMIT_PREFIX}${service}:${identifier}`;
    
    // Get the oldest timestamp in the window
    const oldestTimestamps = await redis.zRange(key, 0, 0, { withScores: true });
    
    if (oldestTimestamps.length === 0) {
      return 0; // No requests in window, no need to wait
    }
    
    // Extract the oldest timestamp
    const oldestTimestamp = oldestTimestamps[0].score;
    
    // Calculate reset time
    return Math.max(0, oldestTimestamp + windowSizeMs - now);
  } catch (error) {
    console.error(`Error getting time until reset for ${service}:${identifier}:`, error);
    return 0;
  } finally {
    await closeRedisConnection();
  }
}

/**
 * Throttled request function - waits if rate limited
 */
export async function throttledRequest<T>(
  service: string,
  identifier: string,
  requestFn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let retries = 0;
  
  while (retries < maxRetries) {
    // Check rate limit
    const isLimited = await checkRateLimit(service, identifier);
    
    if (!isLimited) {
      try {
        // Execute the request
        return await requestFn();
      } catch (error) {
        console.error(`Request error for ${service}:${identifier}:`, error);
        throw error;
      }
    }
    
    // If rate limited, wait until reset
    const waitTime = await getTimeUntilReset(service, identifier);
    console.log(`Rate limited for ${service}:${identifier}, waiting ${waitTime}ms`);
    
    // Add a small buffer to ensure we're past the window
    const waitTimeWithBuffer = waitTime + 1000;
    
    // Wait until reset
    await new Promise(resolve => setTimeout(resolve, waitTimeWithBuffer));
    
    retries++;
  }
  
  throw new Error(`Maximum retries exceeded for ${service}:${identifier}`);
}
