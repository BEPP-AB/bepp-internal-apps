import { NextRequest, NextResponse } from "next/server";
import {
  parseFilterUrl,
  scrapeAllCompanies,
  createScrapeJob,
} from "@/src/services/allabolag-scraper";
import { generateJobId, saveJob } from "@/src/services/job-storage";
import { ScrapeJob, ScrapedCompany } from "@/src/types/company";

export const maxDuration = 300; // 5 minutes max for Vercel

interface StartScrapeRequest {
  url: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: StartScrapeRequest = await request.json();

    if (!body.url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Validate URL is from allabolag.se
    const url = new URL(body.url);
    if (!url.hostname.includes("allabolag.se")) {
      return NextResponse.json(
        { error: "URL must be from allabolag.se" },
        { status: 400 }
      );
    }

    // Parse the filter URL to get total count and pages
    const filterInfo = await parseFilterUrl(body.url);

    if (!filterInfo) {
      return NextResponse.json(
        { error: "Could not parse filter URL. Please check the URL is valid." },
        { status: 400 }
      );
    }

    // Generate a new job ID
    const jobId = generateJobId();

    // Create initial job state
    const job: ScrapeJob = {
      ...createScrapeJob(jobId, body.url),
      status: "scraping",
      progress: {
        currentPage: 0,
        totalPages: filterInfo.totalPages,
        companiesScraped: 0,
        totalCompanies: filterInfo.totalCompanies,
      },
      companies: [],
    };

    // Save initial job state
    await saveJob(job);

    // Start scraping in the background
    // Note: This runs within the same request context but streams progress
    (async () => {
      // Track the final progress from the generator loop
      let finalProgress = {
        currentPage: 0,
        totalPages: filterInfo.totalPages,
        companiesScraped: 0,
        totalCompanies: filterInfo.totalCompanies,
      };
      let finalCompanies: ScrapedCompany[] = [];

      try {
        for await (const progress of scrapeAllCompanies(filterInfo)) {
          // Update tracked progress
          finalProgress = {
            currentPage: progress.currentPage,
            totalPages: progress.totalPages,
            companiesScraped: progress.companiesScraped,
            totalCompanies: progress.totalCompanies,
          };
          finalCompanies = progress.companies;

          // Save job with updated progress and companies
          await saveJob({
            ...job,
            status: "scraping",
            progress: finalProgress,
            companies: finalCompanies,
          });
        }

        // Mark job as completed after loop finishes
        await saveJob({
          ...job,
          status: "completed",
          completedAt: Date.now(),
          progress: finalProgress,
          companies: finalCompanies,
        });
      } catch (error) {
        console.error("Scraping error:", error);

        // Mark job as failed
        await saveJob({
          ...job,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
          completedAt: Date.now(),
          companies: finalCompanies,
        });
      }
    })();

    // Return immediately with job ID
    return NextResponse.json({
      jobId,
      status: "scraping",
      totalCompanies: filterInfo.totalCompanies,
      totalPages: filterInfo.totalPages,
    });
  } catch (error) {
    console.error("Start scrape error:", error);
    return NextResponse.json(
      { error: "Failed to start scraping" },
      { status: 500 }
    );
  }
}

// Preview endpoint - get company count without starting a full scrape
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "URL parameter is required" },
      { status: 400 }
    );
  }

  try {
    const filterInfo = await parseFilterUrl(url);

    if (!filterInfo) {
      return NextResponse.json(
        { error: "Could not parse filter URL" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      totalCompanies: filterInfo.totalCompanies,
      totalPages: filterInfo.totalPages,
    });
  } catch (error) {
    console.error("Preview error:", error);
    return NextResponse.json(
      { error: "Failed to preview filter" },
      { status: 500 }
    );
  }
}
