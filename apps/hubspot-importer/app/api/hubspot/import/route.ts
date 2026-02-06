import { NextRequest, NextResponse } from "next/server";
import {
  batchCreateCompanies,
  ensureDropdownOption,
  createJobFilteredView,
} from "@/src/services/hubspot-client";
import { ScrapedCompany, FieldMapping } from "@/src/types/company";
import { loadJob, saveJob } from "@/src/services/job-storage";

interface ImportRequest {
  companies: ScrapedCompany[];
  fieldMapping: FieldMapping;
  jobId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ImportRequest = await request.json();

    if (!body.companies || !Array.isArray(body.companies)) {
      return NextResponse.json(
        { error: "Companies array is required" },
        { status: 400 }
      );
    }

    if (!body.fieldMapping) {
      return NextResponse.json(
        { error: "Field mapping is required" },
        { status: 400 }
      );
    }

    if (body.companies.length === 0) {
      return NextResponse.json({
        success: true,
        created: 0,
        failed: 0,
        errors: [],
        createdIds: [],
      });
    }

    // Validate that at least one field is mapped
    const hasValidMapping = Object.values(body.fieldMapping).some(
      (v) => v && v.trim() !== ""
    );

    if (!hasValidMapping) {
      return NextResponse.json(
        { error: "At least one field must be mapped" },
        { status: 400 }
      );
    }

    // Ensure Source dropdown option exists if jobId is provided
    if (body.jobId) {
      const sourceValue = `bepp-hubspot-importer-${body.jobId}`;
      try {
        await ensureDropdownOption("kalla", sourceValue, sourceValue);
      } catch (error) {
        console.error("Error ensuring Source dropdown option:", error);
        return NextResponse.json(
          {
            error: `Failed to create Source dropdown option: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
          { status: 500 }
        );
      }
    }

    // Import companies
    const result = await batchCreateCompanies(
      body.companies,
      body.fieldMapping,
      body.jobId
    );

    // Create a filtered view for this job if jobId is provided
    if (body.jobId && result.success) {
      try {
        const viewId = await createJobFilteredView(body.jobId);
        result.viewId = viewId;
      } catch (error) {
        console.error("Error creating filtered view:", error);
        // Don't fail the import if view creation fails
        result.viewId = null;
      }

      // Update job status to "import complete" after successful import
      try {
        const job = await loadJob(body.jobId);
        if (job) {
          await saveJob({
            ...job,
            status: "import complete",
            completedAt: Date.now(),
          });
        }
      } catch (error) {
        console.error("Error updating job status:", error);
        // Don't fail the import if status update fails
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to import companies",
      },
      { status: 500 }
    );
  }
}
