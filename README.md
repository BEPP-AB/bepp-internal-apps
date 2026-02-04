# BEPP Internal Apps

Monorepo for BEPP internal applications.

## Apps

| App | Description | Port |
|-----|-------------|------|
| [@bepp/email-signatures](./apps/web) | Email signature generator | 3000 |

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
│   ├── web/          # @bepp/email-signatures - Next.js
├── turbo.json        # Turborepo configuration
├── pnpm-workspace.yaml
└── package.json
```

## Adding a New App

1. Create a new directory under `apps/`
2. Add a `package.json` with name `@bepp/your-app-name`
3. Include `dev`, `build`, and `lint` scripts
4. Run `pnpm install` from the root
