"use client";

import { useState, useCallback } from "react";
import {
  ScrapedCompany,
  DuplicateMatch,
  HubspotProperty,
  FieldMapping,
  ImportResult,
} from "@/src/types/company";
import { normalizeOrgNumber } from "@/src/services/duplicate-matcher";
import {
  MIN_DELAY_MS,
  MAX_DELAY_MS,
  INITIAL_DELAY_MIN_MS,
  INITIAL_DELAY_MAX_MS,
  MIN_READ_TIME_MS,
  MAX_READ_TIME_MS,
} from "@/src/services/allabolag-scraper";

type Step =
  | "input"
  | "scraping"
  | "duplicates"
  | "mapping"
  | "importing"
  | "complete";

type ViewMode = "import" | "previous" | "enrich";

interface ScrapeStatus {
  jobId: string;
  status: "pending" | "scraping" | "completed" | "failed";
  progress: {
    currentPage: number;
    totalPages: number;
    companiesScraped: number;
    totalCompanies: number;
  };
  companies: ScrapedCompany[];
  error?: string;
  sourceUrl?: string;
  startedAt?: number;
  completedAt?: number;
}

interface DuplicatesResponse {
  duplicates: DuplicateMatch[];
  totalChecked: number;
  duplicatesFound: number;
  matchTypes: {
    byOrgNumber: number;
    byNameSimilarity: number;
  };
}

interface PropertiesResponse {
  properties: HubspotProperty[];
  grouped: Record<string, HubspotProperty[]>;
  totalCount: number;
}

interface JobSummary {
  jobId: string;
  status: "pending" | "scraping" | "completed" | "failed";
  progress: {
    currentPage: number;
    totalPages: number;
    companiesScraped: number;
    totalCompanies: number;
  };
  startedAt: number;
  completedAt?: number;
  error?: string;
  sourceUrl: string;
  companyCount: number;
}

// Default field mapping suggestions
const DEFAULT_MAPPING: FieldMapping = {
  organizationName: "name",
  orgNumber: "organisation_number_swedish_bolagsverket",
  zipCode: "zip",
  city: "city",
  revenue: "annualrevenue",
  employees: "numberofemployees",
  allabolagUrl: "allabolag_link",
};

export default function HubspotImporterPage() {
  // Password protection
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // View mode management
  const [viewMode, setViewMode] = useState<ViewMode>("import");

  // Step management
  const [currentStep, setCurrentStep] = useState<Step>("input");

  // URL input step
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{
    totalCompanies: number;
    totalPages: number;
  } | null>(null);

  // Scraping step
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus | null>(null);

  // Duplicates step
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [confirmedDuplicates, setConfirmedDuplicates] = useState<Set<string>>(
    new Set()
  );
  const [duplicateLoading, setDuplicateLoading] = useState(false);

  // Mapping step
  const [hubspotProperties, setHubspotProperties] = useState<HubspotProperty[]>(
    []
  );
  const [fieldMapping, setFieldMapping] =
    useState<FieldMapping>(DEFAULT_MAPPING);
  const [skippedFields, setSkippedFields] = useState<Set<keyof FieldMapping>>(
    new Set()
  );
  const [propertiesLoading, setPropertiesLoading] = useState(false);

  // Import step
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  // Jobs list
  const [jobsList, setJobsList] = useState<JobSummary[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  // Get companies to import (filtered by confirmed duplicates)
  const companiesToImport =
    scrapeStatus?.companies.filter(
      (company) =>
        !confirmedDuplicates.has(normalizeOrgNumber(company.orgNumber))
    ) || [];

  // Validate URL
  const validateUrl = (inputUrl: string): boolean => {
    try {
      const parsed = new URL(inputUrl);
      if (!parsed.hostname.includes("allabolag.se")) {
        setUrlError("URL must be from allabolag.se");
        return false;
      }
      setUrlError("");
      return true;
    } catch {
      setUrlError("Please enter a valid URL");
      return false;
    }
  };

  // Preview URL to get company count
  const previewUrl = async () => {
    if (!validateUrl(url)) return;

    setPreviewLoading(true);
    setPreviewData(null);

    try {
      const response = await fetch(
        `/api/scrape/start?url=${encodeURIComponent(url)}`
      );
      const data = await response.json();

      if (data.error) {
        setUrlError(data.error);
      } else {
        setPreviewData({
          totalCompanies: data.totalCompanies,
          totalPages: data.totalPages,
        });
      }
    } catch {
      setUrlError("Failed to preview URL");
    } finally {
      setPreviewLoading(false);
    }
  };

  // Start scraping
  const startScraping = async () => {
    if (!validateUrl(url)) return;

    setCurrentStep("scraping");
    setScrapeStatus(null);

    try {
      const response = await fetch("/api/scrape/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (data.error) {
        setUrlError(data.error);
        setCurrentStep("input");
        return;
      }

      // Start polling for status
      pollScrapeStatus(data.jobId);
    } catch {
      setUrlError("Failed to start scraping");
      setCurrentStep("input");
    }
  };

  // Poll scrape status
  const pollScrapeStatus = useCallback(async (jobId: string) => {
    const poll = async () => {
      try {
        const response = await fetch(`/api/scrape/status/${jobId}`);
        const data: ScrapeStatus = await response.json();

        setScrapeStatus(data);

        if (data.status === "scraping" || data.status === "pending") {
          // Continue polling
          setTimeout(poll, 2000);
        }
      } catch (error) {
        console.error("Status poll error:", error);
        setTimeout(poll, 5000); // Retry with longer delay on error
      }
    };

    poll();
  }, []);

  // Check for duplicates
  const checkDuplicates = async () => {
    if (!scrapeStatus?.companies.length) return;

    setDuplicateLoading(true);
    setCurrentStep("duplicates");

    try {
      const response = await fetch("/api/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companies: scrapeStatus.companies,
          orgNumberPropertyName:
            fieldMapping.orgNumber ||
            "organisation_number_swedish_bolagsverket",
        }),
      });

      const data: DuplicatesResponse = await response.json();

      setDuplicates(data.duplicates);

      // Pre-select duplicates to skip by default:
      // - All org_number matches (most reliable)
      // - Name similarity matches with similarity > 0.85
      const confirmed = new Set<string>();
      data.duplicates.forEach((d) => {
        const shouldCheck =
          d.matchType === "org_number" ||
          (d.matchType === "name_similarity" && (d.similarity ?? 0) > 0.85);
        if (shouldCheck) {
          confirmed.add(normalizeOrgNumber(d.scrapedCompany.orgNumber));
        }
      });
      setConfirmedDuplicates(confirmed);
    } catch (err) {
      console.error("Duplicate check error:", err);
    } finally {
      setDuplicateLoading(false);
    }
  };

  // Toggle duplicate confirmation
  const toggleDuplicate = (
    orgNumber: string,
    matchType?: "org_number" | "name_similarity"
  ) => {
    // Prevent toggling org number matches - they should always be excluded
    if (matchType === "org_number") {
      return;
    }
    const normalized = normalizeOrgNumber(orgNumber);
    setConfirmedDuplicates((prev) => {
      const next = new Set(prev);
      if (next.has(normalized)) {
        next.delete(normalized);
      } else {
        next.add(normalized);
      }
      return next;
    });
  };

  // Proceed to mapping
  const proceedToMapping = async () => {
    setPropertiesLoading(true);
    setCurrentStep("mapping");

    try {
      const response = await fetch("/api/hubspot/properties");
      const data: PropertiesResponse = await response.json();

      setHubspotProperties(data.properties);

      // Validate field mapping - clear any default values that don't exist in HubSpot
      const validPropertyNames = new Set(data.properties.map((p) => p.name));
      setFieldMapping((prev) => {
        const validated: FieldMapping = { ...prev };
        for (const key of Object.keys(validated) as (keyof FieldMapping)[]) {
          // Non-editable fields: orgNumber and allabolagUrl must always be mapped
          const isNonEditable = key === "orgNumber" || key === "allabolagUrl";

          if (isNonEditable) {
            // Ensure non-editable fields have their default mappings
            if (key === "orgNumber" && !validated[key]) {
              validated[key] = "org_number";
            } else if (key === "allabolagUrl" && !validated[key]) {
              validated[key] = "allabolag_url";
            }
            // If the mapped property doesn't exist, keep the default anyway
            // (it will be created if needed)
          } else {
            // For editable fields, clear if property doesn't exist
            if (validated[key] && !validPropertyNames.has(validated[key])) {
              validated[key] = ""; // Set to empty string (Skip) if property doesn't exist
            }
          }
        }
        return validated;
      });

      // Ensure non-editable fields are never skipped
      setSkippedFields((prev) => {
        const next = new Set(prev);
        next.delete("orgNumber");
        next.delete("allabolagUrl");
        return next;
      });
    } catch (error) {
      console.error("Properties fetch error:", error);
    } finally {
      setPropertiesLoading(false);
    }
  };

  // Update field mapping
  const updateMapping = (field: keyof FieldMapping, value: string) => {
    // Prevent changes to non-editable fields
    if (field === "orgNumber" || field === "allabolagUrl") {
      return;
    }
    setFieldMapping((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Start import
  const startImport = async () => {
    setImportLoading(true);
    setCurrentStep("importing");

    try {
      const response = await fetch("/api/hubspot/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companies: companiesToImport,
          fieldMapping,
          jobId: scrapeStatus?.jobId,
        }),
      });

      const data = await response.json();

      // Check if the response is an error
      if (!response.ok || data.error) {
        setImportResult({
          success: false,
          created: 0,
          failed: companiesToImport.length,
          errors: [
            {
              company: companiesToImport[0] || {
                organizationName: "Unknown",
                orgNumber: "",
                zipCode: "",
                city: "",
                revenue: null,
                employees: null,
                allabolagUrl: "",
              },
              error:
                data.error || `HTTP ${response.status}: ${response.statusText}`,
            },
          ],
          createdIds: [],
        });
      } else {
        // Ensure errors array exists
        const result: ImportResult = {
          ...data,
          errors: data.errors || [],
          createdIds: data.createdIds || [],
        };
        setImportResult(result);
      }
      setCurrentStep("complete");
    } catch (error) {
      console.error("Import error:", error);
      setImportResult({
        success: false,
        created: 0,
        failed: companiesToImport.length,
        errors: [
          {
            company: companiesToImport[0] || {
              organizationName: "Unknown",
              orgNumber: "",
              zipCode: "",
              city: "",
              revenue: null,
              employees: null,
              allabolagUrl: "",
            },
            error:
              error instanceof Error
                ? error.message
                : "Failed to import companies",
          },
        ],
        createdIds: [],
      });
      setCurrentStep("complete");
    } finally {
      setImportLoading(false);
    }
  };

  // Fetch all jobs
  const fetchJobs = async () => {
    setJobsLoading(true);
    try {
      const response = await fetch("/api/scrape/jobs");
      const data = await response.json();
      if (data.error) {
        console.error("Error fetching jobs:", data.error);
      } else {
        setJobsList(data);
      }
    } catch (error) {
      console.error("Error fetching jobs:", error);
    } finally {
      setJobsLoading(false);
    }
  };

  // Load jobs when switching to previous imports view
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === "previous") {
      fetchJobs();
    }
  };

  // Load a specific job
  const loadJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/scrape/status/${jobId}`);
      const data: ScrapeStatus = await response.json();

      if (data.error) {
        console.error("Error loading job:", data.error);
        return;
      }

      setScrapeStatus(data);
      setUrl(data.sourceUrl || "");
      setCurrentStep("scraping");

      // If job is completed, allow user to proceed
      if (data.status === "completed") {
        // User can proceed to duplicates step
      } else if (data.status === "scraping" || data.status === "pending") {
        // Continue polling
        pollScrapeStatus(jobId);
      }
    } catch (error) {
      console.error("Error loading job:", error);
    }
  };

  // Format date
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // Format duration
  const formatDuration = (startedAt: number, completedAt?: number): string => {
    const end = completedAt || Date.now();
    const duration = Math.floor((end - startedAt) / 1000);
    if (duration < 60) {
      return `${duration}s`;
    }
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}m ${seconds}s`;
  };

  // Reset and start over
  const resetAll = () => {
    setCurrentStep("input");
    setUrl("");
    setUrlError("");
    setPreviewData(null);
    setScrapeStatus(null);
    setDuplicates([]);
    setConfirmedDuplicates(new Set());
    setFieldMapping(DEFAULT_MAPPING);
    setImportResult(null);
  };

  // Progress percentage based on companies scraped
  const scrapeProgress = scrapeStatus
    ? Math.round(
        (scrapeStatus.progress.companiesScraped /
          Math.max(1, scrapeStatus.progress.totalCompanies)) *
          100
      )
    : 0;

  // Handle password submission
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");

    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setIsAuthenticated(true);
        setPassword("");
      } else {
        setPasswordError(data.error || "Invalid password");
        setPassword("");
      }
    } catch {
      setPasswordError("Failed to verify password. Please try again.");
    }
  };

  // Calculate estimated time based on scraper delay constants
  // Uses average values from the scraper constants
  const estimateTotalTime = (totalPages: number): number => {
    if (totalPages === 0) return 0;

    // Calculate average delays (in seconds)
    const avgInitialDelay =
      (INITIAL_DELAY_MIN_MS + INITIAL_DELAY_MAX_MS) / 2 / 1000;
    const avgReadingTime = (MIN_READ_TIME_MS + MAX_READ_TIME_MS) / 2 / 1000;
    const avgPageDelay = (MIN_DELAY_MS + MAX_DELAY_MS) / 2 / 1000;

    if (totalPages === 1) {
      // Initial delay + reading time for single page
      return Math.ceil(avgInitialDelay + avgReadingTime);
    }

    // Initial delay + (N-1) pages with reading + delay + final page reading
    const totalTime =
      avgInitialDelay +
      (totalPages - 1) * (avgReadingTime + avgPageDelay) +
      avgReadingTime;

    return Math.ceil(totalTime);
  };

  const estimateRemainingTime = (
    companiesScraped: number,
    totalCompanies: number
  ): number => {
    const remainingCompanies = totalCompanies - companiesScraped;
    if (remainingCompanies <= 0) return 0;

    // Calculate remaining pages (10 companies per page)
    const companiesPerPage = 10;
    const remainingPages = Math.ceil(remainingCompanies / companiesPerPage);

    // Calculate average delays (in seconds)
    const avgReadingTime = (MIN_READ_TIME_MS + MAX_READ_TIME_MS) / 2 / 1000;
    const avgPageDelay = (MIN_DELAY_MS + MAX_DELAY_MS) / 2 / 1000;

    if (remainingPages === 1) {
      // Just reading time for last page
      return Math.ceil(avgReadingTime);
    }

    // (remainingPages - 1) pages with reading + delay + final page reading
    const totalTime =
      (remainingPages - 1) * (avgReadingTime + avgPageDelay) + avgReadingTime;

    return Math.ceil(totalTime);
  };

  // Show password prompt if not authenticated
  if (!isAuthenticated) {
    return (
      <main className="app">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "24px",
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "400px",
              width: "100%",
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: "8px" }}>
              Password Required
            </h2>
            <p
              style={{
                color: "var(--text-secondary)",
                marginBottom: "24px",
                fontSize: "0.95rem",
              }}
            >
              Please enter the password to access this application.
            </p>
            <form onSubmit={handlePasswordSubmit}>
              <div className="form-group">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError("");
                  }}
                  placeholder="Enter password"
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    fontSize: "1rem",
                    border: `1px solid ${
                      passwordError ? "var(--error)" : "var(--border-color)"
                    }`,
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "var(--bg-input)",
                    color: "var(--text-primary)",
                  }}
                  autoFocus
                />
                {passwordError && (
                  <span
                    className="error-text"
                    style={{ display: "block", marginTop: "8px" }}
                  >
                    {passwordError}
                  </span>
                )}
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: "100%", marginTop: "16px" }}
                disabled={!password}
              >
                Access Application
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      {/* Hero Image */}
      <section className="hero-section">
        <img
          src="/images/hubspot-importer-hero.png"
          alt="Hero"
          className="hero-image"
        />
      </section>

      {/* Mode Selector - Three Column Layout */}
      <div
        className="mode-selector-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "24px",
          marginBottom: "32px",
        }}
      >
        {/* Import New Data Card */}
        <div
          onClick={() => handleViewModeChange("import")}
          style={{
            background:
              viewMode === "import"
                ? "rgba(39, 61, 83, 0.03)"
                : "var(--bg-card)",
            border: `2px solid ${
              viewMode === "import" ? "var(--accent)" : "var(--border-color)"
            }`,
            borderRadius: "var(--radius-lg)",
            padding: "32px",
            cursor: "pointer",
            transition: "all 0.2s ease",
            boxShadow:
              viewMode === "import" ? "var(--shadow-lg)" : "var(--shadow-sm)",
            position: "relative",
            overflow: "hidden",
            transform:
              viewMode === "import" ? "translateY(-2px)" : "translateY(0)",
          }}
          onMouseEnter={(e) => {
            if (viewMode !== "import") {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.boxShadow = "var(--shadow-md)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }
          }}
          onMouseLeave={(e) => {
            if (viewMode !== "import") {
              e.currentTarget.style.borderColor = "var(--border-color)";
              e.currentTarget.style.boxShadow = "var(--shadow-sm)";
              e.currentTarget.style.transform = "translateY(0)";
            }
          }}
        >
          {viewMode === "import" && (
            <div
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                background: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              ✓
            </div>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              marginBottom: "12px",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "var(--radius-md)",
                background:
                  viewMode === "import" ? "var(--accent)" : "var(--bg-input)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s ease",
                boxShadow:
                  viewMode === "import"
                    ? "0 4px 12px rgba(39, 61, 83, 0.2)"
                    : "none",
                transform: viewMode === "import" ? "scale(1.05)" : "scale(1)",
                position: "relative",
              }}
            >
              {viewMode === "import" ? (
                <div
                  style={{
                    width: "24px",
                    height: "24px",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                      width: "20px",
                      height: "2px",
                      background: "#fff",
                      borderRadius: "1px",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                      width: "2px",
                      height: "20px",
                      background: "#fff",
                      borderRadius: "1px",
                    }}
                  />
                </div>
              ) : (
                <span
                  style={{
                    fontSize: "28px",
                    color: "var(--text-secondary)",
                    lineHeight: 1,
                  }}
                >
                  ➕
                </span>
              )}
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: "1.5rem",
                fontWeight: 700,
                color:
                  viewMode === "import"
                    ? "var(--accent)"
                    : "var(--text-primary)",
              }}
            >
              Import New Data
            </h2>
          </div>
          <p
            style={{
              margin: 0,
              color: "var(--text-secondary)",
              fontSize: "0.95rem",
              lineHeight: 1.6,
            }}
          >
            Scrape and import company data from Allabolag.se into HubSpot
          </p>
        </div>

        {/* Enrich Data Card */}
        <div
          onClick={() => handleViewModeChange("enrich")}
          style={{
            background:
              viewMode === "enrich"
                ? "rgba(39, 61, 83, 0.03)"
                : "var(--bg-card)",
            border: `2px solid ${
              viewMode === "enrich" ? "var(--accent)" : "var(--border-color)"
            }`,
            borderRadius: "var(--radius-lg)",
            padding: "32px",
            cursor: "pointer",
            transition: "all 0.2s ease",
            boxShadow:
              viewMode === "enrich" ? "var(--shadow-lg)" : "var(--shadow-sm)",
            position: "relative",
            overflow: "hidden",
            transform:
              viewMode === "enrich" ? "translateY(-2px)" : "translateY(0)",
          }}
          onMouseEnter={(e) => {
            if (viewMode !== "enrich") {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.boxShadow = "var(--shadow-md)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }
          }}
          onMouseLeave={(e) => {
            if (viewMode !== "enrich") {
              e.currentTarget.style.borderColor = "var(--border-color)";
              e.currentTarget.style.boxShadow = "var(--shadow-sm)";
              e.currentTarget.style.transform = "translateY(0)";
            }
          }}
        >
          {viewMode === "enrich" && (
            <div
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                background: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              ✓
            </div>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              marginBottom: "12px",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "var(--radius-md)",
                background:
                  viewMode === "enrich" ? "var(--accent)" : "var(--bg-input)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s ease",
                boxShadow:
                  viewMode === "enrich"
                    ? "0 4px 12px rgba(39, 61, 83, 0.2)"
                    : "none",
                transform: viewMode === "enrich" ? "scale(1.05)" : "scale(1)",
                position: "relative",
              }}
            >
              {viewMode === "enrich" ? (
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                    fill="#fff"
                    stroke="#fff"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <span
                  style={{
                    fontSize: "28px",
                    color: "var(--text-secondary)",
                    lineHeight: 1,
                  }}
                >
                  ✨
                </span>
              )}
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: "1.5rem",
                fontWeight: 700,
                color:
                  viewMode === "enrich"
                    ? "var(--accent)"
                    : "var(--text-primary)",
              }}
            >
              Enrich Data
            </h2>
          </div>
          <p
            style={{
              margin: 0,
              color: "var(--text-secondary)",
              fontSize: "0.95rem",
              lineHeight: 1.6,
            }}
          >
            Enrich existing HubSpot companies with data from Allabolag
          </p>
        </div>

        {/* View Previous Imports Card */}
        <div
          onClick={() => handleViewModeChange("previous")}
          style={{
            background:
              viewMode === "previous"
                ? "rgba(39, 61, 83, 0.03)"
                : "var(--bg-card)",
            border: `2px solid ${
              viewMode === "previous" ? "var(--accent)" : "var(--border-color)"
            }`,
            borderRadius: "var(--radius-lg)",
            padding: "32px",
            cursor: "pointer",
            transition: "all 0.2s ease",
            boxShadow:
              viewMode === "previous" ? "var(--shadow-lg)" : "var(--shadow-sm)",
            position: "relative",
            overflow: "hidden",
            transform:
              viewMode === "previous" ? "translateY(-2px)" : "translateY(0)",
          }}
          onMouseEnter={(e) => {
            if (viewMode !== "previous") {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.boxShadow = "var(--shadow-md)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }
          }}
          onMouseLeave={(e) => {
            if (viewMode !== "previous") {
              e.currentTarget.style.borderColor = "var(--border-color)";
              e.currentTarget.style.boxShadow = "var(--shadow-sm)";
              e.currentTarget.style.transform = "translateY(0)";
            }
          }}
        >
          {viewMode === "previous" && (
            <div
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                background: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              ✓
            </div>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              marginBottom: "12px",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "var(--radius-md)",
                background:
                  viewMode === "previous" ? "var(--accent)" : "var(--bg-input)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s ease",
                boxShadow:
                  viewMode === "previous"
                    ? "0 4px 12px rgba(39, 61, 83, 0.2)"
                    : "none",
                transform: viewMode === "previous" ? "scale(1.05)" : "scale(1)",
                position: "relative",
              }}
            >
              {viewMode === "previous" ? (
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15"
                    stroke="#fff"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5V5C15 6.10457 14.1046 7 13 7H11C9.89543 7 9 6.10457 9 5V5Z"
                    stroke="#fff"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 12H15"
                    stroke="#fff"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 16H15"
                    stroke="#fff"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <span
                  style={{
                    fontSize: "28px",
                    color: "var(--text-secondary)",
                    lineHeight: 1,
                  }}
                >
                  📋
                </span>
              )}
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: "1.5rem",
                fontWeight: 700,
                color:
                  viewMode === "previous"
                    ? "var(--accent)"
                    : "var(--text-primary)",
              }}
            >
              Previous Imports
            </h2>
          </div>
          <p
            style={{
              margin: 0,
              color: "var(--text-secondary)",
              fontSize: "0.95rem",
              lineHeight: 1.6,
            }}
          >
            View and manage your previously imported data and jobs
          </p>
        </div>
      </div>

      {/* Import Mode Content */}
      {viewMode === "import" && (
        <>
          {/* Step Indicator */}
          <div className="step-indicator">
            <div
              className={`step ${currentStep === "input" ? "active" : ""} ${
                [
                  "scraping",
                  "duplicates",
                  "mapping",
                  "importing",
                  "complete",
                ].includes(currentStep)
                  ? "completed"
                  : ""
              }`}
            >
              <span className="step-number">1</span>
              <span>URL Input</span>
            </div>
            <div
              className={`step ${currentStep === "scraping" ? "active" : ""} ${
                ["duplicates", "mapping", "importing", "complete"].includes(
                  currentStep
                )
                  ? "completed"
                  : ""
              }`}
            >
              <span className="step-number">2</span>
              <span>Scraping</span>
            </div>
            <div
              className={`step ${
                currentStep === "duplicates" ? "active" : ""
              } ${
                ["mapping", "importing", "complete"].includes(currentStep)
                  ? "completed"
                  : ""
              }`}
            >
              <span className="step-number">3</span>
              <span>Duplicates</span>
            </div>
            <div
              className={`step ${currentStep === "mapping" ? "active" : ""} ${
                ["importing", "complete"].includes(currentStep)
                  ? "completed"
                  : ""
              }`}
            >
              <span className="step-number">4</span>
              <span>Mapping</span>
            </div>
            <div
              className={`step ${
                ["importing", "complete"].includes(currentStep) ? "active" : ""
              }`}
            >
              <span className="step-number">5</span>
              <span>Import</span>
            </div>
          </div>

          {/* Step 1: URL Input */}
          {currentStep === "input" && (
            <div>
              <div className="form-group">
                <div className="url-input-group">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      setUrlError("");
                      setPreviewData(null);
                    }}
                    placeholder="https://www.allabolag.se/segmentering?..."
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={previewUrl}
                    disabled={!url || previewLoading}
                  >
                    {previewLoading ? (
                      <span
                        className="loading-spinner"
                        style={{
                          width: "24px",
                          height: "24px",
                        }}
                      />
                    ) : (
                      "Preview"
                    )}
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={startScraping}
                    disabled={!previewData || !!urlError}
                  >
                    Start Import
                  </button>
                </div>
                {urlError && <span className="error-text">{urlError}</span>}
              </div>

              {previewData && (
                <div style={{ marginTop: "20px" }}>
                  <div className="stats-row">
                    <div className="stat-item">
                      <div className="stat-value">
                        {previewData.totalCompanies.toLocaleString()}
                      </div>
                      <div className="stat-label">Companies</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-value">
                        {previewData.totalPages.toLocaleString()}
                      </div>
                      <div className="stat-label">Pages</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-value">
                        ~{estimateTotalTime(previewData.totalPages)}s
                      </div>
                      <div className="stat-label">Estimated Time</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Scraping Progress */}
          {currentStep === "scraping" && (
            <div className="card">
              {scrapeStatus ? (
                <>
                  <div className="stats-row">
                    <div className="stat-item">
                      <div className="stat-value">
                        {scrapeStatus.progress.companiesScraped.toLocaleString()}{" "}
                        /{" "}
                        {scrapeStatus.progress.totalCompanies.toLocaleString()}
                      </div>
                      <div className="stat-label">Companies Scraped</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-value">
                        {scrapeStatus.progress.currentPage} /{" "}
                        {scrapeStatus.progress.totalPages}
                      </div>
                      <div className="stat-label">Pages Scraped</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-value">
                        {scrapeStatus.status === "completed" ? (
                          <span style={{ color: "var(--success)" }}>✓</span>
                        ) : scrapeStatus.status === "failed" ? (
                          <span style={{ color: "var(--error)" }}>✗</span>
                        ) : (
                          <span
                            className="loading-spinner"
                            style={{
                              width: "24px",
                              height: "24px",
                            }}
                          />
                        )}
                      </div>
                      <div className="stat-label">
                        {scrapeStatus.status === "completed"
                          ? "Complete"
                          : scrapeStatus.status === "failed"
                          ? "Failed"
                          : ""}
                      </div>
                    </div>
                  </div>

                  <div className="progress-container">
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${scrapeProgress}%` }}
                      />
                    </div>
                    <div className="progress-text">
                      <span>{scrapeProgress}% complete</span>
                      {scrapeStatus.status === "scraping" && (
                        <span>
                          ~
                          {estimateRemainingTime(
                            scrapeStatus.progress.companiesScraped,
                            scrapeStatus.progress.totalCompanies
                          )}
                          s remaining
                        </span>
                      )}
                    </div>
                  </div>

                  {scrapeStatus.error && (
                    <div className="alert alert-error">
                      <span className="alert-icon">⚠️</span>
                      <div>{scrapeStatus.error}</div>
                    </div>
                  )}

                  {/* Company table */}
                  <div style={{ marginTop: "24px" }}>
                    <h3 style={{ marginBottom: "12px" }}>
                      Scraped Companies ({scrapeStatus.companies.length})
                    </h3>
                    <div
                      className="table-container"
                      style={{ maxHeight: "400px" }}
                    >
                      <table className="company-table">
                        <thead>
                          <tr>
                            <th>Company Name</th>
                            <th>Org Number</th>
                            <th>City</th>
                            <th>Revenue</th>
                            <th>Employees</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scrapeStatus.companies.map((company, idx) => (
                            <tr key={idx}>
                              <td>
                                <a
                                  href={company.allabolagUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="link"
                                >
                                  {company.organizationName}
                                </a>
                              </td>
                              <td className="org-number">
                                {company.orgNumber}
                              </td>
                              <td>{company.city || "-"}</td>
                              <td>
                                {company.revenue
                                  ? `${parseInt(
                                      company.revenue
                                    ).toLocaleString()} TSEK`
                                  : "-"}
                              </td>
                              <td>{company.employees || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {scrapeStatus.status === "completed" && (
                    <div className="action-bar">
                      <button className="btn btn-secondary" onClick={resetAll}>
                        Start Over
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={checkDuplicates}
                      >
                        Find Duplicates
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="loading-overlay">
                  <div className="loading-spinner" />
                  <p>Starting scraper...</p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Duplicate Detection */}
          {currentStep === "duplicates" && (
            <div className="card">
              <h2>Review Potential Duplicates</h2>

              {duplicateLoading ? (
                <div className="loading-overlay">
                  <div className="loading-spinner" />
                  <p>Checking for duplicates in Hubspot...</p>
                </div>
              ) : (
                <>
                  <div className="stats-row" style={{ marginBottom: "20px" }}>
                    <div className="stat-item">
                      <div className="stat-value">
                        {scrapeStatus?.companies.length || 0}
                      </div>
                      <div className="stat-label">Total Scraped</div>
                    </div>
                    <div className="stat-item">
                      <div
                        className="stat-value"
                        style={{
                          color:
                            duplicates.length > 0
                              ? "var(--warning)"
                              : "var(--success)",
                        }}
                      >
                        {duplicates.length}
                      </div>
                      <div className="stat-label">Potential Duplicates</div>
                    </div>
                  </div>

                  {scrapeStatus?.companies.length ? (
                    <>
                      <p
                        style={{
                          color: "var(--text-secondary)",
                          marginBottom: "16px",
                        }}
                      >
                        Click on a row to exclude/include it from import.
                      </p>

                      <div
                        className="table-container"
                        style={{ maxHeight: "400px", marginTop: "16px" }}
                      >
                        <table className="company-table">
                          <thead style={{ background: "#f8f9fb", opacity: 1 }}>
                            <tr>
                              <th
                                style={{
                                  background: "#f8f9fb",
                                  opacity: 1,
                                  zIndex: 10,
                                }}
                              >
                                Scraped Company
                              </th>
                              <th
                                style={{
                                  background: "#f8f9fb",
                                  opacity: 1,
                                  zIndex: 10,
                                }}
                              >
                                Match Type
                              </th>
                              <th
                                style={{
                                  background: "#f8f9fb",
                                  opacity: 1,
                                  zIndex: 10,
                                }}
                              >
                                Existing in Hubspot
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              // Create a map of duplicates by orgNumber for quick lookup
                              const duplicateMap = new Map<
                                string,
                                DuplicateMatch
                              >();
                              duplicates.forEach((dup) => {
                                const normalizedOrgNum = normalizeOrgNumber(
                                  dup.scrapedCompany.orgNumber
                                );
                                duplicateMap.set(normalizedOrgNum, dup);
                              });

                              // Combine all companies with their duplicate info
                              const companiesWithDuplicates =
                                scrapeStatus.companies.map((company) => {
                                  const normalizedOrgNum = normalizeOrgNumber(
                                    company.orgNumber
                                  );
                                  const duplicate =
                                    duplicateMap.get(normalizedOrgNum);
                                  return {
                                    company,
                                    duplicate,
                                  };
                                });

                              // Sort: duplicates first (by match type and similarity), then non-duplicates
                              companiesWithDuplicates.sort((a, b) => {
                                const aHasDup = !!a.duplicate;
                                const bHasDup = !!b.duplicate;

                                // If both are duplicates or both are not duplicates, maintain order
                                if (aHasDup === bHasDup) {
                                  if (aHasDup && bHasDup) {
                                    // Both are duplicates - sort by match type and similarity
                                    const aType =
                                      a.duplicate!.matchType === "org_number"
                                        ? 0
                                        : 1;
                                    const bType =
                                      b.duplicate!.matchType === "org_number"
                                        ? 0
                                        : 1;
                                    if (aType !== bType) return aType - bType;

                                    // Same type - sort by similarity descending
                                    const aSim = a.duplicate!.similarity ?? 0;
                                    const bSim = b.duplicate!.similarity ?? 0;
                                    return bSim - aSim;
                                  }
                                  return 0;
                                }

                                // Duplicates come first
                                return aHasDup ? -1 : 1;
                              });

                              return companiesWithDuplicates.map(
                                (item, idx) => {
                                  const isExcluded = confirmedDuplicates.has(
                                    normalizeOrgNumber(item.company.orgNumber)
                                  );
                                  const isOrgNumberMatch =
                                    item.duplicate?.matchType === "org_number";
                                  const isClickable = !isOrgNumberMatch;
                                  return (
                                    <tr
                                      key={idx}
                                      onClick={() =>
                                        isClickable &&
                                        toggleDuplicate(
                                          item.company.orgNumber,
                                          item.duplicate?.matchType
                                        )
                                      }
                                      style={{
                                        cursor: isClickable
                                          ? "pointer"
                                          : "not-allowed",
                                        opacity: isExcluded ? 0.5 : 1,
                                        textDecoration: isExcluded
                                          ? "line-through"
                                          : "none",
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor =
                                          "var(--bg-secondary)";
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor =
                                          "transparent";
                                      }}
                                    >
                                      <td>
                                        <strong>
                                          {item.company.organizationName}
                                        </strong>
                                        {isExcluded && (
                                          <span
                                            style={{
                                              marginLeft: "8px",
                                              color: "var(--text-secondary)",
                                              fontSize: "12px",
                                            }}
                                          >
                                            (excluded)
                                          </span>
                                        )}
                                      </td>
                                      <td>
                                        {item.duplicate ? (
                                          <span
                                            className={`badge ${
                                              item.duplicate.matchType ===
                                              "org_number"
                                                ? "badge-error"
                                                : "badge-warning"
                                            }`}
                                          >
                                            {item.duplicate.matchType ===
                                            "org_number"
                                              ? "Org Number"
                                              : `Name (${Math.round(
                                                  (item.duplicate.similarity ||
                                                    0) * 100
                                                )}%)`}
                                          </span>
                                        ) : (
                                          <span className="badge badge-success">
                                            No match found
                                          </span>
                                        )}
                                      </td>
                                      <td>
                                        {item.duplicate ? (
                                          <a
                                            href={`https://app-eu1.hubspot.com/contacts/144470660/record/0-2/${item.duplicate.hubspotCompany.id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                              color: "var(--primary)",
                                              textDecoration: "underline",
                                              display: "inline-flex",
                                              alignItems: "center",
                                              gap: "4px",
                                            }}
                                          >
                                            {item.duplicate.hubspotCompany.name}
                                            <span style={{ fontSize: "12px" }}>
                                              ↗
                                            </span>
                                          </a>
                                        ) : null}
                                      </td>
                                    </tr>
                                  );
                                }
                              );
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <p style={{ color: "var(--text-secondary)" }}>
                      No companies found.
                    </p>
                  )}

                  <div className="action-bar">
                    <button
                      className="btn btn-secondary"
                      onClick={() => setCurrentStep("scraping")}
                    >
                      Back
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={proceedToMapping}
                    >
                      Continue ({companiesToImport.length} companies)
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 4: Field Mapping */}
          {currentStep === "mapping" && (
            <div className="card">
              <h2>Map Fields to Hubspot Properties</h2>

              {propertiesLoading ? (
                <div className="loading-overlay">
                  <div className="loading-spinner" />
                  <p>Loading Hubspot properties...</p>
                </div>
              ) : (
                <>
                  <table className="mapping-table">
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Hubspot Property</th>
                        <th style={{ width: "100px" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Editable fields (can be changed or skipped)
                        const editableFields = [
                          {
                            field: "organizationName" as keyof FieldMapping,
                            label: "Organization Name",
                            required: true,
                          },
                          {
                            field: "zipCode" as keyof FieldMapping,
                            label: "Zip Code",
                            required: false,
                          },
                          {
                            field: "city" as keyof FieldMapping,
                            label: "City",
                            required: false,
                          },
                          {
                            field: "revenue" as keyof FieldMapping,
                            label: "Revenue (TSEK)",
                            required: false,
                          },
                          {
                            field: "employees" as keyof FieldMapping,
                            label: "Employees",
                            required: false,
                          },
                        ];

                        // Non-editable fields (fixed mapping, shown at end)
                        const nonEditableFields = [
                          {
                            field: "orgNumber" as keyof FieldMapping,
                            label: "Org Nr",
                            required: false,
                          },
                          {
                            field: "allabolagUrl" as keyof FieldMapping,
                            label: "Alla Bolag Link",
                            required: false,
                          },
                        ];

                        // Combine: editable first, then non-editable
                        const allFields = [
                          ...editableFields,
                          ...nonEditableFields,
                        ];

                        return allFields.map(({ field, label, required }) => {
                          const isNonEditable = nonEditableFields.some(
                            (f) => f.field === field
                          );
                          // A field is skipped if it's in skippedFields AND has no value
                          // Non-editable fields can never be skipped
                          const isSkipped =
                            !isNonEditable &&
                            skippedFields.has(field) &&
                            !fieldMapping[field];
                          return (
                            <tr
                              key={field}
                              style={{
                                textDecoration: isSkipped
                                  ? "line-through"
                                  : "none",
                                opacity: isSkipped ? 0.6 : 1,
                                backgroundColor: isNonEditable
                                  ? "var(--bg-input)"
                                  : "transparent",
                              }}
                            >
                              <td>
                                {label}
                                {required && (
                                  <span className="required">*</span>
                                )}
                              </td>
                              <td>
                                <select
                                  value={fieldMapping[field] || ""}
                                  onChange={(e) => {
                                    if (!isNonEditable) {
                                      updateMapping(field, e.target.value);
                                      // If selecting a value, unskip automatically
                                      if (e.target.value) {
                                        setSkippedFields((prev) => {
                                          const next = new Set(prev);
                                          next.delete(field);
                                          return next;
                                        });
                                      }
                                    }
                                  }}
                                  disabled={isSkipped || isNonEditable}
                                  style={{
                                    opacity: isNonEditable ? 0.7 : 1,
                                    cursor: isNonEditable
                                      ? "not-allowed"
                                      : "pointer",
                                  }}
                                >
                                  <option value="">Select property...</option>
                                  {hubspotProperties.map((prop) => {
                                    // Format the property name nicely (split by underscore, capitalize)
                                    const formattedName = prop.name
                                      .split("_")
                                      .map(
                                        (word) =>
                                          word.charAt(0).toUpperCase() +
                                          word.slice(1).toLowerCase()
                                      )
                                      .join(" ");

                                    // Use label if it's meaningful (more than 2 chars and different from formatted name)
                                    // Otherwise use the formatted name
                                    const displayName =
                                      prop.label &&
                                      prop.label.length > 2 &&
                                      prop.label.toLowerCase() !==
                                        formattedName.toLowerCase()
                                        ? `${prop.label} (${formattedName})`
                                        : formattedName;

                                    return (
                                      <option key={prop.name} value={prop.name}>
                                        {displayName}
                                      </option>
                                    );
                                  })}
                                </select>
                              </td>
                              <td>
                                {isNonEditable ? (
                                  <span
                                    style={{
                                      color: "var(--text-secondary)",
                                      fontSize: "0.875rem",
                                      fontStyle: "italic",
                                    }}
                                  >
                                    Fixed
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (isSkipped) {
                                        // Unskip: remove from skipped set
                                        setSkippedFields((prev) => {
                                          const next = new Set(prev);
                                          next.delete(field);
                                          return next;
                                        });
                                      } else {
                                        // Skip: add to skipped set and clear value
                                        setSkippedFields((prev) => {
                                          const next = new Set(prev);
                                          next.add(field);
                                          return next;
                                        });
                                        updateMapping(field, "");
                                      }
                                    }}
                                    className="btn btn-sm"
                                    style={{
                                      padding: "6px 12px",
                                      fontSize: "0.875rem",
                                      minWidth: "70px",
                                      backgroundColor: isSkipped
                                        ? "var(--success)"
                                        : "var(--bg-input)",
                                      color: isSkipped
                                        ? "white"
                                        : "var(--text-primary)",
                                      border: `1px solid ${
                                        isSkipped
                                          ? "var(--success)"
                                          : "var(--border-color)"
                                      }`,
                                      cursor: "pointer",
                                    }}
                                  >
                                    {isSkipped ? "Unskip" : "Skip"}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>

                  {/* Preview Section */}
                  {companiesToImport.length > 0 && (
                    <div
                      style={{
                        marginTop: "32px",
                        padding: "20px",
                        backgroundColor: "var(--bg-input)",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      <h3
                        style={{
                          marginTop: 0,
                          marginBottom: "16px",
                          fontSize: "1rem",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
                        Preview: How data will be imported
                      </h3>
                      <p
                        style={{
                          marginBottom: "16px",
                          fontSize: "0.875rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        Example from first company to be imported:
                      </p>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(300px, 1fr))",
                          gap: "12px",
                        }}
                      >
                        {(() => {
                          const sampleCompany = companiesToImport[0];
                          const previewData: Array<{
                            hubspotProperty: string;
                            value: string;
                            isMapped: boolean;
                          }> = [];

                          // Get property label for display
                          const getPropertyLabel = (propertyName: string) => {
                            const prop = hubspotProperties.find(
                              (p) => p.name === propertyName
                            );
                            if (prop && prop.label && prop.label.length > 2) {
                              return prop.label;
                            }
                            return propertyName
                              .split("_")
                              .map(
                                (word) =>
                                  word.charAt(0).toUpperCase() +
                                  word.slice(1).toLowerCase()
                              )
                              .join(" ");
                          };

                          // Check each field mapping
                          if (
                            fieldMapping.organizationName &&
                            sampleCompany.organizationName
                          ) {
                            previewData.push({
                              hubspotProperty: getPropertyLabel(
                                fieldMapping.organizationName
                              ),
                              value: sampleCompany.organizationName,
                              isMapped: true,
                            });
                          }
                          if (
                            fieldMapping.orgNumber &&
                            sampleCompany.orgNumber
                          ) {
                            previewData.push({
                              hubspotProperty: getPropertyLabel(
                                fieldMapping.orgNumber
                              ),
                              value: sampleCompany.orgNumber,
                              isMapped: true,
                            });
                          }
                          if (fieldMapping.zipCode && sampleCompany.zipCode) {
                            previewData.push({
                              hubspotProperty: getPropertyLabel(
                                fieldMapping.zipCode
                              ),
                              value: sampleCompany.zipCode,
                              isMapped: true,
                            });
                          }
                          if (fieldMapping.city && sampleCompany.city) {
                            previewData.push({
                              hubspotProperty: getPropertyLabel(
                                fieldMapping.city
                              ),
                              value: sampleCompany.city,
                              isMapped: true,
                            });
                          }
                          if (fieldMapping.revenue && sampleCompany.revenue) {
                            previewData.push({
                              hubspotProperty: getPropertyLabel(
                                fieldMapping.revenue
                              ),
                              value: sampleCompany.revenue,
                              isMapped: true,
                            });
                          }
                          if (
                            fieldMapping.employees &&
                            sampleCompany.employees
                          ) {
                            previewData.push({
                              hubspotProperty: getPropertyLabel(
                                fieldMapping.employees
                              ),
                              value: sampleCompany.employees,
                              isMapped: true,
                            });
                          }
                          if (
                            fieldMapping.allabolagUrl &&
                            sampleCompany.allabolagUrl
                          ) {
                            previewData.push({
                              hubspotProperty: getPropertyLabel(
                                fieldMapping.allabolagUrl
                              ),
                              value: sampleCompany.allabolagUrl,
                              isMapped: true,
                            });
                          }

                          // Add Source field (always set for imported companies)
                          if (scrapeStatus?.jobId) {
                            previewData.push({
                              hubspotProperty: getPropertyLabel("kalla"),
                              value: `bepp-hubspot-importer-${scrapeStatus.jobId}`,
                              isMapped: true,
                            });
                          }

                          if (previewData.length === 0) {
                            return (
                              <div
                                style={{
                                  color: "var(--text-secondary)",
                                  fontStyle: "italic",
                                }}
                              >
                                No fields are currently mapped. Please map at
                                least one field to see a preview.
                              </div>
                            );
                          }

                          return previewData.map((item, idx) => (
                            <div
                              key={idx}
                              style={{
                                padding: "12px",
                                backgroundColor: "var(--bg-card)",
                                borderRadius: "var(--radius-sm)",
                                border: "1px solid var(--border-color)",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "0.75rem",
                                  fontWeight: 600,
                                  color: "var(--text-secondary)",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.5px",
                                  marginBottom: "4px",
                                }}
                              >
                                {item.hubspotProperty}
                              </div>
                              <div
                                style={{
                                  fontSize: "0.95rem",
                                  color: "var(--text-primary)",
                                  wordBreak: "break-word",
                                }}
                              >
                                {item.value || (
                                  <span
                                    style={{
                                      color: "var(--text-muted)",
                                      fontStyle: "italic",
                                    }}
                                  >
                                    (empty)
                                  </span>
                                )}
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}

                  <div className="action-bar">
                    <button
                      className="btn btn-secondary"
                      onClick={() => setCurrentStep("duplicates")}
                    >
                      Back
                    </button>
                    <button
                      className="btn btn-hubspot"
                      onClick={startImport}
                      disabled={!fieldMapping.organizationName}
                    >
                      Import {companiesToImport.length} Companies to Hubspot
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 5: Importing / Results */}
          {(currentStep === "importing" || currentStep === "complete") && (
            <div className="card">
              {importLoading ? (
                <div className="loading-overlay">
                  <div className="loading-spinner" />
                  <p>Importing companies to Hubspot...</p>
                  <p
                    style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}
                  >
                    This may take a moment for large imports.
                  </p>
                </div>
              ) : importResult ? (
                <>
                  <div
                    className={`result-card ${
                      importResult.success ? "success" : "error"
                    }`}
                  >
                    <div className="result-icon">
                      {importResult.success ? "✓" : "⚠️"}
                    </div>
                    <div className="result-title">
                      {importResult.success
                        ? "Import Complete!"
                        : "Import Completed with Errors"}
                    </div>
                    <div className="result-stats">
                      <div className="stat-item">
                        <div
                          className="stat-value"
                          style={{ color: "var(--success)" }}
                        >
                          {importResult.created}
                        </div>
                        <div className="stat-label">Created</div>
                      </div>
                      {importResult.failed > 0 && (
                        <div className="stat-item">
                          <div
                            className="stat-value"
                            style={{ color: "var(--error)" }}
                          >
                            {importResult.failed}
                          </div>
                          <div className="stat-label">Failed</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {importResult.errors && importResult.errors.length > 0 && (
                    <div style={{ marginTop: "20px" }}>
                      <h3>Errors</h3>
                      <div
                        className="table-container"
                        style={{ maxHeight: "200px" }}
                      >
                        <table className="company-table">
                          <thead>
                            <tr>
                              <th>Company</th>
                              <th>Error</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importResult.errors.map((err, idx) => (
                              <tr key={idx}>
                                <td>{err.company.organizationName}</td>
                                <td style={{ color: "var(--error)" }}>
                                  {err.error}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="action-bar">
                    <button className="btn btn-secondary" onClick={resetAll}>
                      Start New Import
                    </button>
                    <a
                      href={
                        importResult?.viewId
                          ? `https://app-eu1.hubspot.com/contacts/144470660/objectLists/${importResult.viewId}/filters`
                          : "https://app-eu1.hubspot.com/contacts/144470660/objects/0-2/"
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-hubspot"
                    >
                      View in Hubspot
                    </a>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </>
      )}

      {/* Previous Imports Mode Content */}
      {viewMode === "previous" && (
        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "24px",
            }}
          >
            <div>
              <h2 style={{ margin: 0 }}>Previous Imports</h2>
              <p
                style={{
                  margin: "8px 0 0 0",
                  color: "var(--text-secondary)",
                  fontSize: "0.875rem",
                }}
              >
                View and manage your previously imported data from Allabolag
              </p>
            </div>
            <button
              className="btn btn-secondary"
              onClick={fetchJobs}
              disabled={jobsLoading}
              style={{ fontSize: "0.875rem", padding: "8px 16px" }}
            >
              {jobsLoading ? (
                <span
                  className="loading-spinner"
                  style={{ width: "16px", height: "16px" }}
                />
              ) : (
                "Refresh"
              )}
            </button>
          </div>

          {jobsLoading && jobsList.length === 0 ? (
            <div className="loading-overlay" style={{ minHeight: "200px" }}>
              <div className="loading-spinner" />
              <p>Loading previous imports...</p>
            </div>
          ) : jobsList.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "48px 24px",
                color: "var(--text-secondary)",
              }}
            >
              <p style={{ fontSize: "1.125rem", marginBottom: "8px" }}>
                No previous imports found
              </p>
              <p style={{ fontSize: "0.875rem", marginBottom: "24px" }}>
                Start a new import to create your first job.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => handleViewModeChange("import")}
              >
                Start New Import
              </button>
            </div>
          ) : (
            <div className="table-container" style={{ maxHeight: "600px" }}>
              <table className="company-table">
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>Status</th>
                    <th>Source URL</th>
                    <th>Companies</th>
                    <th>Progress</th>
                    <th>Started</th>
                    <th>Duration</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobsList.map((job) => (
                    <tr key={job.jobId}>
                      <td>
                        <code
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {job.jobId}
                        </code>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            job.status === "completed"
                              ? "badge-success"
                              : job.status === "failed"
                              ? "badge-error"
                              : job.status === "scraping"
                              ? "badge-warning"
                              : ""
                          }`}
                        >
                          {job.status.charAt(0).toUpperCase() +
                            job.status.slice(1)}
                        </span>
                      </td>
                      <td>
                        <a
                          href={job.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link"
                          style={{
                            maxWidth: "200px",
                            display: "inline-block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {job.sourceUrl}
                        </a>
                      </td>
                      <td>{job.companyCount.toLocaleString()}</td>
                      <td>
                        {job.status === "completed"
                          ? "100%"
                          : job.status === "failed"
                          ? "Failed"
                          : `${Math.round(
                              (job.progress.companiesScraped /
                                Math.max(1, job.progress.totalCompanies)) *
                                100
                            )}%`}
                      </td>
                      <td style={{ fontSize: "0.875rem" }}>
                        {formatDate(job.startedAt)}
                      </td>
                      <td style={{ fontSize: "0.875rem" }}>
                        {formatDuration(job.startedAt, job.completedAt)}
                      </td>
                      <td>
                        <button
                          className="btn btn-primary"
                          onClick={() => {
                            loadJob(job.jobId);
                            handleViewModeChange("import");
                          }}
                          style={{
                            fontSize: "0.75rem",
                            padding: "6px 12px",
                          }}
                        >
                          Load & Continue
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Enrich Mode Content */}
      {viewMode === "enrich" && (
        <div className="card">
          <div
            style={{
              textAlign: "center",
              padding: "64px 24px",
            }}
          >
            <div
              style={{
                width: "80px",
                height: "80px",
                margin: "0 auto 24px",
                borderRadius: "var(--radius-lg)",
                background: "var(--bg-input)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "40px",
              }}
            >
              🚧
            </div>
            <h2
              style={{
                margin: "0 0 12px 0",
                fontSize: "1.75rem",
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              Work in Progress
            </h2>
            <p
              style={{
                margin: 0,
                color: "var(--text-secondary)",
                fontSize: "1rem",
                lineHeight: 1.6,
                maxWidth: "500px",
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              The data enrichment feature for existing HubSpot companies is
              currently under development. Check back soon!
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
