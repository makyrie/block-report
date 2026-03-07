# CLAUDE.md

## Project

Block Report — hyperlocal civic intelligence for San Diego neighborhoods.
React + TypeScript + Vite + Leaflet + Tailwind. Anthropic Claude API for brief generation.

## Team Conventions

### Branching

- Never commit directly to `main`.
- Use feature branches named `{workstream}/{description}`, e.g. `data/311-fetch`, `map/leaflet-setup`, `brief/print-layout`.
- Keep branches short-lived. Merge to main via PR (or fast-forward merge if no conflicts) frequently — at least once per hour.
- Pull from main before starting new work. Rebase onto main if your branch has drifted.

### Workstreams

Three parallel workstreams. Stay in your lane to avoid merge conflicts.

| Workstream | Owns these directories | Primary responsibility |
|------------|----------------------|----------------------|
| `data` | `src/data/`, `src/types/` | SODA API, Census API, data fetching, aggregation |
| `map` | `src/components/map/`, `src/components/ui/`, `src/App.tsx` | Leaflet map, sidebar, layout, UI shell |
| `brief` | `src/components/brief/`, `src/api/` | Claude API integration, brief generation, print layout |

Shared files (`src/types/index.ts`, `src/App.tsx`, config files) require coordination. Call out before editing them.

### Code Style

- TypeScript strict mode. No `any` types unless truly unavoidable and marked with `// TODO: type this`.
- Functional components with hooks. No class components.
- Use the shared interfaces in `src/types/index.ts` as the contract between workstreams. If you need to change an interface, tell the team first.
- Tailwind for styling. No separate CSS files except `src/print.css` for print-specific styles.
- Name files in kebab-case: `neighborhood-profile.tsx`, `soda-client.ts`.

### Commits

- Write short, descriptive commit messages: `add 311 data fetching via SODA API`, `wire up marker click to sidebar panel`.
- Don't squash — keep the history readable for judges reviewing the repo.

### Environment

- API keys go in `.env.local` (gitignored). Use `VITE_` prefix for client-side vars.
- `.env.example` lists required vars without values.
- Required env vars: `VITE_ANTHROPIC_API_KEY`, `VITE_CENSUS_API_KEY`.

### Dependencies

- Check if an existing dependency covers your need before adding a new one.
- If you add a dependency, mention it in your PR/commit so others know to `npm install`.

### What NOT to Do

- Don't refactor or reorganize files another workstream owns.
- Don't install a CSS framework or component library beyond Tailwind — we don't have time to debate it.
- Don't optimize prematurely. Working > fast > pretty. We can polish after 2:00 PM.
- Don't spend more than 15 minutes stuck on something. Ask the team or work around it.

## Project Structure

```
block-report/
├── public/
├── src/
│   ├── api/              # Claude API proxy/client (brief workstream)
│   ├── components/
│   │   ├── map/          # Leaflet map, markers, overlays (map workstream)
│   │   ├── brief/        # Brief generator, print layout (brief workstream)
│   │   └── ui/           # Shared UI: sidebar, panels, selectors (map workstream)
│   ├── data/             # SODA client, Census client, aggregation (data workstream)
│   ├── types/            # Shared TypeScript interfaces (all — coordinate changes)
│   │   └── index.ts
│   ├── App.tsx           # Main app shell (map workstream, coordinate changes)
│   ├── main.tsx
│   └── print.css         # Print-only styles (brief workstream)
├── .env.example
├── CLAUDE.md
├── README.md
└── package.json
```

## Key Data Endpoints

```bash
# Get It Done (311) — SODA API
# Docs: https://data.sandiego.gov/datasets/get-it-done-311/
curl "https://data.sandiego.gov/resource/h3qk-cz8g.json?\$limit=5"

# Library locations
curl "https://data.sandiego.gov/resource/govk-26ga.json"

# Recreation center locations
curl "https://data.sandiego.gov/resource/qjzh-bwut.json"

# Transit routes (GeoJSON)
# https://data.sandiego.gov/datasets/transit-routes/

# Census ACS — language spoken at home by tract
# https://api.census.gov/data/2022/acs/acs5?get=B16001_001E,B16001_003E&for=tract:*&in=state:06&in=county:073
```

## Timeline Awareness

- 10:30 AM: First commit allowed. Start building.
- 1:00 PM: Integration checkpoint. All workstreams merge to main and verify things connect.
- 2:30 PM: Feature freeze. No new code. Bug fixes, README, demo prep only.
- 3:00 PM: Submit via MCP server. Demo.
