"use client";

interface InternalApp {
  id: string;
  name: string;
  url: string;
  imageUrl: string;
}

const BEPP_INTERNAL_APPS_EMAIL_SIGNATURES_URL = "http://localhost:3001";
const BEPP_INTERNAL_APPS_HUBSPOT_IMPORTER_URL = "http://localhost:3002";

// Configure your internal apps here
// In development: apps run on separate ports (hub: 3000, email-signatures: 3001, hubspot-importer: 3002)
// In production: update these URLs to match your deployed paths or domains
const internalApps: InternalApp[] = [
  {
    id: "email-signatures",
    name: "Email Signature Generator",
    url: BEPP_INTERNAL_APPS_EMAIL_SIGNATURES_URL,
    imageUrl: `${BEPP_INTERNAL_APPS_EMAIL_SIGNATURES_URL}/images/email-signatures-hero.webp`,
  },
  {
    id: "hubspot-importer",
    name: "Hubspot Company Importer",
    url: BEPP_INTERNAL_APPS_HUBSPOT_IMPORTER_URL,
    imageUrl: `${BEPP_INTERNAL_APPS_HUBSPOT_IMPORTER_URL}/images/hubspot-importer-hero.webp`,
  },
  // Add more apps here
];

function AppCard({ app }: { app: InternalApp }) {
  return (
    <a href={app.url} className="app-card" title={app.name}>
      <img src={app.imageUrl} alt={app.name} />
    </a>
  );
}

export default function HubPage() {
  return (
    <main className="apps-grid">
      {internalApps.map((app) => (
        <AppCard key={app.id} app={app} />
      ))}
    </main>
  );
}
