# Block Report

Hyperlocal civic intelligence for San Diego neighborhoods. Enter an address or pick a neighborhood to see a civic profile — libraries, rec centers, transit stops, 311 service requests, and language demographics — then generate a printable, multilingual community brief powered by Claude.

Every neighborhood has a shareable URL (e.g. `/neighborhood/mira-mesa`) ready for QR codes on printed flyers.

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [pnpm](https://pnpm.io/) v10+
- An [Anthropic API key](https://console.anthropic.com/) for brief generation

### Install

```bash
git clone https://github.com/bookchiq/block-report.git
cd block-report
pnpm install
```

### Configure

Copy the example env file and add your Anthropic API key:

```bash
cp .env.example .env
```

Edit `.env` and set `ANTHROPIC_API_KEY` to your key. The Census API key and local Supabase credentials are pre-filled with development defaults.

### Run

Start both the backend and frontend in one command:

```bash
pnpm dev:all
```

Or run them separately:

```bash
# Terminal 1 — Express backend (port 3001)
pnpm dev:server

# Terminal 2 — Vite frontend (port 5173)
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Local Database (optional)

The app can use a local Supabase instance for data storage. This requires:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running on your machine (Supabase runs Postgres and other services as containers)
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) — install with `brew install supabase/tap/supabase` (macOS) or `npx supabase`

Then:

```bash
pnpm db:start   # Start local Supabase (pulls Docker images on first run)
pnpm db:seed    # Seed with San Diego open data
pnpm db:reset   # Reset database to clean state
pnpm db:stop    # Stop local Supabase
```

The first `db:start` will download several Docker images, which may take a few minutes.

## How It Works

1. **Pick a neighborhood** from the dropdown or click a marker on the map
2. **View civic data** — 311 request metrics, nearby libraries, rec centers, and transit stops
3. **Generate a brief** — Claude synthesizes the data into a printable community summary
4. **Share** — every neighborhood page has a unique URL for linking or QR codes

## Architecture

```
React + Vite (SPA)  →  Express (API)  →  External APIs
                            │
                            ├── Anthropic Claude (brief generation)
                            ├── San Diego Open Data (libraries, rec centers, transit, 311)
                            └── Census ACS (language demographics)
```

- The frontend never talks to external APIs directly — everything flows through the Express backend
- API keys stay server-side only
- SODA and Census responses are cached to disk for 24 hours (`server/cache/`)

## Project Structure

```
block-report/
├── server/              # Express backend
│   ├── index.ts         # App setup and route mounting
│   ├── cache.ts         # File-based 24h cache
│   ├── routes/          # API route handlers
│   └── services/        # SODA, Census, and Claude API clients
├── src/                 # React frontend
│   ├── api/client.ts    # Fetch wrapper for /api/*
│   ├── components/
│   │   ├── map/         # Leaflet map and markers
│   │   ├── brief/       # Brief display and print layout
│   │   └── ui/          # Sidebar, selectors, panels
│   └── types/           # Shared TypeScript interfaces
├── .env.example
├── package.json
└── vite.config.ts
```

## Tech Stack

- **Frontend:** React 19, Vite, Tailwind CSS, Leaflet, React Router
- **Backend:** Express 5, TypeScript
- **AI:** Anthropic Claude API
- **Data:** San Diego Open Data Portal, U.S. Census ACS

## License

ISC
