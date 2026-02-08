import { ScrapedCompany, DuplicateMatch } from "../types/company";
import { HubspotCompany, getAllCompanies } from "./hubspot-client";

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  const matrix: number[][] = [];

  // Initialize first column
  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return matrix[s1.length][s2.length];
}

/**
 * Calculate similarity score between two strings (0-1)
 * 1 = identical, 0 = completely different
 */
function stringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;

  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 1;

  const distance = levenshteinDistance(str1, str2);
  return 1 - distance / maxLength;
}

/**
 * Normalize company name for comparison
 * Removes common prefixes, suffixes and normalizes whitespace
 */
function normalizeCompanyName(name: string): string {
  return (
    name
      .toLowerCase()
      // Remove common Swedish company prefixes (e.g., "aktiebolaget falu plast")
      .replace(
        /^(aktiebolaget|aktiebolag|handelsbolaget|handelsbolag|kommanditbolaget|kommanditbolag|enskilda\s*firman|enskild\s*firman)\s+/i,
        "",
      )
      // Remove common Swedish company suffixes
      .replace(
        /\s+(ab|aktiebolag|aktiebolaget|hb|handelsbolag|handelsbolaget|kb|kommanditbolag|kommanditbolaget|ef|ek\s*för\.?|enskild\s*firma|enskilda\s*firman)\s*$/i,
        "",
      )
      // Remove common business type indicators (prefixes)
      .replace(/^(inc\.?|ltd\.?|llc\.?|gmbh|co\.?|corp\.?)\s+/i, "")
      // Remove common business type indicators (suffixes)
      .replace(/\s+(inc\.?|ltd\.?|llc\.?|gmbh|co\.?|corp\.?)\s*$/i, "")
      // Normalize whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Normalize organization number for comparison
 * Handles formats like "556199-8484", "5561998484", " 556199-8484 ", etc.
 * Exported for use in UI and other modules
 */
export function normalizeOrgNumber(orgNumber: string): string {
  if (!orgNumber) return "";
  // Trim whitespace first, then remove all non-digit characters
  return String(orgNumber).trim().replace(/\D/g, "");
}

const NAME_SIMILARITY_THRESHOLD = 0.75;

/**
 * Find potential duplicates by comparing scraped companies with Hubspot companies
 */
export async function findDuplicates(
  scrapedCompanies: ScrapedCompany[],
  orgNumberPropertyName: string = "org_number",
): Promise<DuplicateMatch[]> {
  // Fetch all existing companies from Hubspot
  const hubspotCompanies = await getAllCompanies([
    "name",
    "domain",
    orgNumberPropertyName,
  ]);

  const duplicates: DuplicateMatch[] = [];
  const processedScrapedIndices = new Set<number>();

  // Create a map of Hubspot companies by normalized org number for quick lookup
  const hubspotByOrgNumber = new Map<string, HubspotCompany>();
  for (const company of hubspotCompanies) {
    const orgNumber = company.properties[orgNumberPropertyName];
    if (orgNumber) {
      const normalized = normalizeOrgNumber(String(orgNumber));
      // Swedish org numbers are 10 digits, but be lenient for edge cases
      if (normalized.length >= 8 && normalized.length <= 12) {
        // If multiple companies have the same org number, keep the first one
        if (!hubspotByOrgNumber.has(normalized)) {
          hubspotByOrgNumber.set(normalized, company);
        }
      }
    }
  }

  // First pass: Check for org number matches (exact)
  for (let i = 0; i < scrapedCompanies.length; i++) {
    const scraped = scrapedCompanies[i];

    if (scraped.orgNumber) {
      const normalizedOrgNum = normalizeOrgNumber(String(scraped.orgNumber));
      // Only try to match if we have a valid-looking org number
      if (normalizedOrgNum.length >= 8 && normalizedOrgNum.length <= 12) {
        const hubspotMatch = hubspotByOrgNumber.get(normalizedOrgNum);

        if (hubspotMatch) {
          duplicates.push({
            scrapedCompany: scraped,
            hubspotCompany: {
              id: hubspotMatch.id,
              name: hubspotMatch.properties.name || "Unknown",
              domain: hubspotMatch.properties.domain || undefined,
              orgNumber:
                hubspotMatch.properties[orgNumberPropertyName] || undefined,
            },
            matchType: "org_number",
          });
          processedScrapedIndices.add(i);
        }
      }
    }
  }

  // Second pass: Check for name similarity matches
  for (let i = 0; i < scrapedCompanies.length; i++) {
    // Skip if already matched by org number
    if (processedScrapedIndices.has(i)) continue;

    const scraped = scrapedCompanies[i];
    const normalizedScrapedName = normalizeCompanyName(
      scraped.organizationName,
    );

    let bestMatch: HubspotCompany | null = null;
    let bestSimilarity = 0;

    for (const hubspot of hubspotCompanies) {
      const hubspotName = hubspot.properties.name;
      if (!hubspotName) continue;

      const normalizedHubspotName = normalizeCompanyName(hubspotName);
      const similarity = stringSimilarity(
        normalizedScrapedName,
        normalizedHubspotName,
      );

      if (
        similarity >= NAME_SIMILARITY_THRESHOLD &&
        similarity > bestSimilarity
      ) {
        bestMatch = hubspot;
        bestSimilarity = similarity;
      }
    }

    if (bestMatch) {
      duplicates.push({
        scrapedCompany: scraped,
        hubspotCompany: {
          id: bestMatch.id,
          name: bestMatch.properties.name || "Unknown",
          domain: bestMatch.properties.domain || undefined,
          orgNumber: bestMatch.properties[orgNumberPropertyName] || undefined,
        },
        matchType: "name_similarity",
        similarity: bestSimilarity,
      });
    }
  }

  // Sort duplicates: org_number matches first (most reliable), then name_similarity by similarity descending
  duplicates.sort((a, b) => {
    // Org number matches come first
    if (a.matchType === "org_number" && b.matchType === "name_similarity")
      return -1;
    if (a.matchType === "name_similarity" && b.matchType === "org_number")
      return 1;

    // Within name_similarity matches, sort by similarity descending (highest first)
    if (
      a.matchType === "name_similarity" &&
      b.matchType === "name_similarity"
    ) {
      const aSim = a.similarity ?? 0;
      const bSim = b.similarity ?? 0;
      return bSim - aSim;
    }

    return 0;
  });

  return duplicates;
}

/**
 * Utility to get org number set from duplicate matches
 */
export function getDuplicateOrgNumbers(
  duplicates: DuplicateMatch[],
): Set<string> {
  const orgNumbers = new Set<string>();

  for (const dup of duplicates) {
    const normalized = normalizeOrgNumber(dup.scrapedCompany.orgNumber);
    if (normalized) {
      orgNumbers.add(normalized);
    }
  }

  return orgNumbers;
}
