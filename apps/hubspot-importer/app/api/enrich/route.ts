import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { batchUpdateCompanies } from "@/src/services/hubspot-client";

interface EnrichRequest {
  companyIds: string[];
  allabolagUrls: Record<string, string>; // companyId -> allabolag URL
  fieldsToEnrich: string[]; // e.g., ["website"]
  websitePropertyName?: string;
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Scrape company website from AllaBolag detail page
 */
async function scrapeWebsite(allabolagUrl: string): Promise<string | null> {
  try {
    const response = await fetch(allabolagUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Look for website link on the company page
    // AllaBolag typically shows this in contact info section
    const websiteSelectors = [
      'a[href^="http"]:contains("hemsida")',
      'a[href^="http"]:contains("webb")',
      'a[rel="nofollow"][href^="http"]',
      '.company-contact a[href^="http"]',
      '.contact-info a[href^="http"]',
    ];

    for (const selector of websiteSelectors) {
      const link = $(selector).first();
      if (link.length > 0) {
        const href = link.attr("href");
        if (href && !href.includes("allabolag.se")) {
          return href;
        }
      }
    }

    // Fallback: Look for any external links that look like company websites
    let website: string | null = null;
    $('a[href^="http"]').each((_, el) => {
      const href = $(el).attr("href");
      if (
        href &&
        !href.includes("allabolag.se") &&
        !href.includes("facebook.com") &&
        !href.includes("linkedin.com") &&
        !href.includes("twitter.com") &&
        !href.includes("instagram.com")
      ) {
        website = href;
        return false; // break
      }
    });

    return website;
  } catch (error) {
    console.error("Error scraping website:", error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: EnrichRequest = await request.json();

    if (!body.companyIds || !Array.isArray(body.companyIds)) {
      return NextResponse.json(
        { error: "Company IDs array is required" },
        { status: 400 }
      );
    }

    if (!body.allabolagUrls || typeof body.allabolagUrls !== "object") {
      return NextResponse.json(
        { error: "AllaBolag URLs mapping is required" },
        { status: 400 }
      );
    }

    const websitePropertyName = body.websitePropertyName || "website";
    const updates: Array<{ id: string; properties: Record<string, string> }> =
      [];

    // Scrape websites for each company
    for (const companyId of body.companyIds) {
      const allabolagUrl = body.allabolagUrls[companyId];

      if (!allabolagUrl) {
        continue;
      }

      const properties: Record<string, string> = {};

      // Scrape website if requested
      if (body.fieldsToEnrich.includes("website")) {
        const website = await scrapeWebsite(allabolagUrl);
        if (website) {
          properties[websitePropertyName] = website;
        }
      }

      if (Object.keys(properties).length > 0) {
        updates.push({ id: companyId, properties });
      }

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (updates.length === 0) {
      return NextResponse.json({
        success: true,
        updated: 0,
        failed: 0,
        message: "No data found to enrich",
      });
    }

    // Update companies in Hubspot
    const result = await batchUpdateCompanies(updates);

    return NextResponse.json({
      success: result.failed === 0,
      updated: result.success,
      failed: result.failed,
      totalProcessed: body.companyIds.length,
    });
  } catch (error) {
    console.error("Enrich error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to enrich companies",
      },
      { status: 500 }
    );
  }
}
