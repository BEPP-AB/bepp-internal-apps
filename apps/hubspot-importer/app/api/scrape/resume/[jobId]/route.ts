import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import {
  parseFilterUrl,
  scrapeAllCompanies,
} from "@/src/services/allabolag-scraper";
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

    if (job.status !== "scraping" && job.status !== "failed" && job.status !== "paused") {
      return NextResponse.json(
        { error: `Cannot resume job with status "${job.status}"` },
        { status: 400 }
      );
    }

    // Re-parse the source URL to get filter info
    const filterInfo = await parseFilterUrl(job.sourceUrl);

    if (!filterInfo) {
      return NextResponse.json(
        {
          error:
            "Could not parse the original source URL. The filter may no longer be valid.",
        },
        { status: 400 }
      );
    }

    // Resume from currentPage (not +1, to catch partially scraped pages)
    const resumeFromPage = Math.max(1, job.progress.currentPage);
    const existingCompanies = [...job.companies];

    // Build dedup set from existing companies
    const existingOrgNumbers = new Set(
      existingCompanies.map((c) => c.orgNumber)
    );

    // Update job status to scraping
    await saveJob({
      ...job,
      status: "scraping",
      error: undefined,
      completedAt: undefined,
      lastUpdatedAt: Date.now(),
    });

    // Start scraping in background
    after(async () => {
      let finalProgress = {
        currentPage: job.progress.currentPage,
        totalPages: filterInfo.totalPages,
        companiesScraped: existingCompanies.length,
        totalCompanies: filterInfo.totalCompanies,
      };
      let allCompanies = [...existingCompanies];

      try {
        for await (const progress of scrapeAllCompanies(
          filterInfo,
          resumeFromPage
        )) {
          // Check if job was paused externally
          const currentJob = await loadJob(jobId);
          if (currentJob?.status === "paused") {
            const newCompanies = progress.companies.filter(
              (c) => !existingOrgNumbers.has(c.orgNumber)
            );
            allCompanies = [...existingCompanies, ...newCompanies];
            finalProgress = {
              currentPage: progress.currentPage,
              totalPages: progress.totalPages,
              companiesScraped: allCompanies.length,
              totalCompanies: filterInfo.totalCompanies,
            };
            await saveJob({
              ...job,
              status: "paused",
              progress: finalProgress,
              companies: allCompanies,
              lastUpdatedAt: Date.now(),
            });
            return;
          }

          // Deduplicate: progress.companies is cumulative within the resumed run,
          // so filter against the fixed set of pre-resume org numbers
          const newCompanies = progress.companies.filter(
            (c) => !existingOrgNumbers.has(c.orgNumber)
          );

          allCompanies = [...existingCompanies, ...newCompanies];

          finalProgress = {
            currentPage: progress.currentPage,
            totalPages: progress.totalPages,
            companiesScraped: allCompanies.length,
            totalCompanies: filterInfo.totalCompanies,
          };

          await saveJob({
            ...job,
            status: "scraping",
            progress: finalProgress,
            companies: allCompanies,
            lastUpdatedAt: Date.now(),
          });
        }

        // Mark as complete
        await saveJob({
          ...job,
          status: "scrape complete",
          completedAt: Date.now(),
          progress: finalProgress,
          companies: allCompanies,
          lastUpdatedAt: Date.now(),
        });
      } catch (error) {
        console.error("Resume scraping error:", error);

        await saveJob({
          ...job,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
          completedAt: Date.now(),
          progress: finalProgress,
          companies: allCompanies,
          lastUpdatedAt: Date.now(),
        });
      }
    });

    return NextResponse.json({
      jobId,
      resumedFromPage: resumeFromPage,
      existingCompanyCount: existingCompanies.length,
      status: "scraping",
    });
  } catch (error) {
    console.error("Resume scrape error:", error);
    return NextResponse.json(
      { error: "Failed to resume scraping" },
      { status: 500 }
    );
  }
}
