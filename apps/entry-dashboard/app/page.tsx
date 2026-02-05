"use client";

interface InternalApp {
  id: string;
  name: string;
  url: string;
  imageUrl: string;
}

// Configure your internal apps here
// In development: apps run on separate ports (hub: 3000, email-signatures: 3001, hubspot-importer: 3002)
// In production: update these URLs to match your deployed paths or domains
const internalApps: InternalApp[] = [
  {
    id: "email-signatures",
    name: "Email Signature Generator",
    url:
      process.env.NEXT_PUBLIC_EMAIL_SIGNATURES_URL || "http://localhost:3001",
    imageUrl: "/images/email-signatures-hero.jpg",
  },
  {
    id: "hubspot-importer",
    name: "Hubspot Company Importer",
    url:
      process.env.NEXT_PUBLIC_HUBSPOT_IMPORTER_URL || "http://localhost:3002",
    imageUrl: "/images/hubspot-importer-hero.jpg",
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
