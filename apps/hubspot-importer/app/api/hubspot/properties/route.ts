import { NextResponse } from "next/server";
import { getCompanyProperties } from "@/src/services/hubspot-client";

export async function GET() {
  try {
    const properties = await getCompanyProperties();

    // Group properties by groupName for easier UI rendering
    const grouped = properties.reduce((acc, prop) => {
      const group = prop.groupName || "other";
      if (!acc[group]) {
        acc[group] = [];
      }
      acc[group].push(prop);
      return acc;
    }, {} as Record<string, typeof properties>);

    // Sort each group by label
    for (const group of Object.keys(grouped)) {
      grouped[group].sort((a, b) => a.label.localeCompare(b.label));
    }

    return NextResponse.json({
      properties,
      grouped,
      totalCount: properties.length,
    });
  } catch (error) {
    console.error("Hubspot properties error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch Hubspot properties",
      },
      { status: 500 }
    );
  }
}
