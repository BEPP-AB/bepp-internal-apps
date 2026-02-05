import { Redis } from "@upstash/redis";
import { ScrapeJob } from "../types/company";

// Initialize Redis client from environment variables
// Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
const redis = Redis.fromEnv();

const JOBS_PREFIX = "hubspot-importer:job";

/**
 * Generate a unique job ID with human-readable timestamp
 */
export function generateJobId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  const timestamp = `${year}-${month}-${day}-${hours}-${minutes}-${seconds}`;

  return `job-${timestamp}`;
}

/**
 * Get the Redis key for a job
 */
function getJobKey(jobId: string): string {
  return `${JOBS_PREFIX}:${jobId}`;
}

/**
 * Save job (including companies) to Redis
 */
export async function saveJob(job: ScrapeJob): Promise<void> {
  const key = getJobKey(job.jobId);
  await redis.set(key, JSON.stringify(job));
}

/**
 * Load job (including companies) from Redis
 */
export async function loadJob(jobId: string): Promise<ScrapeJob | null> {
  try {
    const key = getJobKey(jobId);
    const data = await redis.get<string>(key);

    if (!data) {
      return null;
    }

    // Redis client may return parsed JSON or string depending on stored format
    if (typeof data === "string") {
      return JSON.parse(data) as ScrapeJob;
    }
    return data as unknown as ScrapeJob;
  } catch (error) {
    console.error("Error loading job:", error);
    return null;
  }
}

/**
 * Delete a job from Redis
 */
export async function deleteJob(jobId: string): Promise<void> {
  try {
    const key = getJobKey(jobId);
    await redis.del(key);
  } catch (error) {
    console.error("Error deleting job:", error);
  }
}
