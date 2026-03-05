import { NextRequest, NextResponse } from "next/server";
import { loadJob, saveJob } from "@/src/services/job-storage";

interface RouteParams {
  params: Promise<{
    jobId: string;
  }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;

    if (!jobId) {
      return NextResponse.json(
        { error: "Job ID is required" },
        { status: 400 }
      );
    }

    const job = await loadJob(jobId);

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.status !== "scraping") {
      return NextResponse.json(
        { error: `Cannot pause job with status "${job.status}"` },
        { status: 400 }
      );
    }

    await saveJob({
      ...job,
      status: "paused",
      lastUpdatedAt: Date.now(),
    });

    return NextResponse.json({
      jobId,
      status: "paused",
    });
  } catch (error) {
    console.error("Pause scrape error:", error);
    return NextResponse.json(
      { error: "Failed to pause scraping" },
      { status: 500 }
    );
  }
}
