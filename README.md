# bepp-email-signature

A Next.js application for generating BEPP email signatures with photo upload functionality.

## Running Locally

### Prerequisites

- Node.js (version 18 or higher recommended)
- npm (comes with Node.js)

### Setup

1. Create `.env.local`. Make a copy of the file `.env.local.example` and store it in `.env.local`

	```bash
	cp .env.local.example .env.local
	```

	Populate the `.env.local` file with your Vercel Blob storage token:
	```
	BLOB_READ_WRITE_TOKEN=your_token_here
	```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:3000` (the app will open automatically)

### Additional Commands

- **Build for production**: `npm run build`
  - Compiles TypeScript and creates optimized production build

- **Start production server**: `npm start`
  - Serves the production build locally (run `npm run build` first)

- **Lint code**: `npm run lint`
  - Runs ESLint to check for code issues

## Deployment

This project is configured for deployment on Vercel. The API route at `/api/upload` handles image uploads to Vercel Blob storage.

Make sure to set the `BLOB_READ_WRITE_TOKEN` environment variable in your Vercel project settings.
