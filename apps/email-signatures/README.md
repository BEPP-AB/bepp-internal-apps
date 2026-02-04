# @bepp/email-signatures

A Next.js application for generating Bepp email signatures with photo upload functionality.

## Running Locally

### Prerequisites

- Node.js (version 18 or higher recommended)
- pnpm

### Setup

1. Create `.env.local`. Make a copy of the file `.env.local.example` and store it in `.env.local`

   ```bash
   cp .env.local.example .env.local
   ```

   Populate the `.env.local` file with your Vercel Blob storage token.

2. From the monorepo root, install dependencies:
   ```bash
   pnpm install
   ```

3. Start the development server:
   ```bash
   pnpm --filter @bepp/email-signatures dev
   ```
   Or from the monorepo root:
   ```bash
   pnpm dev
   ```

4. Open your browser and navigate to `http://localhost:3000`



## Deployment

This project is deployed when pushed to github (Vercel intergration)