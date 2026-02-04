# BEPP Internal Apps

Monorepo for BEPP internal applications.

## Apps

| App | Description | Port |
|-----|-------------|------|
| [@bepp/entry-dashboard](./apps/entry-dashboard) | Dashboard entry point for all internal tools | 3000 |
| [@bepp/email-signatures](./apps/email-signatures) | Email signature generator | 3001 |

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (auto-installed via corepack)

### Installation

```bash
pnpm install
```

### Development

```bash
# Run all apps
pnpm dev

# Run a specific app
pnpm --filter @bepp/email-signatures dev
```


### Lint

```bash
pnpm lint
```

## Structure

```
├── apps/
│   ├── entry-dashboard/  # @bepp/entry-dashboard - Dashboard entry point for all tools
│   ├── email-signatures/ # @bepp/email-signatures - Email signature generator
├── turbo.json            # Turborepo configuration
├── pnpm-workspace.yaml
└── package.json
```

## Adding a New App

1. Create a new directory under `apps/`
2. Add a `package.json` with name `@bepp/your-app-name`
3. Include `dev`, `build`, and `lint` scripts
4. Run `pnpm install` from the root
