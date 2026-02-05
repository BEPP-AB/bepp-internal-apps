import { NextResponse } from "next/server";
import { listAllJobs } from "@/src/services/job-storage";

export async function GET() {
  try {
    const jobs = await listAllJobs();

    // Return jobs with minimal data for listing (exclude companies array for performance)
    const jobSummaries = jobs.map((job) => ({
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      sourceUrl: job.sourceUrl,
      companyCount: job.companies.length,
    }));

    return NextResponse.json(jobSummaries);
  } catch (error) {
    console.error("List jobs error:", error);
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}
