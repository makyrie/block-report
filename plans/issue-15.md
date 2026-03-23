---
title: "feat: Multilingual Flyer PDF Export"
type: feat
status: completed
date: 2026-03-23
---

# feat: Multilingual Flyer PDF Export

## Overview

Add a **Download as PDF** button to the community brief flyer that exports translated content as a properly formatted PDF — ready to print or share without browser dependency. The PDF must faithfully reproduce the on-screen `FlyerLayout` for all 6 supported languages (EN, ES, VI, TL, ZH, AR), including CJK characters and RTL Arabic text.

## Problem Statement

The community brief generates a print-ready HTML flyer with multilingual text via Claude, but there is no way to export it as a PDF. Users must rely on the browser's print dialog, which produces inconsistent results across browsers/OS and doesn't work for digital sharing (email attachments, community portals, group chats).

## Proposed Solution

Server-side PDF generation using **Puppeteer** (specifically `puppeteer-core` + `@sparticuz/chromium` for Vercel compatibility). The server renders the `FlyerLayout` React component to static HTML via `ReactDOMServer.renderToStaticMarkup()`, injects it into a headless Chromium page with inlined CSS and fonts, and returns a PDF binary.

### Architecture

```
Frontend                          Backend (Express)
┌──────────────┐    POST          ┌─────────────────────────┐
│ Download PDF │ ──────────────→  │ POST /api/brief/pdf     │
│ Button       │  {report, slug,  │                         │
│              │   metrics, langs} │ 1. Validate + sanitize  │
│              │                  │ 2. SSR FlyerLayout      │
│ ← blob URL  │ ←──────────────  │ 3. Inject HTML + CSS    │
│   download   │   application/   │ 4. Puppeteer → PDF      │
└──────────────┘   pdf binary     │ 5. Return PDF buffer    │
                                  └─────────────────────────┘
```

## Technical Considerations

### Puppeteer on Vercel Serverless

- Standard Puppeteer bundles ~280MB Chromium. Vercel has a 250MB compressed limit per function.
- **Solution:** Use `puppeteer-core` + `@sparticuz/chromium` (serverless-optimized Chromium, ~50MB compressed).
- The PDF endpoint should be part of the existing `api/index.ts` entry point (single-function Vercel deployment pattern already in use). If bundle size becomes a problem, extract to a separate Vercel function (`api/pdf.ts`).
- **Timeout budget:** Vercel 60s hard limit. Target: Chromium launch ~5s, page render ~3s, PDF generation ~2s = ~10s typical. Set internal timeout at 45s to return a meaningful error before Vercel kills the function.

### React Server-Side Rendering Strategy

Use `ReactDOMServer.renderToStaticMarkup()` to render `FlyerLayout` to HTML on the server:

1. The POST body sends the full data (`CommunityReport`, `neighborhoodSlug`, `metrics`, `topLanguages`).
2. Server renders the component to static HTML string.
3. Tailwind CSS must be inlined — extract at build time from the Vite output or use a standalone Tailwind CLI build for the flyer subset.
4. Inject the HTML + CSS into Puppeteer via `page.setContent()`.
5. Call `page.pdf({ format: 'letter' })` and return the buffer.

### `window.location.origin` Fix

`FlyerLayout` references `window.location.origin` on lines 34 and 212 (`flyer-layout.tsx`). This crashes in SSR.

**Solution:** Add a `baseUrl` prop to `FlyerLayout` that defaults to `window.location.origin` when in browser, but accepts a string from the server. The server passes the production URL (from `VERCEL_URL` or `APP_URL` env var).

```typescript
// flyer-layout.tsx — updated interface
interface FlyerLayoutProps {
  report: CommunityReport;
  neighborhoodSlug: string;
  metrics?: NeighborhoodProfile['metrics'] | null;
  topLanguages?: { language: string; percentage: number }[];
  inline?: boolean;
  baseUrl?: string; // NEW: for SSR, defaults to window.location.origin
}
```

### Font Provisioning for CJK and Arabic

Headless Chromium on Linux (Vercel) has no CJK or Arabic system fonts. Without them, Chinese renders as tofu and Arabic won't join cursively.

**Solution:** Bundle web fonts and load via `@font-face` in the injected CSS:
- **Noto Sans** (Latin, Arabic): ~200KB
- **Noto Sans SC** (Simplified Chinese): ~4MB (subset to reduce size)
- **Noto Sans TC** (Traditional Chinese): evaluate if needed
- Store font files in `server/fonts/` or load from a CDN (Google Fonts) in the injected HTML.

### RTL Support for Arabic

The `FlyerLayout` component is currently LTR-only. For Arabic:
- Add `dir="rtl"` to the root flyer `<div>` when `report.language === 'Arabic'` (or language code `ar`).
- Use Tailwind's `rtl:` variant for directional styles (text alignment, flex direction).
- This is a prerequisite change that benefits both screen and PDF rendering.

### Date Localization Bug

`FlyerLayout` line 28 hardcodes `toLocaleDateString('en-US', ...)`. Fix: use the report's language code to format the date appropriately (e.g., `'es'` for Spanish dates).

### CSS Strategy

Two options for making Tailwind styles available in the PDF:

1. **Build-time extraction (preferred):** Add a build step that generates a standalone CSS file containing only the classes used by `FlyerLayout`. Include `print.css` styles. The PDF endpoint reads this file and inlines it.
2. **CDN fallback:** Include a Tailwind CDN script in the injected HTML. Simpler but slower (network fetch during generation) and less reliable.

Option 1 is preferred for reliability and speed.

### QR Code Rendering

`qrcode.react`'s `QRCodeSVG` component works with `ReactDOMServer.renderToStaticMarkup()` — it outputs a standard SVG element. No special handling needed as long as the component is rendered via React SSR (not a separate library).

## System-Wide Impact

- **Interaction graph:** Download button → `POST /api/brief/pdf` → React SSR → Puppeteer → PDF buffer → blob download. No other systems are triggered.
- **Error propagation:** Puppeteer errors (launch failure, timeout, OOM) must be caught and returned as structured JSON errors, not raw 500s. The frontend displays user-friendly error messages.
- **State lifecycle risks:** No persistent state changes. PDF generation is stateless — no cache writes, no DB mutations. If it fails mid-render, nothing is left in an inconsistent state.
- **API surface parity:** The new endpoint is additive. No existing endpoints change. The `FlyerLayout` component gains one optional prop (`baseUrl`) with a backward-compatible default.
- **Integration test scenarios:**
  1. Generate a report → download PDF → verify PDF is valid and contains expected text
  2. Switch language to Chinese → download PDF → verify CJK characters render
  3. Two concurrent PDF requests → both succeed within timeout
  4. Report with missing metrics → PDF generates with sections appropriately hidden

## Acceptance Criteria

### Functional Requirements

- [x] "Download PDF" button appears on the generated brief (in `flyer-preview.tsx` alongside existing Print/Expand buttons)
- [x] Clicking the button downloads a `.pdf` file named `{neighborhood-slug}-{lang-code}.pdf` (e.g., `mira-mesa-es.pdf`)
- [x] PDF output visually matches the on-screen flyer layout
- [x] Works for all 6 supported languages: EN, ES, VI, TL, ZH, AR
- [x] CJK characters (Chinese) render correctly — no tofu/boxes
- [x] Arabic text renders RTL with correct cursive joining
- [x] PDF is legible at standard letter size (8.5" × 11")
- [x] QR code in PDF is scannable and points to the correct neighborhood URL
- [x] Date on flyer is formatted in the report's language (fix existing `en-US` hardcoding)

### Non-Functional Requirements

- [x] PDF generation completes within 45 seconds (within Vercel's 60s limit)
- [x] Button shows loading state during generation and is disabled to prevent duplicate requests
- [x] Error state displays on failure with ability to retry
- [x] Endpoint is rate-limited (reuse existing report limiter pattern: 10 req/15min)
- [x] Report content is HTML-escaped before injection into Puppeteer page (XSS prevention)
- [x] `baseUrl` prop on `FlyerLayout` does not break existing browser rendering

## Implementation Phases

### Phase 1: FlyerLayout SSR Prerequisites

Modify `FlyerLayout` to support server-side rendering:

1. **Add `baseUrl` prop** to `FlyerLayoutProps` — defaults to `typeof window !== 'undefined' ? window.location.origin : ''` (`flyer-layout.tsx`)
2. **Replace `window.location.origin`** references on lines 34 and 212 with the `baseUrl` prop
3. **Fix date localization** — use a language-to-locale map instead of hardcoded `'en-US'` (line 28)
4. **Add RTL support** — conditional `dir="rtl"` on root div when language is Arabic
5. **Verify existing browser behavior** is unchanged (all existing call sites pass no `baseUrl`, so the default kicks in)

Files touched:
- `src/components/flyer/flyer-layout.tsx`

### Phase 2: Backend PDF Endpoint

1. **Install dependencies:** `puppeteer-core`, `@sparticuz/chromium`
2. **Create `server/services/pdf.ts`** — PDF generation service:
   - `generateFlyerPdf(data: PdfRequest): Promise<Buffer>` function
   - Launch Chromium via `@sparticuz/chromium` (or system Chromium in dev)
   - Render `FlyerLayout` to static HTML via `ReactDOMServer.renderToStaticMarkup()`
   - Inline Tailwind CSS + print.css + `@font-face` declarations
   - Set content in Puppeteer page, generate PDF at letter size
   - Return PDF buffer
3. **Create `server/routes/pdf.ts`** — Express route:
   - `POST /api/brief/pdf` endpoint
   - Validate and sanitize request body (report content, slug, language)
   - Call `generateFlyerPdf()`
   - Return PDF with `Content-Type: application/pdf` and `Content-Disposition: attachment; filename="slug-lang.pdf"`
4. **Mount route** in `server/app.ts` with rate limiting
5. **Add internal timeout** (45s) to prevent Vercel hard-kill without error message

Files touched:
- `server/services/pdf.ts` (new)
- `server/routes/pdf.ts` (new)
- `server/app.ts` (mount route)
- `package.json` (new dependencies)

### Phase 3: Font Provisioning & CSS Extraction

1. **Add font files** — Noto Sans (Latin/Arabic) and Noto Sans SC (Chinese) to `server/fonts/` or reference Google Fonts CDN
2. **Create CSS extraction** — build script or manual extraction of Tailwind classes used by FlyerLayout + print.css into a standalone file (`server/assets/flyer.css`)
3. **Wire into PDF service** — read CSS file and inline it in the HTML template passed to Puppeteer

Files touched:
- `server/fonts/` (new, if bundling)
- `server/assets/flyer.css` (new)
- `server/services/pdf.ts` (read and inline CSS)

### Phase 4: Frontend Download Button

1. **Add `downloadPdf()` function** to `src/api/client.ts`:
   - POST to `/api/brief/pdf` with report data
   - Receive blob response
   - Create blob URL and trigger download
2. **Add "Download PDF" button** to `flyer-preview.tsx`:
   - Place alongside existing Print and Full Size buttons
   - Loading spinner + disabled state during generation
   - Error toast on failure with retry
3. **Add i18n translation keys** for button labels (`flyer.downloadPdf`, `flyer.downloading`, `flyer.downloadError`)

Files touched:
- `src/api/client.ts`
- `src/components/flyer/flyer-preview.tsx`
- `src/i18n/translations.ts`

### Phase 5: Testing & Polish

1. **Manual testing** — generate PDFs for all 6 languages, verify layout, QR codes, fonts
2. **Verify Vercel deployment** — test that the function deploys within size limits and generates PDFs in production
3. **Edge cases** — missing metrics, missing demographics, very long report text, concurrent requests

## Alternative Approaches Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Puppeteer + @sparticuz/chromium** (chosen) | Faithful HTML rendering, reuses existing component, handles all CSS/fonts | Heavy dependency (~50MB), cold start latency, Vercel size limits | Best fidelity-to-effort ratio |
| **@react-pdf/renderer** | Lightweight, no browser dependency, fast | Requires completely rebuilding the flyer layout in a different API — cannot reuse `FlyerLayout` | Too much duplication |
| **Client-side html2canvas + jsPDF** | No server dependency, works offline | Poor font rendering, inconsistent across browsers, heavy client bundle (~500KB), canvas doesn't handle SVG QR codes well | Quality too low |
| **External service (Browserless, Gotenberg)** | Offloads heavy rendering, no Vercel size concerns | External dependency, latency, cost, another service to manage | Over-engineered for MVP |
| **Enhanced window.print() with instructions** | Zero implementation cost | Doesn't solve the actual problem — inconsistent output, no programmatic download | Not a real solution |

## Dependencies & Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `@sparticuz/chromium` exceeds Vercel function size limit | Medium | High — blocks deployment | Test deployment early in Phase 2. Fallback: separate Vercel function for PDF |
| CJK font bundle too large for serverless | Medium | Medium — Chinese PDFs fail | Use Google Fonts CDN in injected HTML instead of bundling. Or subset the font |
| Chromium cold start exceeds timeout | Low | Medium — intermittent failures | Vercel keeps functions warm for ~15min. Add retry logic on frontend |
| Tailwind CSS extraction misses classes | Medium | Low — styling gaps in PDF | Visual QA all 6 languages. Can fix incrementally |
| Arabic RTL layout issues | Medium | Medium — Arabic PDFs unusable | Test RTL thoroughly. Limit scope to major layout direction, not pixel-perfect mirroring |

## Success Metrics

- PDF downloads work for all 6 languages without rendering errors
- 95th percentile generation time under 15 seconds
- Zero XSS vulnerabilities in the PDF generation pipeline
- PDF file size under 2MB for typical reports

## Sources & References

### Internal References

- Flyer layout component: `src/components/flyer/flyer-layout.tsx`
- Flyer preview (button location): `src/components/flyer/flyer-preview.tsx`
- Print styles: `src/print.css`
- Report route pattern: `server/routes/report.ts`
- API client pattern: `src/api/client.ts`
- i18n translations: `src/i18n/translations.ts`
- Type definitions: `src/types/index.ts`
- Express app setup: `server/app.ts`
- Vercel config: `vercel.json`

### Institutional Learnings (docs/solutions/)

- **File-based caching doesn't work on Vercel** — use DB-backed caching if PDF caching is added later
- **HTML-escape all external data** before injecting into templates (XSS prevention)
- **Rate limiting must fail closed** — if rate-limit store is unreachable, block the request
- **Cache keys must encode ALL factors** — if caching PDFs, key on `community + language`
- **Input sanitization** — validate and sanitize all POST body fields before processing
- **60s Vercel timeout** — set internal timeout at 45s to leave headroom for cold starts
- **Atomic writes** — if writing PDFs to disk, use temp file + rename pattern

### External References

- `@sparticuz/chromium`: Serverless-optimized Chromium for AWS Lambda / Vercel
- `puppeteer-core`: Headless browser automation (without bundled Chromium)
- Google Noto Fonts: CJK and Arabic font coverage
- Upstream issue: bookchiq/block-report#80
- GitHub issue: makyrie/block-report#15
