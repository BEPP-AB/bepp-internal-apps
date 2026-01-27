# bepp-email-signature

## Running Locally

### Prerequisites

- Node.js (version 14 or higher recommended)
- npm (comes with Node.js)

### Setup


1. Create .env.local. Make a copy of the file `.env.local.example` and store it in `.env.local`

	```bash
	cp .env.local.example .env.local
	```

	Populate the `.env.local` file with values.

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
  - Compiles TypeScript and creates optimized production build in the `dist/` directory

- **Preview production build**: `npm run preview`
  - Serves the production build locally for testing
