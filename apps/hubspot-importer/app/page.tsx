"use client";

import { useState, useCallback } from "react";
import {
  ScrapedCompany,
  DuplicateMatch,
  HubspotProperty,
  FieldMapping,
  ImportResult,
} from "@/src/types/company";

type Step =
  | "input"
  | "scraping"
  | "duplicates"
  | "mapping"
  | "importing"
  | "complete";

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

// Default field mapping suggestions
const DEFAULT_MAPPING: FieldMapping = {
  organizationName: "name",
  orgNumber: "org_number",
  zipCode: "zip",
  city: "city",
  revenue: "annualrevenue",
  employees: "numberofemployees",
  allabolagUrl: "allabolag_url",
};

export default function HubspotImporterPage() {
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
  const [propertiesLoading, setPropertiesLoading] = useState(false);

  // Import step
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  // Get companies to import (filtered by confirmed duplicates)
  const companiesToImport =
    scrapeStatus?.companies.filter(
      (company) => !confirmedDuplicates.has(company.orgNumber.replace(/-/g, ""))
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
        body: JSON.stringify({ companies: scrapeStatus.companies }),
      });

      const data: DuplicatesResponse = await response.json();

      setDuplicates(data.duplicates);

      // Pre-select all duplicates to skip by default
      const confirmed = new Set<string>();
      data.duplicates.forEach((d) => {
        confirmed.add(d.scrapedCompany.orgNumber.replace(/-/g, ""));
      });
      setConfirmedDuplicates(confirmed);
    } catch (err) {
      console.error("Duplicate check error:", err);
    } finally {
      setDuplicateLoading(false);
    }
  };

  // Toggle duplicate confirmation
  const toggleDuplicate = (orgNumber: string) => {
    const normalized = orgNumber.replace(/-/g, "");
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
          if (validated[key] && !validPropertyNames.has(validated[key])) {
            validated[key] = ""; // Set to empty string (Skip) if property doesn't exist
          }
        }
        return validated;
      });
    } catch (error) {
      console.error("Properties fetch error:", error);
    } finally {
      setPropertiesLoading(false);
    }
  };

  // Update field mapping
  const updateMapping = (field: keyof FieldMapping, value: string) => {
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
        }),
      });

      const result: ImportResult = await response.json();
      setImportResult(result);
      setCurrentStep("complete");
    } catch (error) {
      console.error("Import error:", error);
      setImportResult({
        success: false,
        created: 0,
        failed: companiesToImport.length,
        errors: [],
        createdIds: [],
      });
      setCurrentStep("complete");
    } finally {
      setImportLoading(false);
    }
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

  // Calculate estimated time based on scraper delays
  // Initial delay: 2-4s (avg 3s)
  // Per page: reading ~3.5s + delay 5-10s (avg 7.5s) = ~11s per page
  // Last page: only reading ~3.5s
  // Total: 3 + (N-1) * 11 + 3.5 = 11*N - 4.5
  const estimateTotalTime = (totalPages: number): number => {
    if (totalPages === 0) return 0;
    if (totalPages === 1) return 4; // Initial delay + reading
    return Math.ceil(11 * totalPages - 4.5);
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

    if (remainingPages === 1) return 4; // Just reading time for last page
    // (remainingPages - 1) * 11s + 3.5s for last page
    return Math.ceil(11 * (remainingPages - 1) + 3.5);
  };

  return (
    <main className="app">
      <header className="header">
        <h1>Hubspot Company Importer</h1>
        <p className="subtitle">
          Import company data from AllaBolag to Hubspot
        </p>
      </header>

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
          className={`step ${currentStep === "duplicates" ? "active" : ""} ${
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
            ["importing", "complete"].includes(currentStep) ? "completed" : ""
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
        <div className="card">
          <h2>Enter AllaBolag Filter URL</h2>
          <p style={{ marginBottom: "20px", color: "var(--text-secondary)" }}>
            Go to{" "}
            <a
              href="https://www.allabolag.se/segmentering"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)" }}
            >
              allabolag.se/segmentering
            </a>
            , configure your filter, then paste the URL here.
          </p>

          <div className="form-group">
            <label>AllaBolag URL</label>
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
                  <span className="loading-spinner" />
                ) : (
                  "Preview"
                )}
              </button>
            </div>
            {urlError && <span className="error-text">{urlError}</span>}
            <span className="hint">
              Example:
              https://www.allabolag.se/segmentering?numEmployeesFrom=10&companyType=AB
            </span>
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

          <div className="action-bar">
            <div />
            <button
              className="btn btn-primary btn-lg"
              onClick={startScraping}
              disabled={!previewData || !!urlError}
            >
              Start Import
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Scraping Progress */}
      {currentStep === "scraping" && (
        <div className="card">
          <h2 style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {scrapeStatus?.status === "scraping" && (
              <span
                className="loading-spinner"
                style={{
                  width: "24px",
                  height: "24px",
                  borderWidth: "3px",
                  borderColor: "var(--accent)",
                  borderTopColor: "var(--bepp-navy-light)",
                }}
              />
            )}
            Scraping Companies from AllaBolag
          </h2>

          {scrapeStatus ? (
            <>
              <div className="stats-row">
                <div className="stat-item">
                  <div className="stat-value">
                    {scrapeStatus.progress.companiesScraped.toLocaleString()} /{" "}
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
                          borderWidth: "3px",
                          borderColor: "var(--accent)",
                          borderTopColor: "var(--bepp-navy-light)",
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
                <div className="table-container" style={{ maxHeight: "400px" }}>
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
                          <td className="org-number">{company.orgNumber}</td>
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
                  <button className="btn btn-primary" onClick={checkDuplicates}>
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

              {duplicates.length > 0 ? (
                <>
                  <p
                    style={{
                      color: "var(--text-secondary)",
                      marginBottom: "16px",
                    }}
                  >
                    Uncheck to include in import.
                  </p>

                  <div
                    className="table-container"
                    style={{ maxHeight: "400px", marginTop: "16px" }}
                  >
                    <table className="company-table">
                      <thead>
                        <tr>
                          <th style={{ width: "50px" }}>Skip</th>
                          <th>Scraped Company</th>
                          <th>Match Type</th>
                          <th>Existing in Hubspot</th>
                        </tr>
                      </thead>
                      <tbody>
                        {duplicates.map((dup, idx) => (
                          <tr key={idx}>
                            <td>
                              <input
                                type="checkbox"
                                checked={confirmedDuplicates.has(
                                  dup.scrapedCompany.orgNumber.replace(/-/g, "")
                                )}
                                onChange={() =>
                                  toggleDuplicate(dup.scrapedCompany.orgNumber)
                                }
                              />
                            </td>
                            <td>
                              <strong>
                                {dup.scrapedCompany.organizationName}
                              </strong>
                              <br />
                              <span className="org-number">
                                {dup.scrapedCompany.orgNumber}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`badge ${
                                  dup.matchType === "org_number"
                                    ? "badge-success"
                                    : "badge-warning"
                                }`}
                              >
                                {dup.matchType === "org_number"
                                  ? "Org Number"
                                  : `Name (${Math.round(
                                      (dup.similarity || 0) * 100
                                    )}%)`}
                              </span>
                            </td>
                            <td>
                              <a
                                href={`https://app-eu1.hubspot.com/contacts/144470660/record/0-2/${dup.hubspotCompany.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  color: "var(--primary)",
                                  textDecoration: "underline",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                {dup.hubspotCompany.name}
                                <span style={{ fontSize: "12px" }}>↗</span>
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p style={{ color: "var(--text-secondary)" }}>
                  No duplicates found. All {scrapeStatus?.companies.length}{" "}
                  companies will be imported.
                </p>
              )}

              <div className="action-bar">
                <button
                  className="btn btn-secondary"
                  onClick={() => setCurrentStep("scraping")}
                >
                  Back
                </button>
                <button className="btn btn-primary" onClick={proceedToMapping}>
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
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      Organization Name<span className="required">*</span>
                    </td>
                    <td>
                      <select
                        value={fieldMapping.organizationName}
                        onChange={(e) =>
                          updateMapping("organizationName", e.target.value)
                        }
                      >
                        <option value="">Skip</option>
                        {hubspotProperties.map((prop) => (
                          <option key={prop.name} value={prop.name}>
                            {prop.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td>Org Number</td>
                    <td>
                      <select
                        value={fieldMapping.orgNumber}
                        onChange={(e) =>
                          updateMapping("orgNumber", e.target.value)
                        }
                      >
                        <option value="">Skip</option>
                        {hubspotProperties.map((prop) => (
                          <option key={prop.name} value={prop.name}>
                            {prop.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td>Zip Code</td>
                    <td>
                      <select
                        value={fieldMapping.zipCode}
                        onChange={(e) =>
                          updateMapping("zipCode", e.target.value)
                        }
                      >
                        <option value="">Skip</option>
                        {hubspotProperties.map((prop) => (
                          <option key={prop.name} value={prop.name}>
                            {prop.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td>City</td>
                    <td>
                      <select
                        value={fieldMapping.city}
                        onChange={(e) => updateMapping("city", e.target.value)}
                      >
                        <option value="">Skip</option>
                        {hubspotProperties.map((prop) => (
                          <option key={prop.name} value={prop.name}>
                            {prop.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td>Revenue (TSEK)</td>
                    <td>
                      <select
                        value={fieldMapping.revenue}
                        onChange={(e) =>
                          updateMapping("revenue", e.target.value)
                        }
                      >
                        <option value="">Skip</option>
                        {hubspotProperties.map((prop) => (
                          <option key={prop.name} value={prop.name}>
                            {prop.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td>Employees</td>
                    <td>
                      <select
                        value={fieldMapping.employees}
                        onChange={(e) =>
                          updateMapping("employees", e.target.value)
                        }
                      >
                        <option value="">Skip</option>
                        {hubspotProperties.map((prop) => (
                          <option key={prop.name} value={prop.name}>
                            {prop.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td>AllaBolag URL</td>
                    <td>
                      <select
                        value={fieldMapping.allabolagUrl}
                        onChange={(e) =>
                          updateMapping("allabolagUrl", e.target.value)
                        }
                      >
                        <option value="">Skip</option>
                        {hubspotProperties.map((prop) => (
                          <option key={prop.name} value={prop.name}>
                            {prop.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="action-bar">
                <button
                  className="btn btn-secondary"
                  onClick={() => setCurrentStep("duplicates")}
                >
                  Back
                </button>
                <button
                  className="btn btn-hubspot btn-lg"
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
              <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
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

              {importResult.errors.length > 0 && (
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
                  href="https://app-eu1.hubspot.com/contacts/144470660/objects/0-2/views/144515327/list?noprefetch="
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
    </main>
  );
}
