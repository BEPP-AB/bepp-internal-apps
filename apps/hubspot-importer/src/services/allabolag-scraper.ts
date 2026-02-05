import * as cheerio from "cheerio";
import { ScrapedCompany, ScrapeJob } from "../types/company";

// Pool of realistic user agents to rotate
const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

// Rate limiting delay between page requests (ms)
// Base delay: 2-4 seconds with randomization
const MIN_DELAY_MS = 2000;
const MAX_DELAY_MS = 4000;

// Companies per page on AllaBolag
const COMPANIES_PER_PAGE = 10;

export interface ScrapeProgress {
  currentPage: number;
  totalPages: number;
  companiesScraped: number;
  totalCompanies: number;
  companies: ScrapedCompany[];
}

export interface ParsedFilterInfo {
  totalCompanies: number;
  totalPages: number;
  baseUrl: string;
}

/**
 * Parse the AllaBolag filter page to extract total company count and page info
 */
export async function parseFilterUrl(
  url: string
): Promise<ParsedFilterInfo | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": getRandomUserAgent(),
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract total company count from the header "80 företag"
    // Selector: h2.SearchResultList-listHeader or similar
    let totalCompanies = 0;

    // Try the specific class first
    const headerText = $('h2[class*="SearchResultList-listHeader"]').text();
    const countMatch = headerText.match(/(\d+)\s*företag/i);
    if (countMatch) {
      totalCompanies = parseInt(countMatch[1], 10);
    }

    // Fallback: look for any h2 containing "företag"
    if (totalCompanies === 0) {
      $("h2").each((_, el) => {
        const text = $(el).text();
        const match = text.match(/(\d+)\s*företag/i);
        if (match) {
          totalCompanies = parseInt(match[1], 10);
          return false; // break
        }
      });
    }

    // Calculate total pages from pagination or company count
    let totalPages = Math.ceil(totalCompanies / COMPANIES_PER_PAGE);

    // Try to get actual page count from pagination
    const paginationLinks = $('a[aria-label^="Go to page"]');
    if (paginationLinks.length > 0) {
      let maxPage = 1;
      paginationLinks.each((_, el) => {
        const label = $(el).attr("aria-label") || "";
        const pageMatch = label.match(/page\s*(\d+)/i);
        if (pageMatch) {
          const pageNum = parseInt(pageMatch[1], 10);
          if (pageNum > maxPage) maxPage = pageNum;
        }
      });
      if (maxPage > totalPages) {
        totalPages = maxPage;
      }
    }

    // Get the base URL without page parameter
    const urlObj = new URL(url);
    urlObj.searchParams.delete("page");
    const baseUrl = urlObj.toString();

    return {
      totalCompanies,
      totalPages: Math.max(1, totalPages),
      baseUrl,
    };
  } catch (error) {
    console.error("Error parsing filter URL:", error);
    return null;
  }
}

/**
 * Scrape a single page of company listings
 */
async function scrapePage(
  baseUrl: string,
  page: number,
  previousUrl?: string
): Promise<ScrapedCompany[]> {
  const url = new URL(baseUrl);
  if (page > 1) {
    url.searchParams.set("page", page.toString());
  }

  // Use previous page as referer for more realistic navigation
  const referer = previousUrl || "https://www.allabolag.se/segmentering";

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": getRandomUserAgent(),
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      Referer: referer,
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
      DNT: "1",
      Connection: "keep-alive",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch page ${page}: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const companies: ScrapedCompany[] = [];

  // Each company card has class "SegmentationSearchResultCard-card"
  $('div[class*="SegmentationSearchResultCard-card"]').each((_, cardEl) => {
    const $card = $(cardEl);

    try {
      // Company name and URL from the h2 > a link
      const $nameLink = $card.find("h2 a").first();
      const organizationName = $nameLink.text().trim();
      const companyPath = $nameLink.attr("href") || "";

      // Extract org number from the URL path (last segment before any trailing slash)
      // Format: /foretag/company-name/city/-/5565927604
      let orgNumber = "";
      const orgMatch = companyPath.match(/(\d{10})\/?$/);
      if (orgMatch) {
        // Format as XXXXXX-XXXX
        const raw = orgMatch[1];
        orgNumber = `${raw.slice(0, 6)}-${raw.slice(6)}`;
      }

      // Fallback: look for org number in text "Org.nr" followed by number
      if (!orgNumber) {
        const cardText = $card.text();
        const orgTextMatch = cardText.match(/Org\.?nr[:\s]*(\d{6})-?(\d{4})/i);
        if (orgTextMatch) {
          orgNumber = `${orgTextMatch[1]}-${orgTextMatch[2]}`;
        }
      }

      // Skip if no org number found
      if (!orgNumber || !organizationName) {
        return; // continue to next card
      }

      // Location: find the span with location icon (fa-location-dot) and get the text after it
      let zipCode = "";
      let city = "";

      $card.find('span[class*="CardHeader-propertyList"]').each((_, propEl) => {
        const $prop = $(propEl);
        // Check if this contains the location icon
        if ($prop.find('svg[data-icon="location-dot"]').length > 0) {
          const locationText = $prop.text().trim();
          // Format: "594 72 Överum" or "982 38 Gällivare" or just "Gislaved"
          const locationMatch = locationText.match(/^(\d{3}\s?\d{2})\s+(.+)$/);
          if (locationMatch) {
            zipCode = locationMatch[1].replace(/\s/, " "); // Normalize to "XXX XX"
            city = locationMatch[2].trim();
          } else {
            // No zip code, just city name
            city = locationText;
          }
        }
      });

      // Revenue and Employees from the property blocks
      let revenue: string | null = null;
      let employees: string | null = null;

      $card
        .find('div[class*="CardHeader-propertyBlock"]')
        .each((_, blockEl) => {
          const $block = $(blockEl);
          const header = $block
            .find('div[class*="CardHeader-propertyHeader"]')
            .text()
            .trim();

          // Get the value - it's the text content after the header div
          // Clone the block, remove the header, get remaining text
          const $blockClone = $block.clone();
          $blockClone.find('div[class*="CardHeader-propertyHeader"]').remove();
          const value = $blockClone.text().trim().replace(/\s/g, ""); // Remove &nbsp; and whitespace

          if (header.toLowerCase().startsWith("omsättning")) {
            revenue = value;
          } else if (header.toLowerCase() === "anställda") {
            employees = value;
          }
        });

      // Construct AllaBolag URL
      const allabolagUrl = `https://www.allabolag.se${companyPath}`;

      companies.push({
        organizationName,
        orgNumber,
        zipCode,
        city,
        revenue,
        employees,
        allabolagUrl,
      });
    } catch (error) {
      console.error("Error parsing company card:", error);
      // Continue to next card
    }
  });

  return companies;
}

/**
 * Get a random user agent from the pool
 */
function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Get a randomized delay between min and max (in ms)
 * Adds additional randomness to mimic human behavior
 */
function getRandomDelay(
  min: number = MIN_DELAY_MS,
  max: number = MAX_DELAY_MS
): number {
  // Base random delay
  const baseDelay = Math.floor(Math.random() * (max - min + 1)) + min;

  // Add occasional longer pauses (10% chance of 2x delay)
  const shouldPauseLonger = Math.random() < 0.1;
  if (shouldPauseLonger) {
    return baseDelay * 2;
  }

  return baseDelay;
}

/**
 * Sleep helper for rate limiting with randomization
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Simulate human-like reading time based on page content
 * Returns additional delay in ms
 */
function simulateReadingTime(companiesOnPage: number): number {
  // Humans take ~1-3 seconds to scan a list of 10 companies
  const baseReadTime = 1000 + Math.random() * 2000;

  // Scale slightly with number of companies
  const scaledTime = baseReadTime * (companiesOnPage / 10);

  return Math.floor(scaledTime);
}

/**
 * Scrape all companies from an AllaBolag filter URL
 * Returns an async generator for real-time progress updates
 */
export async function* scrapeAllCompanies(
  filterInfo: ParsedFilterInfo,
  onProgress?: (progress: ScrapeProgress) => Promise<void>
): AsyncGenerator<ScrapeProgress> {
  const allCompanies: ScrapedCompany[] = [];
  let currentPage = 1;
  let previousUrl: string | undefined;

  // Add initial delay to simulate user arriving at the page
  await sleep(getRandomDelay(1000, 2000));

  while (currentPage <= filterInfo.totalPages) {
    try {
      console.log(`Scraping page ${currentPage}/${filterInfo.totalPages}...`);

      const pageCompanies = await scrapePage(
        filterInfo.baseUrl,
        currentPage,
        previousUrl
      );
      allCompanies.push(...pageCompanies);

      // Simulate reading time for the page content
      const readingDelay = simulateReadingTime(pageCompanies.length);
      await sleep(readingDelay);

      const progress: ScrapeProgress = {
        currentPage,
        totalPages: filterInfo.totalPages,
        companiesScraped: allCompanies.length,
        totalCompanies: filterInfo.totalCompanies,
        companies: [...allCompanies],
      };

      if (onProgress) {
        await onProgress(progress);
      }

      yield progress;

      // Update previousUrl for next iteration's referer
      const nextUrl = new URL(filterInfo.baseUrl);
      nextUrl.searchParams.set("page", currentPage.toString());
      previousUrl = nextUrl.toString();

      // Human-like delay before next page
      if (currentPage < filterInfo.totalPages) {
        const delay = getRandomDelay();
        console.log(`Waiting ${Math.round(delay / 1000)}s before next page...`);
        await sleep(delay);
      }

      currentPage++;
    } catch (error) {
      console.error(`Error scraping page ${currentPage}:`, error);

      // On error, wait longer before retry (exponential backoff-ish)
      const errorDelay = getRandomDelay(5000, 10000);
      console.log(
        `Error encountered, waiting ${Math.round(
          errorDelay / 1000
        )}s before continuing...`
      );
      await sleep(errorDelay);

      currentPage++;
    }
  }
}

/**
 * Quick scrape for getting initial count verification
 */
export async function getFilterPreview(url: string): Promise<{
  totalCompanies: number;
  sampleCompanies: ScrapedCompany[];
} | null> {
  const filterInfo = await parseFilterUrl(url);
  if (!filterInfo) {
    return null;
  }

  // Small delay to simulate user interaction
  await sleep(getRandomDelay(500, 1500));

  // Get first page as sample
  const sampleCompanies = await scrapePage(filterInfo.baseUrl, 1);

  return {
    totalCompanies: filterInfo.totalCompanies,
    sampleCompanies: sampleCompanies.slice(0, 5),
  };
}

/**
 * Create initial job state
 */
export function createScrapeJob(jobId: string, sourceUrl: string): ScrapeJob {
  return {
    jobId,
    status: "pending",
    progress: {
      currentPage: 0,
      totalPages: 0,
      companiesScraped: 0,
      totalCompanies: 0,
    },
    companies: [],
    startedAt: Date.now(),
    sourceUrl,
  };
}
