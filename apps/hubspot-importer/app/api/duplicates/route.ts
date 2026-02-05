import { NextRequest, NextResponse } from "next/server";
import { findDuplicates } from "@/src/services/duplicate-matcher";
import { ScrapedCompany } from "@/src/types/company";

interface DuplicatesRequest {
  companies: ScrapedCompany[];
  orgNumberPropertyName?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: DuplicatesRequest = await request.json();

    if (!body.companies || !Array.isArray(body.companies)) {
      return NextResponse.json(
        { error: "Companies array is required" },
        { status: 400 }
      );
    }

    if (body.companies.length === 0) {
      return NextResponse.json({
        duplicates: [],
        totalChecked: 0,
        duplicatesFound: 0,
      });
    }

    // Default org number property name
    const orgNumberPropertyName = body.orgNumberPropertyName || "org_number";

    // Find duplicates
    const duplicates = await findDuplicates(
      body.companies,
      orgNumberPropertyName
    );

    // Group by match type for reporting
    const byOrgNumber = duplicates.filter((d) => d.matchType === "org_number");
    const byNameSimilarity = duplicates.filter(
      (d) => d.matchType === "name_similarity"
    );

    return NextResponse.json({
      duplicates,
      totalChecked: body.companies.length,
      duplicatesFound: duplicates.length,
      matchTypes: {
        byOrgNumber: byOrgNumber.length,
        byNameSimilarity: byNameSimilarity.length,
      },
    });
  } catch (error) {
    console.error("Duplicate check error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to check for duplicates",
      },
      { status: 500 }
    );
  }
}
