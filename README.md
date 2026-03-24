# Block Report

## Team

- **Team name:** Team Ctrl+P
- **Members:** Sarah L ([@bookchiq](https://github.com/bookchiq)), Cherr B ([@ch3rr17](https://github.com/ch3rr17)), Nicholas B ([@spotshare-nick](https://github.com/spotshare-nick))

## Problem Statement

San Diego residents, community organizers, and council staff lack a quick, digestible way to access hyperlocal civic data — 311 service requests, nearby public resources, and language demographics — for their specific neighborhood. This information is scattered across multiple city portals and Census datasets, making it hard to get a clear picture of what's happening on your block and what resources are available.

## What It Does

Block Report is a hyperlocal civic intelligence tool for San Diego neighborhoods. Enter an address or pick a neighborhood to see a civic profile — libraries, rec centers, transit stops, 311 service requests, and language demographics — then generate a printable, multilingual community brief powered by Claude. Every neighborhood has a shareable URL (e.g. `/neighborhood/mira-mesa`) ready for QR codes on printed flyers.

## Data Sources Used

- **San Diego Open Data Portal** — library locations, recreation centers, transit stops, and 311/Get It Done service requests
- **U.S. Census ACS** — language spoken at home by census tract (table C16001)
- **NeonDB (PostgreSQL)** — cloud database layer for server-side aggregation of city data

## Links

- **Live app:** [https://block-report-weld.vercel.app/](https://block-report-weld.vercel.app/)
- **Demo video:** [Loom walkthrough](https://www.loom.com/share/fa7d72af51a8478aa06e0b6b8277b735) | [Screencast](https://app.screencast.com/P8VC0Mj68TxaS)

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

Edit `.env` and set `ANTHROPIC_API_KEY` to your key and `DATABASE_URL` to your Neon PostgreSQL connection string. The Census API key is pre-filled with a development default.

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

### Database Setup

The app uses [Neon](https://neon.tech/) (serverless PostgreSQL) via Prisma ORM. Create a free Neon project and add the connection string to your `.env` as `DATABASE_URL`.

```bash
pnpm db:push    # Push schema to Neon (creates tables)
pnpm db:seed    # Seed with San Diego open data
```

After seeding, create the stored function used by the 311 metrics endpoint:

```bash
psql $DATABASE_URL -f prisma/functions/get_community_metrics.sql
```

### Vercel Deployment

The app is deployed to Vercel with a hybrid static + serverless architecture. The SPA is served from Vercel's CDN and the Express API runs as a single serverless function via `api/index.ts`.

**Required environment variables** (set in Vercel Dashboard → Project Settings → Environment Variables):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Anthropic API key for report generation |
| `CENSUS_API_KEY` | U.S. Census API key |
| `CORS_ORIGIN` | Production domain (e.g., `https://block-report-weld.vercel.app`) |

`VERCEL` and `VERCEL_URL` are auto-set by Vercel. The app uses `VERCEL_URL` to allow CORS for preview deployments.

**Known limitations in serverless:**
- File-based report caching is disabled (each invocation generates fresh)
- In-memory rate limiting resets per invocation (monitor API costs)
- Claude report generation may timeout on Hobby plan (10s limit); Pro plan recommended (60s)
- Health check available at `/api/health` to verify DB connectivity

## How It Works

1. **Pick a neighborhood** from the dropdown or click a marker on the map
2. **View civic data** — 311 request metrics, nearby libraries, rec centers, and transit stops
3. **Generate a brief** — Claude synthesizes the data into a printable community summary
4. **Share** — every neighborhood page has a unique URL for linking or QR codes

## Architecture / How Claude Is Used

```
React + Vite (SPA)  →  Express (API)  →  External APIs
                            │
                            ├── Anthropic Claude (brief generation)
                            ├── San Diego Open Data (libraries, rec centers, transit, 311)
                            └── Census ACS (language demographics)
```

- The frontend never talks to external APIs directly — everything flows through the Express backend
- API keys stay server-side only
- Data is stored in NeonDB (PostgreSQL) via Prisma ORM with a Neon serverless adapter
- **Claude's role:** The backend sends aggregated civic data (311 trends, nearby resources, language demographics) to Claude, which synthesizes it into a printable, plain-language community brief. Briefs can be generated in multiple languages based on the neighborhood's demographic profile.

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
- **Backend:** Express 5, TypeScript, Prisma ORM
- **Database:** NeonDB (serverless PostgreSQL)
- **AI:** Anthropic Claude API
- **Data:** San Diego Open Data Portal, U.S. Census ACS

## MCP Server (Model Context Protocol)

Block Report exposes its San Diego civic data as an MCP server, allowing any Claude Desktop or Claude Code user to query city data conversationally.

### Available Tools

| Tool | Description |
|------|-------------|
| `list_communities` | List all valid San Diego community plan area names |
| `get_311_metrics` | Get 311 service request metrics for a community |
| `get_neighborhood_profile` | Get composite civic profile (311 + transit + demographics + access gap) |
| `get_access_gap_ranking` | Get ranked list of underserved neighborhoods |
| `list_libraries` | List San Diego public library locations |
| `list_rec_centers` | List recreation center locations (filterable by community) |
| `get_demographics` | Get Census language demographics for a community |
| `get_transit_score` | Get transit accessibility score (0-100) for a community |
| `get_block_metrics` | Get 311 metrics near a specific lat/lng coordinate |

### Claude Desktop Configuration

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "block-report": {
      "command": "node",
      "args": ["--env-file=.env", "--import=tsx", "server/mcp/index.ts"],
      "cwd": "/path/to/block-report"
    }
  }
}
```

### Running the MCP Server

**Stdio transport** (for Claude Desktop / Claude Code):

```bash
pnpm mcp
```

**HTTP transport** (for remote access):

```bash
# Optional: set MCP_AUTH_TOKEN in .env for bearer token auth
pnpm mcp:http
```

The HTTP server runs on port 3002 by default (configurable via `MCP_HTTP_PORT`).

### Example Queries

Once connected, try asking Claude:

- "What are the top issues in Mira Mesa?"
- "Which San Diego neighborhoods are most underserved?"
- "How does transit access in Barrio Logan compare to the city average?"
- "What languages are spoken in City Heights?"

## Accessibility

The project enforces WCAG 2.1 AA compliance with two automated tools:

- **`@axe-core/react`** — runs in development mode and logs accessibility violations to the browser console on every render. No setup needed; just run `pnpm dev` and open the console.
- **`eslint-plugin-jsx-a11y`** — static analysis that catches common JSX accessibility issues at lint time.

Run the linter to check for violations:

```bash
pnpm lint
```

## License

ISC
