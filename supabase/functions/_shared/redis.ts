
import { connect } from "https://deno.land/x/redis@v0.29.0/mod.ts";

// Redis connection configuration
let redisClient: any = null;
let connectionAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Setup Redis client
export async function getRedisClient() {
  if (redisClient !== null) {
    return redisClient;
  }

  connectionAttempts++;

  try {
    // Try to connect using REDIS_URL first
    const redisUrl = Deno.env.get("REDIS_URL");
    
    if (redisUrl) {
      redisClient = await connect(redisUrl);
      console.log("Connected to Redis using REDIS_URL");
      return redisClient;
    }
    
    // Fallback to manual connection parameters
    const host = Deno.env.get("REDIS_HOST") || "localhost";
    const port = parseInt(Deno.env.get("REDIS_PORT") || "6379");
    const password = Deno.env.get("REDIS_PASSWORD");
    
    const connectionOptions: any = {
      hostname: host,
      port: port,
    };
    
    if (password) {
      connectionOptions.password = password;
    }
    
    // Check if we need TLS (usually for production Redis)
    if (host.includes("redis.com") || host.includes("upstash.io")) {
      connectionOptions.tls = true;
    }
    
    redisClient = await connect(connectionOptions);
    console.log(`Connected to Redis at ${host}:${port}`);
    return redisClient;
  } catch (error) {
    console.error("Redis connection error:", error);
    
    // Implement reconnection logic with exponential backoff
    if (connectionAttempts < MAX_RECONNECT_ATTEMPTS) {
      const backoffTime = Math.min(1000 * Math.pow(2, connectionAttempts), 10000);
      console.log(`Retrying Redis connection in ${backoffTime}ms (attempt ${connectionAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
      
      await new Promise(resolve => setTimeout(resolve, backoffTime));
      return getRedisClient();
    }
    
    throw new Error(`Failed to connect to Redis after ${MAX_RECONNECT_ATTEMPTS} attempts: ${error.message}`);
  }
}

// Clean up Redis connection
export async function closeRedisConnection() {
  if (redisClient) {
    try {
      await redisClient.close();
      redisClient = null;
      connectionAttempts = 0;
      console.log("Redis connection closed");
    } catch (error) {
      console.error("Error closing Redis connection:", error);
    }
  }
}
