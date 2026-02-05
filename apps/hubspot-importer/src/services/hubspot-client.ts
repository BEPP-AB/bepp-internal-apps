import { Client } from "@hubspot/api-client";
import {
  HubspotProperty,
  ScrapedCompany,
  ImportResult,
  FieldMapping,
} from "../types/company";

// Get Hubspot client instance
function getHubspotClient(): Client {
  const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error("HUBSPOT_ACCESS_TOKEN environment variable is not set");
  }

  return new Client({ accessToken });
}

// Hubspot company from API
export interface HubspotCompany {
  id: string;
  properties: Record<string, string | null>;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Get all company properties from Hubspot
 */
export async function getCompanyProperties(): Promise<HubspotProperty[]> {
  const client = getHubspotClient();

  try {
    const response = await client.crm.properties.coreApi.getAll("company");

    return response.results.map((prop) => ({
      name: prop.name,
      label: prop.label,
      type: prop.type,
      fieldType: prop.fieldType,
      description: prop.description || undefined,
      groupName: prop.groupName,
    }));
  } catch (error) {
    console.error("Error fetching company properties:", error);
    throw error;
  }
}

/**
 * Search for companies in Hubspot by various criteria
 */
export async function searchCompanies(
  filters: {
    orgNumber?: string;
    name?: string;
    domain?: string;
  },
  properties: string[] = ["name", "domain"]
): Promise<HubspotCompany[]> {
  const client = getHubspotClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filterGroups: any[] = [];

  // Build filter groups
  if (filters.orgNumber) {
    filterGroups.push({
      filters: [
        {
          propertyName: "org_number", // Custom property - adjust as needed
          operator: "EQ",
          value: filters.orgNumber,
        },
      ],
    });
  }

  if (filters.name) {
    filterGroups.push({
      filters: [
        {
          propertyName: "name",
          operator: "CONTAINS_TOKEN",
          value: filters.name,
        },
      ],
    });
  }

  if (filters.domain) {
    filterGroups.push({
      filters: [
        {
          propertyName: "domain",
          operator: "EQ",
          value: filters.domain,
        },
      ],
    });
  }

  if (filterGroups.length === 0) {
    return [];
  }

  try {
    const response = await client.crm.companies.searchApi.doSearch({
      filterGroups,
      properties,
      limit: 100,
      sorts: ["name"],
    });

    return response.results.map((company) => ({
      id: company.id,
      properties: company.properties as Record<string, string | null>,
      createdAt: company.createdAt?.toISOString(),
      updatedAt: company.updatedAt?.toISOString(),
    }));
  } catch (error) {
    console.error("Error searching companies:", error);
    throw error;
  }
}

/**
 * Get all companies from Hubspot (with pagination)
 * Used for duplicate detection
 */
export async function getAllCompanies(
  properties: string[] = ["name", "domain", "org_number"]
): Promise<HubspotCompany[]> {
  const client = getHubspotClient();
  const allCompanies: HubspotCompany[] = [];
  let after: string | undefined;

  try {
    do {
      const response = await client.crm.companies.basicApi.getPage(
        100, // limit
        after, // after cursor
        properties
      );

      for (const company of response.results) {
        allCompanies.push({
          id: company.id,
          properties: company.properties as Record<string, string | null>,
          createdAt: company.createdAt?.toISOString(),
          updatedAt: company.updatedAt?.toISOString(),
        });
      }

      after = response.paging?.next?.after;
    } while (after);

    return allCompanies;
  } catch (error) {
    console.error("Error fetching all companies:", error);
    throw error;
  }
}

/**
 * Create a single company in Hubspot
 */
export async function createCompany(
  properties: Record<string, string>
): Promise<HubspotCompany> {
  const client = getHubspotClient();

  try {
    const response = await client.crm.companies.basicApi.create({
      properties,
      associations: [],
    });

    return {
      id: response.id,
      properties: response.properties as Record<string, string | null>,
      createdAt: response.createdAt?.toISOString(),
      updatedAt: response.updatedAt?.toISOString(),
    };
  } catch (error) {
    console.error("Error creating company:", error);
    throw error;
  }
}

/**
 * Batch create companies in Hubspot
 */
export async function batchCreateCompanies(
  companies: ScrapedCompany[],
  fieldMapping: FieldMapping
): Promise<ImportResult> {
  const client = getHubspotClient();
  const results: ImportResult = {
    success: true,
    created: 0,
    failed: 0,
    errors: [],
    createdIds: [],
  };

  // Process in batches of 100 (Hubspot limit)
  const batchSize = 100;

  for (let i = 0; i < companies.length; i += batchSize) {
    const batch = companies.slice(i, i + batchSize);

    const inputs = batch.map((company) => {
      const properties: Record<string, string> = {};

      // Map fields according to user configuration
      if (fieldMapping.organizationName && company.organizationName) {
        properties[fieldMapping.organizationName] = company.organizationName;
      }
      if (fieldMapping.orgNumber && company.orgNumber) {
        properties[fieldMapping.orgNumber] = company.orgNumber;
      }
      if (fieldMapping.zipCode && company.zipCode) {
        properties[fieldMapping.zipCode] = company.zipCode;
      }
      if (fieldMapping.city && company.city) {
        properties[fieldMapping.city] = company.city;
      }
      if (fieldMapping.revenue && company.revenue) {
        properties[fieldMapping.revenue] = company.revenue;
      }
      if (fieldMapping.employees && company.employees) {
        properties[fieldMapping.employees] = company.employees;
      }
      if (fieldMapping.allabolagUrl && company.allabolagUrl) {
        properties[fieldMapping.allabolagUrl] = company.allabolagUrl;
      }

      return { properties, associations: [] };
    });

    try {
      const response = await client.crm.companies.batchApi.create({
        inputs,
      });

      results.created += response.results.length;
      results.createdIds.push(...response.results.map((r) => r.id));

      // Check for any partial failures
      if (response.results.length < batch.length) {
        results.failed += batch.length - response.results.length;
      }
    } catch (error) {
      console.error(`Batch create error (batch ${i / batchSize + 1}):`, error);

      // Try individual creates for this batch
      for (const company of batch) {
        try {
          const properties: Record<string, string> = {};

          if (fieldMapping.organizationName && company.organizationName) {
            properties[fieldMapping.organizationName] = company.organizationName;
          }
          if (fieldMapping.orgNumber && company.orgNumber) {
            properties[fieldMapping.orgNumber] = company.orgNumber;
          }
          if (fieldMapping.zipCode && company.zipCode) {
            properties[fieldMapping.zipCode] = company.zipCode;
          }
          if (fieldMapping.city && company.city) {
            properties[fieldMapping.city] = company.city;
          }
          if (fieldMapping.revenue && company.revenue) {
            properties[fieldMapping.revenue] = company.revenue;
          }
          if (fieldMapping.employees && company.employees) {
            properties[fieldMapping.employees] = company.employees;
          }
          if (fieldMapping.allabolagUrl && company.allabolagUrl) {
            properties[fieldMapping.allabolagUrl] = company.allabolagUrl;
          }

          const created = await createCompany(properties);
          results.created++;
          results.createdIds.push(created.id);
        } catch (individualError) {
          results.failed++;
          results.errors.push({
            company,
            error:
              individualError instanceof Error
                ? individualError.message
                : "Unknown error",
          });
        }
      }
    }

    // Rate limiting - small delay between batches
    if (i + batchSize < companies.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  results.success = results.failed === 0;
  return results;
}

/**
 * Update a company in Hubspot
 */
export async function updateCompany(
  companyId: string,
  properties: Record<string, string>
): Promise<HubspotCompany> {
  const client = getHubspotClient();

  try {
    const response = await client.crm.companies.basicApi.update(companyId, {
      properties,
    });

    return {
      id: response.id,
      properties: response.properties as Record<string, string | null>,
      createdAt: response.createdAt?.toISOString(),
      updatedAt: response.updatedAt?.toISOString(),
    };
  } catch (error) {
    console.error("Error updating company:", error);
    throw error;
  }
}

/**
 * Batch update companies in Hubspot
 */
export async function batchUpdateCompanies(
  updates: Array<{ id: string; properties: Record<string, string> }>
): Promise<{ success: number; failed: number }> {
  const client = getHubspotClient();
  const results = { success: 0, failed: 0 };

  // Process in batches of 100
  const batchSize = 100;

  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);

    try {
      const response = await client.crm.companies.batchApi.update({
        inputs: batch,
      });

      results.success += response.results.length;
    } catch (error) {
      console.error(`Batch update error:`, error);
      results.failed += batch.length;
    }

    // Rate limiting
    if (i + batchSize < updates.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * Create a custom company property in HubSpot
 */
export async function createCompanyProperty(property: {
  name: string;
  label: string;
  type: string;
  fieldType: string;
  groupName?: string;
  description?: string;
}): Promise<HubspotProperty> {
  const client = getHubspotClient();

  try {
    const response = await client.crm.properties.coreApi.create("company", {
      name: property.name,
      label: property.label,
      type: property.type,
      fieldType: property.fieldType,
      groupName: property.groupName || "companyinformation",
      description: property.description,
    });

    return {
      name: response.name,
      label: response.label,
      type: response.type,
      fieldType: response.fieldType,
      description: response.description || undefined,
      groupName: response.groupName,
    };
  } catch (error) {
    console.error("Error creating company property:", error);
    throw error;
  }
}

/**
 * Ensure required custom properties exist in HubSpot
 * Creates them if they don't exist
 */
export async function ensureCustomPropertiesExist(): Promise<{
  created: string[];
  alreadyExist: string[];
  errors: Array<{ property: string; error: string }>;
}> {
  const requiredProperties = [
    {
      name: "org_number",
      label: "Organization Number",
      type: "string",
      fieldType: "text",
      description: "Swedish organization number (organisationsnummer)",
    },
    {
      name: "allabolag_url",
      label: "Allabolag URL",
      type: "string",
      fieldType: "text",
      description: "URL to the company page on Allabolag.se",
    },
  ];

  const results = {
    created: [] as string[],
    alreadyExist: [] as string[],
    errors: [] as Array<{ property: string; error: string }>,
  };

  // Get existing properties
  const existingProperties = await getCompanyProperties();
  const existingNames = new Set(existingProperties.map((p) => p.name));

  for (const prop of requiredProperties) {
    if (existingNames.has(prop.name)) {
      results.alreadyExist.push(prop.name);
    } else {
      try {
        await createCompanyProperty(prop);
        results.created.push(prop.name);
      } catch (error) {
        results.errors.push({
          property: prop.name,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  }

  return results;
}
