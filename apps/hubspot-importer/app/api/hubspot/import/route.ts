import { NextRequest, NextResponse } from "next/server";
import { batchCreateCompanies } from "@/src/services/hubspot-client";
import { ScrapedCompany, FieldMapping } from "@/src/types/company";

interface ImportRequest {
  companies: ScrapedCompany[];
  fieldMapping: FieldMapping;
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

    // Import companies
    const result = await batchCreateCompanies(
      body.companies,
      body.fieldMapping
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to import companies",
      },
      { status: 500 }
    );
  }
}
