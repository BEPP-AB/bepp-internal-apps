import { put, list, del } from "@vercel/blob";
import { ScrapeJob, ScrapedCompany } from "../types/company";

const JOBS_PREFIX = "hubspot-importer/jobs";

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
 * Get the blob path for a job's status file
 */
function getStatusPath(jobId: string): string {
  return `${JOBS_PREFIX}/${jobId}/status.json`;
}

/**
 * Get the blob path for a job's companies file
 */
function getCompaniesPath(jobId: string): string {
  return `${JOBS_PREFIX}/${jobId}/companies.json`;
}

/**
 * Save job status to blob storage
 */
export async function saveJobStatus(job: ScrapeJob): Promise<void> {
  const path = getStatusPath(job.jobId);
  await put(path, JSON.stringify(job), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

/**
 * Save scraped companies to blob storage
 */
export async function saveCompanies(
  jobId: string,
  companies: ScrapedCompany[]
): Promise<void> {
  const path = getCompaniesPath(jobId);
  await put(path, JSON.stringify(companies), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

/**
 * Load job status from blob storage
 */
export async function loadJobStatus(jobId: string): Promise<ScrapeJob | null> {
  try {
    const path = getStatusPath(jobId);

    // Use list() instead of head() to get fresh data
    const { blobs } = await list({ prefix: path });

    if (blobs.length === 0) {
      return null;
    }

    // Get the first (and should be only) matching blob
    const blob = blobs[0];

    // Add cache-busting query param to avoid CDN caching
    const urlWithCacheBust = `${blob.url}${
      blob.url.includes("?") ? "&" : "?"
    }_t=${Date.now()}`;
    const response = await fetch(urlWithCacheBust, {
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as ScrapeJob;
  } catch (error) {
    console.error("Error loading job status:", error);
    return null;
  }
}

/**
 * Load scraped companies from blob storage
 */
export async function loadCompanies(
  jobId: string
): Promise<ScrapedCompany[] | null> {
  try {
    const path = getCompaniesPath(jobId);

    // Use list() instead of head() to get fresh data
    const { blobs } = await list({ prefix: path });

    if (blobs.length === 0) {
      return null;
    }

    // Get the first (and should be only) matching blob
    const blob = blobs[0];

    // Add cache-busting query param to avoid CDN caching
    const urlWithCacheBust = `${blob.url}${
      blob.url.includes("?") ? "&" : "?"
    }_t=${Date.now()}`;
    const response = await fetch(urlWithCacheBust, {
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as ScrapedCompany[];
  } catch (error) {
    console.error("Error loading companies:", error);
    return null;
  }
}

/**
 * Delete a job and its data from blob storage
 */
export async function deleteJob(jobId: string): Promise<void> {
  try {
    await Promise.all([
      del(getStatusPath(jobId)),
      del(getCompaniesPath(jobId)),
    ]);
  } catch (error) {
    console.error("Error deleting job:", error);
  }
}
