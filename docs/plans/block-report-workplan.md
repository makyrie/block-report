# Block Report — Hackathon Workplan
**Team: Ctrl+P**

## The Pitch (60 seconds)

San Diego publishes powerful open data — but the neighborhoods that most need it are the least likely to find it on a data portal. Block Report lets anyone enter an address or pick a neighborhood and instantly see what's happening: what residents are reporting, how fast the city responds, what languages the community speaks, and what civic resources are nearby. Then it generates a printable, multilingual community brief — designed to be posted at a library, rec center, laundromat, or anywhere neighbors gather.

It's not a dashboard for data nerds. It's a tool for community self-advocacy.

---

## Team Roles

Three people, all comfortable with Claude Code. Divide by **workstream**, not by skill.

| Person | Workstream | Focus |
|--------|-----------|-------|
| **Person A** | Data Pipeline | SODA API integration, data fetching, aggregation, Census language data |
| **Person B** | Map & Frontend | React app, Leaflet map, neighborhood selector, UI shell |
| **Person C** | Brief Generator | Claude API integration, printable output, language support, MCP server (stretch) |

Everyone should be in the same repo from the start. Agree on interfaces early (what shape does the data come in, what does the brief generator expect) and then work in parallel.

---

## Timeline (11:00 AM – 5:00 PM, ~6 hours)

### 11:00–11:30 — Setup & Alignment (all together, 30 min)

- [ ] Create repo, set up Vite + React + TypeScript + Tailwind + Leaflet
- [ ] Agree on project structure and file layout
- [ ] Agree on data interfaces (see "Key Interfaces" below)
- [ ] Person A: register for Census API key now: https://api.census.gov/data/key_signup.html (instant)
- [ ] Confirm Anthropic API credits are working
- [ ] Each person pulls the repo and confirms they can run `npm run dev`

### 11:30–1:30 — Parallel Build, Phase 1 (2 hours)

**Person A — Backend & Data Pipeline:**
- [ ] Set up Express server (`server/index.ts`) with CORS and JSON middleware
- [ ] Implement file-based cache utility (`server/cache.ts`) — 24h TTL, keyed by URL hash
- [ ] Build SODA API service (`server/services/soda.ts`) with caching
- [ ] Implement `/api/locations/libraries` and `/api/locations/rec-centers` endpoints
- [ ] Implement `/api/311?community={name}` — fetch and aggregate 311 data per community: request count, resolution rate, avg days to close, top problem types
- [ ] Implement `/api/locations/transit-stops` endpoint
- [ ] Configure Vite proxy: `'/api' → 'http://localhost:3001'`
- [ ] Add `dev:all` script using `concurrently` to run frontend + backend

**Person B — Map & Frontend:**
- [ ] Build frontend API client (`src/api/client.ts`) — thin fetch wrapper for `/api/*` routes
- [ ] Set up Leaflet map centered on San Diego (32.7157, -117.1611)
- [ ] Build address/neighborhood search input as the primary entry point (geocode to lat/lng → determine community)
- [ ] On neighborhood selection: show boundary on map, populate sidebar with metrics
- [ ] Build sidebar/panel UI shell: neighborhood name, metrics placeholder, brief placeholder
- [ ] Add library + rec center markers as a secondary "nearby resources" layer
- [ ] Add transit stop layer (small dots or heatmap — keep it lightweight)
- [ ] Community boundary overlay for selected neighborhood

**Person C — Brief Generator:**
- [ ] Build Claude service (`server/services/claude.ts`) using Anthropic SDK
- [ ] Implement `/api/brief/generate` POST endpoint (`server/routes/brief.ts`)
- [ ] Design the brief prompt template (see "Brief Template" below)
- [ ] Build the printable brief component with CSS `@media print` styling
- [ ] Design the print layout: header, neighborhood name, key stats, good news section, "how to participate" section, QR code to full app

### 1:30–2:00 — Lunch + Integration Check

- [ ] Merge branches, resolve conflicts
- [ ] Person A's data → Person B's map: do markers load? Does clicking populate data?
- [ ] Person A's data → Person C's brief: does the generator receive the right shape?
- [ ] Identify what's broken and prioritize fixes

### 2:00–4:00 — Phase 2: Polish & Features (2 hours)

**Person A:**
- [ ] Implement Census API service (`server/services/census.ts`) with caching
- [ ] Implement `/api/demographics?tract={id}` endpoint — ACS language data by tract
  - Table B16001: Language spoken at home
  - Join to neighborhoods via tract-to-community mapping
- [ ] Compute "access gap" signals: low 311 rate + low transit density + high non-English speaking population
- [ ] Expose gap scores through an endpoint or as part of the 311 response

**Person B:**
- [ ] Add choropleth or heatmap layer showing access gap score by neighborhood
- [ ] Add language selector dropdown (populated from Census data for selected area)
- [ ] Polish the UI: loading states, error handling, mobile-responsive basics
- [ ] Add "Generate Brief" button that triggers Person C's module

**Person C:**
- [ ] Add multilingual brief generation (pass selected language to Claude prompt)
- [ ] Add "good news" section to brief: recently resolved 311 issues, new permits (if time)
- [ ] Add "how to get involved" section with concrete next steps (council district contact, 311 info, upcoming meetings)
- [ ] If time: start MCP server wrapping SODA API (see stretch goals)

### 4:00–4:30 — Demo Prep (30 min)

- [ ] Freeze features — no new code after 4:00
- [ ] Fix any remaining bugs in the demo flow
- [ ] Record 60-second demo video (or confirm live demo works)
- [ ] Write/finalize README (see template below)
- [ ] Submit via MCP submission server
- [ ] Push final code to public GitHub repo

### 4:30–5:00 — Buffer / Presentations

- [ ] Present or submit
- [ ] Celebrate

---

## Key Data Sources

| Dataset | Portal URL | Format | Key Fields |
|---------|-----------|--------|------------|
| Get It Done (311) | data.sandiego.gov/datasets/get-it-done-311/ | CSV, API | date, problem_category, lat/lng, status, date_closed |
| Library Locations | data.sandiego.gov/datasets/library-locations/ | GeoJSON, CSV | name, address, lat/lng, website, phone |
| Recreation Centers | data.sandiego.gov/datasets/recreation-center-locations/ | GeoJSON, CSV | name, address, community, facilities |
| Transit Routes | data.sandiego.gov/datasets/transit-routes/ | GeoJSON | route_name, route_type, geometry |
| Transit Stops (SANDAG) | sdgis-sandag.opendata.arcgis.com | GeoJSON | stop coordinates |
| Census ACS Language | api.census.gov/data/2022/acs/acs5 | JSON API | B16001 table (language spoken at home by tract) |
| Permits (stretch) | data.sandiego.gov/datasets/ (search for permits) | CSV | type, date, location, status |

---

## Key Interfaces

Agree on these shapes early so you can work in parallel.

```typescript
// The primary object — what the user sees when they search a neighborhood
// Person A produces this via backend, Person B displays it, Person C uses it for briefs
interface NeighborhoodProfile {
  communityName: string;
  center: { lat: number; lng: number }; // geographic center of the community
  metrics: {
    totalRequests311: number;
    resolvedCount: number;
    resolutionRate: number;  // 0-1
    avgDaysToResolve: number;
    topIssues: { category: string; count: number }[];
    recentlyResolved: { category: string; date: string }[]; // good news
  };
  transit: {
    nearbyStopCount: number;  // within community boundary
    routeCount: number;       // unique routes serving the area
  };
  demographics: {
    topLanguages: { language: string; percentage: number }[];
  };
  nearbyResources: CivicResource[]; // libraries, rec centers, etc.
  accessGapScore?: number; // computed composite, 0-100
}

// Secondary — nearby civic resources shown on the map and linked in briefs
interface CivicResource {
  id: string;
  name: string;
  type: 'library' | 'rec_center';
  lat: number;
  lng: number;
  address: string;
  phone?: string;
  website?: string;
}

// Person C produces this from NeighborhoodProfile
interface CommunityBrief {
  neighborhoodName: string;
  language: string;
  generatedAt: string;
  summary: string;        // plain-language overview
  goodNews: string[];     // positive developments
  topIssues: string[];    // what the community is reporting
  howToParticipate: string[]; // concrete next steps
  nearbyResources: { name: string; address: string; type: string }[];
  contactInfo: {
    councilDistrict: string;
    phone311: string;
  };
}
```

---

## Brief Prompt Template (Person C)

```
You are generating a community brief for the {communityName} neighborhood of
San Diego. The brief will be printed and posted in the community — at a library,
rec center, laundromat, or wherever neighbors gather.

Write in {language}. Use clear, warm, accessible language at a 6th-grade reading
level. Avoid jargon.

Here is the data for this neighborhood:
{neighborhoodProfile as JSON}

Generate a brief with these sections:
1. **Welcome** — A 2-sentence greeting that names the neighborhood.
2. **Good News** — 2-3 positive things happening based on the data (resolved
   issues, investments, improvements).
3. **What Your Neighbors Are Reporting** — Top 3 issues being reported via 311,
   framed constructively (not as complaints, but as things the community is
   working on).
4. **How to Get Involved** — 3-4 concrete actions: how to file a 311 report,
   how to attend council meetings, how to contact their council representative,
   where to find more info.
5. **Nearby Resources** — List the closest libraries and rec centers with
   addresses, if available in the data.
6. **Transit Info** — How many transit stops and routes serve the area.

Keep the total brief under 400 words. It should fit on one printed page.
```

---

## README Template (for submission)

```markdown
# Block Report

## Team: Ctrl+P
- [Name] — [Role/focus]
- [Name] — [Role/focus]
- [Name] — [Role/focus]

## Problem Statement
San Diego's open data is powerful but inaccessible to the communities that
need it most. Neighborhoods with low digital access, language barriers, or
limited transit to civic meetings are underrepresented in 311 reports, public
comment, and service utilization. The data shows the gap — but nobody is
turning that data into action at the neighborhood level.

## What It Does
Block Report lets anyone enter an address or pick a San Diego neighborhood and
instantly see a civic profile: what residents are reporting via 311, how fast the
city responds, what languages the community speaks, and what resources are
nearby. It then generates a printable, multilingual community brief designed to
be posted at a library, rec center, laundromat, or anywhere neighbors gather —
turning open data into a tool for community self-advocacy.

## Data Sources
- Get It Done (311) reports — data.sandiego.gov
- Library locations — data.sandiego.gov
- Recreation center locations — data.sandiego.gov
- Transit routes/stops — data.sandiego.gov / SANDAG
- Census ACS language data — api.census.gov
- [Any additional sources]

## Architecture
[Describe or paste a simple diagram]
- React + TypeScript + Vite frontend
- Express + Node.js backend (API key management, caching, aggregation)
- Leaflet map with GeoJSON overlays
- SODA API for city open data (via backend with 24h file cache)
- Census API for language demographics (via backend with 24h file cache)
- Census API for language demographics
- Anthropic Claude API for brief generation
- Print-optimized CSS for community briefs

## Links
- Live app: [URL if deployed]
- Demo video: [URL]

## How to Run Locally
\`\`\`bash
git clone [repo-url]
cd block-report
npm install
cp .env.example .env  # add your API keys
npm run dev
\`\`\`
```

---

## Stretch Goals (in priority order)

1. **MCP Server for SD Open Data** — Wrap the SODA API as an MCP server so any Claude user can query city data. This is the biggest bonus-point opportunity and the most lasting artifact.
2. **PDF generation** — Generate actual downloadable PDFs instead of relying on browser print.
3. **Transit travel time to City Hall** — Calculate approximate transit time from each anchor to City Hall (202 C St) using GTFS schedule data.
4. **Permit activity overlay** — Show recent permit approvals as a "good news" investment signal.
5. **Historical trends** — Show 311 resolution rates improving or declining over time per neighborhood.
6. **Deploy** — Get it on Vercel/Netlify with a public URL (eliminates need for demo video).

---

## Presentation Tips

**For the judging rubric:**
- **Civic Impact (5pts):** Lead with the problem and the specific audience. "This is for anyone in Barrio Logan who wants to know what's happening in their neighborhood and how to get involved — in their language." Name a real neighborhood.
- **Use of City Data (5pts):** Explicitly name every dataset you joined. The rubric rewards creative combinations. "We joined 311 data with transit stop density and Census language data to identify access gaps."
- **Technical Execution (5pts):** Demo a complete flow: search a neighborhood → see the profile → generate a brief → show the print layout. One clean path through the app beats showing five half-working features.
- **Presentation & Story (5pts):** End with the printable brief. Hold it up (or show it on screen). That physical artifact makes the impact tangible in a way a dashboard doesn't.

**The emotional hook:**
The city just launched its first-ever Community Recreation Needs Assessment to study exactly these equity gaps. Block Report doesn't just study the problem — it puts actionable information directly into the hands of the communities being studied.
