import { NextRequest, NextResponse } from "next/server";
import { loadJobStatus, loadCompanies } from "@/src/services/job-storage";

interface RouteParams {
  params: Promise<{
    jobId: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;

    if (!jobId) {
      return NextResponse.json(
        { error: "Job ID is required" },
        { status: 400 }
      );
    }

    // Load job status and companies in parallel
    const [job, companies] = await Promise.all([
      loadJobStatus(jobId),
      loadCompanies(jobId),
    ]);

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const companiesList = companies || [];

    // Derive companiesScraped from the actual companies array
    // This is more reliable than depending on status blob being in sync
    const actualCompaniesScraped = companiesList.length;

    // Calculate pages scraped based on companies (10 per page)
    const companiesPerPage = 10;
    const actualPagesScraped = Math.ceil(
      actualCompaniesScraped / companiesPerPage
    );

    // Use the actual count if it's higher than what status reports
    // (handles case where companies blob is updated but status blob is stale)
    const progress = {
      ...job.progress,
      companiesScraped: Math.max(
        job.progress.companiesScraped,
        actualCompaniesScraped
      ),
      currentPage: Math.max(job.progress.currentPage, actualPagesScraped),
    };

    return NextResponse.json({
      jobId: job.jobId,
      status: job.status,
      progress,
      companies: companiesList,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      sourceUrl: job.sourceUrl,
    });
  } catch (error) {
    console.error("Status check error:", error);
    return NextResponse.json(
      { error: "Failed to get job status" },
      { status: 500 }
    );
  }
}
