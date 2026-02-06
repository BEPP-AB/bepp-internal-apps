import { Redis } from "@upstash/redis";
import { ScrapeJob } from "../types/company";

// Initialize Redis client from environment variables
// Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
const redis = Redis.fromEnv();

const JOBS_PREFIX = "hubspot-importer:job";

/**
 * Generate a unique job ID with human-readable timestamp
 * Always uses Stockholm time (Europe/Stockholm)
 */
export function generateJobId(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value || "";
  const month = parts.find((p) => p.type === "month")?.value || "";
  const day = parts.find((p) => p.type === "day")?.value || "";
  const hours = parts.find((p) => p.type === "hour")?.value || "";
  const minutes = parts.find((p) => p.type === "minute")?.value || "";
  const seconds = parts.find((p) => p.type === "second")?.value || "";

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

/**
 * List all jobs from Redis
 * Returns jobs sorted by startedAt (newest first)
 */
export async function listAllJobs(): Promise<ScrapeJob[]> {
  try {
    // Use keys command to find all job keys
    const pattern = `${JOBS_PREFIX}:*`;
    const keys = await redis.keys(pattern);

    if (!keys || keys.length === 0) {
      return [];
    }

    // Load all jobs
    const jobs = await Promise.all(
      keys.map(async (key) => {
        try {
          const data = await redis.get<string>(key);
          if (!data) {
            return null;
          }

          // Parse JSON if needed
          if (typeof data === "string") {
            return JSON.parse(data) as ScrapeJob;
          }
          return data as unknown as ScrapeJob;
        } catch (error) {
          console.error(`Error loading job from key ${key}:`, error);
          return null;
        }
      })
    );

    // Filter out null values and sort by startedAt (newest first)
    const validJobs = jobs
      .filter((job): job is ScrapeJob => job !== null)
      .sort((a, b) => b.startedAt - a.startedAt);

    return validJobs;
  } catch (error) {
    console.error("Error listing jobs:", error);
    return [];
  }
}
