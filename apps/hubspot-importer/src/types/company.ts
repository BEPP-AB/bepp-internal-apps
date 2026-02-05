// Company data scraped from AllaBolag
export interface ScrapedCompany {
  organizationName: string;
  orgNumber: string;
  zipCode: string;
  city: string;
  revenue: string | null; // Can be null if not disclosed
  employees: string | null; // Can be null if not disclosed
  allabolagUrl: string;
}

// Job status for scraping progress
export interface ScrapeJob {
  jobId: string;
  status: "pending" | "scraping" | "completed" | "failed";
  progress: {
    currentPage: number;
    totalPages: number;
    companiesScraped: number;
    totalCompanies: number;
  };
  companies: ScrapedCompany[];
  startedAt: number;
  completedAt?: number;
  error?: string;
  sourceUrl: string;
}

// Duplicate check result
export interface DuplicateMatch {
  scrapedCompany: ScrapedCompany;
  hubspotCompany: {
    id: string;
    name: string;
    domain?: string;
    orgNumber?: string;
  };
  matchType: "org_number" | "name_similarity";
  similarity?: number; // For name similarity matches (0-1)
}

// Field mapping for import
export interface FieldMapping {
  organizationName: string;
  orgNumber: string;
  zipCode: string;
  city: string;
  revenue: string;
  employees: string;
  allabolagUrl: string;
}

// Hubspot property definition
export interface HubspotProperty {
  name: string;
  label: string;
  type: string;
  fieldType: string;
  description?: string;
  groupName?: string;
}

// Import result
export interface ImportResult {
  success: boolean;
  created: number;
  failed: number;
  errors: Array<{
    company: ScrapedCompany;
    error: string;
  }>;
  createdIds: string[];
}
