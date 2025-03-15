
import { getRedisClient, closeRedisConnection } from "./redis.ts";

// Job status types
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

// Job interface
export interface ResearchJob {
  id: string;
  market_id: string;
  query: string;
  status: JobStatus;
  max_iterations: number;
  current_iteration: number;
  progress_log: string[];
  iterations: any[];
  results?: any;
  error_message?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  updated_at: string;
  user_id?: string;
  focus_text?: string;
}

// Job queue keys
const QUEUE_PENDING = "research:queue:pending";
const QUEUE_PROCESSING = "research:queue:processing";
const JOB_PREFIX = "research:job:";
const PROGRESS_PREFIX = "research:progress:";
const JOB_LOCK_PREFIX = "research:lock:";
const RESULTS_PREFIX = "research:results:";
const CACHE_PREFIX = "research:cache:";

// Lock expiration (5 minutes)
const LOCK_EXPIRATION = 300;

// Default TTL for completed jobs (7 days)
const COMPLETED_JOB_TTL = 60 * 60 * 24 * 7;

// Max buffer size for progress logs before DB flush
const MAX_PROGRESS_BUFFER = 10;

/**
 * Add a job to the pending queue
 */
export async function addJob(job: Partial<ResearchJob>): Promise<string> {
  const redis = await getRedisClient();
  const jobId = job.id || crypto.randomUUID();
  
  try {
    // Create job object with defaults
    const newJob: ResearchJob = {
      id: jobId,
      market_id: job.market_id || "",
      query: job.query || "",
      status: "queued",
      max_iterations: job.max_iterations || 3,
      current_iteration: 0,
      progress_log: [],
      iterations: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: job.user_id,
      focus_text: job.focus_text
    };
    
    // Store job data in Redis
    await redis.set(`${JOB_PREFIX}${jobId}`, JSON.stringify(newJob));
    
    // Add to pending queue
    await redis.lPush(QUEUE_PENDING, jobId);
    
    console.log(`Job ${jobId} added to pending queue`);
    return jobId;
  } catch (error) {
    console.error(`Error adding job ${jobId} to queue:`, error);
    throw error;
  } finally {
    await closeRedisConnection();
  }
}

/**
 * Get the next pending job from the queue
 */
export async function getNextPendingJob(): Promise<ResearchJob | null> {
  const redis = await getRedisClient();
  
  try {
    // Get next job ID from pending queue
    const jobId = await redis.rPop(QUEUE_PENDING);
    if (!jobId) {
      return null;
    }
    
    // Get job data
    const jobData = await redis.get(`${JOB_PREFIX}${jobId}`);
    if (!jobData) {
      console.error(`Job ${jobId} found in queue but no data exists`);
      return null;
    }
    
    // Parse job data
    const job = JSON.parse(jobData);
    
    // Move to processing list with timestamp
    await redis.hSet(QUEUE_PROCESSING, jobId, Date.now().toString());
    
    // Update job status
    await updateJobStatus(jobId, "processing");
    
    return job;
  } catch (error) {
    console.error("Error getting next pending job:", error);
    throw error;
  } finally {
    await closeRedisConnection();
  }
}

/**
 * Get a job by ID
 */
export async function getJob(jobId: string): Promise<ResearchJob | null> {
  const redis = await getRedisClient();
  
  try {
    const jobData = await redis.get(`${JOB_PREFIX}${jobId}`);
    if (!jobData) {
      return null;
    }
    
    return JSON.parse(jobData);
  } catch (error) {
    console.error(`Error getting job ${jobId}:`, error);
    throw error;
  } finally {
    await closeRedisConnection();
  }
}

/**
 * Update job status
 */
export async function updateJobStatus(jobId: string, status: JobStatus): Promise<void> {
  const redis = await getRedisClient();
  
  try {
    // Get current job data
    const jobData = await redis.get(`${JOB_PREFIX}${jobId}`);
    if (!jobData) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    const job = JSON.parse(jobData);
    
    // Update status and relevant timestamps
    job.status = status;
    job.updated_at = new Date().toISOString();
    
    if (status === "processing" && !job.started_at) {
      job.started_at = new Date().toISOString();
    } else if (status === "completed" || status === "failed") {
      job.completed_at = new Date().toISOString();
      
      // Remove from processing queue
      await redis.hDel(QUEUE_PROCESSING, jobId);
      
      // Set TTL for job data
      await redis.expire(`${JOB_PREFIX}${jobId}`, COMPLETED_JOB_TTL);
    }
    
    // Save updated job
    await redis.set(`${JOB_PREFIX}${jobId}`, JSON.stringify(job));
    
    console.log(`Job ${jobId} status updated to ${status}`);
  } catch (error) {
    console.error(`Error updating job ${jobId} status:`, error);
    throw error;
  } finally {
    await closeRedisConnection();
  }
}

/**
 * Set error message for a job
 */
export async function setJobError(jobId: string, errorMessage: string): Promise<void> {
  const redis = await getRedisClient();
  
  try {
    // Get current job data
    const jobData = await redis.get(`${JOB_PREFIX}${jobId}`);
    if (!jobData) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    const job = JSON.parse(jobData);
    
    // Update error message
    job.error_message = errorMessage;
    job.status = "failed";
    job.completed_at = new Date().toISOString();
    job.updated_at = new Date().toISOString();
    
    // Save updated job
    await redis.set(`${JOB_PREFIX}${jobId}`, JSON.stringify(job));
    
    // Remove from processing queue
    await redis.hDel(QUEUE_PROCESSING, jobId);
    
    console.log(`Job ${jobId} failed with error: ${errorMessage}`);
  } catch (error) {
    console.error(`Error setting error for job ${jobId}:`, error);
    throw error;
  } finally {
    await closeRedisConnection();
  }
}

/**
 * Add progress log entry for a job
 */
export async function addProgressLog(jobId: string, entry: string): Promise<void> {
  const redis = await getRedisClient();
  
  try {
    // Add to progress list
    await redis.rPush(`${PROGRESS_PREFIX}${jobId}`, entry);
    
    // Check if we need to update the job in Redis
    const progressCount = await redis.lLen(`${PROGRESS_PREFIX}${jobId}`);
    
    if (progressCount >= MAX_PROGRESS_BUFFER) {
      // Get all progress entries
      const entries = await redis.lRange(`${PROGRESS_PREFIX}${jobId}`, 0, -1);
      
      // Get job data
      const jobData = await redis.get(`${JOB_PREFIX}${jobId}`);
      if (!jobData) {
        throw new Error(`Job ${jobId} not found`);
      }
      
      const job = JSON.parse(jobData);
      
      // Update progress log
      job.progress_log = [...job.progress_log, ...entries];
      job.updated_at = new Date().toISOString();
      
      // Save updated job
      await redis.set(`${JOB_PREFIX}${jobId}`, JSON.stringify(job));
      
      // Clear progress buffer
      await redis.del(`${PROGRESS_PREFIX}${jobId}`);
      
      console.log(`Updated job ${jobId} with ${entries.length} progress entries`);
    }
  } catch (error) {
    console.error(`Error adding progress log for job ${jobId}:`, error);
    throw error;
  } finally {
    await closeRedisConnection();
  }
}

/**
 * Update job iteration
 */
export async function updateJobIteration(jobId: string, iteration: number): Promise<void> {
  const redis = await getRedisClient();
  
  try {
    // Get current job data
    const jobData = await redis.get(`${JOB_PREFIX}${jobId}`);
    if (!jobData) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    const job = JSON.parse(jobData);
    
    // Update iteration
    job.current_iteration = iteration;
    job.updated_at = new Date().toISOString();
    
    // Auto-complete if max iterations reached
    if (job.current_iteration >= job.max_iterations && job.status === "processing") {
      job.status = "completed";
      job.completed_at = new Date().toISOString();
      
      // Remove from processing queue
      await redis.hDel(QUEUE_PROCESSING, jobId);
    }
    
    // Save updated job
    await redis.set(`${JOB_PREFIX}${jobId}`, JSON.stringify(job));
    
    console.log(`Job ${jobId} iteration updated to ${iteration}`);
  } catch (error) {
    console.error(`Error updating iteration for job ${jobId}:`, error);
    throw error;
  } finally {
    await closeRedisConnection();
  }
}

/**
 * Add iteration data to a job
 */
export async function addJobIteration(jobId: string, iterationData: any): Promise<void> {
  const redis = await getRedisClient();
  
  try {
    // Get current job data
    const jobData = await redis.get(`${JOB_PREFIX}${jobId}`);
    if (!jobData) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    const job = JSON.parse(jobData);
    
    // Add iteration data
    job.iterations = [...job.iterations, iterationData];
    job.updated_at = new Date().toISOString();
    
    // Save updated job
    await redis.set(`${JOB_PREFIX}${jobId}`, JSON.stringify(job));
    
    console.log(`Added iteration data for job ${jobId}, iteration ${iterationData.iteration}`);
  } catch (error) {
    console.error(`Error adding iteration data for job ${jobId}:`, error);
    throw error;
  } finally {
    await closeRedisConnection();
  }
}

/**
 * Update job results
 */
export async function updateJobResults(jobId: string, results: any): Promise<void> {
  const redis = await getRedisClient();
  
  try {
    // Store results separately to avoid size limits
    await redis.set(`${RESULTS_PREFIX}${jobId}`, JSON.stringify(results));
    
    // Get job data
    const jobData = await redis.get(`${JOB_PREFIX}${jobId}`);
    if (!jobData) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    const job = JSON.parse(jobData);
    
    // Update job to reference results
    job.has_results = true;
    job.updated_at = new Date().toISOString();
    
    // Save updated job
    await redis.set(`${JOB_PREFIX}${jobId}`, JSON.stringify(job));
    
    console.log(`Updated results for job ${jobId}`);
  } catch (error) {
    console.error(`Error updating results for job ${jobId}:`, error);
    throw error;
  } finally {
    await closeRedisConnection();
  }
}

/**
 * Get job results
 */
export async function getJobResults(jobId: string): Promise<any | null> {
  const redis = await getRedisClient();
  
  try {
    const resultsData = await redis.get(`${RESULTS_PREFIX}${jobId}`);
    if (!resultsData) {
      return null;
    }
    
    return JSON.parse(resultsData);
  } catch (error) {
    console.error(`Error getting results for job ${jobId}:`, error);
    throw error;
  } finally {
    await closeRedisConnection();
  }
}

/**
 * Sync job data to database
 */
export async function syncJobToDatabase(jobId: string, supabaseClient: any): Promise<void> {
  const redis = await getRedisClient();
  
  try {
    // Get job data
    const jobData = await redis.get(`${JOB_PREFIX}${jobId}`);
    if (!jobData) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    const job = JSON.parse(jobData);
    
    // Get progress logs
    const progressEntries = await redis.lRange(`${PROGRESS_PREFIX}${jobId}`, 0, -1);
    if (progressEntries.length > 0) {
      job.progress_log = [...job.progress_log, ...progressEntries];
      await redis.del(`${PROGRESS_PREFIX}${jobId}`);
    }
    
    // Get results if available
    if (job.has_results) {
      const resultsData = await redis.get(`${RESULTS_PREFIX}${jobId}`);
      if (resultsData) {
        job.results = JSON.parse(resultsData);
      }
    }
    
    // Sync to Supabase
    const { error } = await supabaseClient
      .from('research_jobs')
      .upsert({
        id: job.id,
        market_id: job.market_id,
        query: job.query,
        status: job.status,
        max_iterations: job.max_iterations,
        current_iteration: job.current_iteration,
        progress_log: job.progress_log,
        iterations: job.iterations,
        results: job.results,
        error_message: job.error_message,
        created_at: job.created_at,
        started_at: job.started_at,
        completed_at: job.completed_at,
        updated_at: job.updated_at,
        user_id: job.user_id,
        focus_text: job.focus_text
      });
      
    if (error) {
      throw error;
    }
    
    console.log(`Job ${jobId} synced to database`);
  } catch (error) {
    console.error(`Error syncing job ${jobId} to database:`, error);
    throw error;
  } finally {
    await closeRedisConnection();
  }
}

/**
 * Acquire a lock for a job
 */
export async function acquireJobLock(jobId: string): Promise<boolean> {
  const redis = await getRedisClient();
  
  try {
    // Try to set lock with NX option (only if not exists)
    const lockKey = `${JOB_LOCK_PREFIX}${jobId}`;
    const lockValue = Date.now().toString();
    
    const result = await redis.set(lockKey, lockValue, { nx: true, ex: LOCK_EXPIRATION });
    
    return result === "OK";
  } catch (error) {
    console.error(`Error acquiring lock for job ${jobId}:`, error);
    return false;
  } finally {
    await closeRedisConnection();
  }
}

/**
 * Release a lock for a job
 */
export async function releaseJobLock(jobId: string): Promise<void> {
  const redis = await getRedisClient();
  
  try {
    const lockKey = `${JOB_LOCK_PREFIX}${jobId}`;
    await redis.del(lockKey);
  } catch (error) {
    console.error(`Error releasing lock for job ${jobId}:`, error);
  } finally {
    await closeRedisConnection();
  }
}

/**
 * Store item in cache
 */
export async function setCache(key: string, data: any, ttlSeconds = 3600): Promise<void> {
  const redis = await getRedisClient();
  
  try {
    await redis.set(`${CACHE_PREFIX}${key}`, JSON.stringify(data), { ex: ttlSeconds });
  } catch (error) {
    console.error(`Error setting cache for ${key}:`, error);
  } finally {
    await closeRedisConnection();
  }
}

/**
 * Get item from cache
 */
export async function getCache(key: string): Promise<any | null> {
  const redis = await getRedisClient();
  
  try {
    const cachedData = await redis.get(`${CACHE_PREFIX}${key}`);
    if (!cachedData) {
      return null;
    }
    
    return JSON.parse(cachedData);
  } catch (error) {
    console.error(`Error getting cache for ${key}:`, error);
    return null;
  } finally {
    await closeRedisConnection();
  }
}
