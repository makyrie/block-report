---
title: "feat: PDF Generation for Community Briefs"
type: feat
status: completed
date: 2026-03-20
---

# feat: PDF Generation for Community Briefs

## Overview

Add server-side PDF generation so users can download community briefs as PDF files instead of relying on the browser's native print dialog. A new "Download PDF" button will sit alongside the existing "Print" button in the flyer preview. The backend renders the existing `FlyerLayout` component as HTML, captures it with Puppeteer, and returns a PDF.

## Problem Statement / Motivation

The app currently uses CSS `@media print` styling with a dedicated `FlyerLayout` component (`src/components/flyer/flyer-layout.tsx`). This works but has limitations:

1. **User friction** — Users must know to invoke browser print → Save as PDF → choose settings. Non-technical community members (the target audience) may not know this workflow.
2. **Inconsistent output** — Different browsers render print CSS differently. Chrome, Firefox, and Safari produce visually different PDFs.
3. **No programmatic generation** — Can't batch-generate PDFs for distribution at community events, email attachments, or pre-caching.
4. **Mobile limitations** — Print-to-PDF is unreliable or unavailable on many mobile browsers.

A "Download PDF" button with server-generated output solves all four problems.

## Proposed Solution

### Architecture

```
Frontend                          Backend
┌─────────────┐                  ┌──────────────────────────┐
│ FlyerPreview │──POST /api/──→ │ server/routes/report.ts   │
│ [Download    │  report/pdf    │  ├─ Build HTML from       │
│  PDF button] │                │  │  FlyerLayout template   │
│              │←─── PDF blob ──│  ├─ Launch Puppeteer       │
│ (triggers    │                │  ├─ page.pdf()             │
│  download)   │                │  └─ Return PDF buffer      │
└─────────────┘                  └──────────────────────────┘
```

**Approach: Server-side Puppeteer rendering**

Use Puppeteer with `@sparticuz/chromium` (for Vercel serverless compatibility) to render a standalone HTML page containing the flyer layout, then capture it as a PDF. This reuses the existing visual design with zero duplication.

### Why Puppeteer over alternatives

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Puppeteer + @sparticuz/chromium** | Exact visual fidelity, reuses existing FlyerLayout HTML/CSS, works on serverless | ~50MB compressed Chromium binary, cold start latency | **Selected** — best quality-to-effort ratio |
| **@react-pdf/renderer** | Lightweight, pure Node | Completely different component API, can't reuse Tailwind classes, must rebuild layout from scratch | Rejected — too much duplication |
| **pdf-lib** | Tiny, no browser | Programmatic layout only, no CSS support, must manually position every element | Rejected — impractical for complex layouts |
| **Client-side html2canvas + jsPDF** | No server changes | Poor quality, font rendering issues, no SVG support, unreliable | Rejected — quality too low for distribution |

## Technical Approach

### Phase 1: Backend PDF Endpoint

Add a `POST /api/report/pdf` endpoint to `server/routes/report.ts`.

**Request body:**

```typescript
// server/routes/report.ts
interface PdfRequest {
  report: CommunityReport;
  metrics?: NeighborhoodProfile['metrics'];
  topLanguages?: { language: string; percentage: number }[];
  neighborhoodSlug: string;
}
```

**Implementation steps:**

1. **Install dependencies**
   - `puppeteer-core` — Puppeteer without bundled Chromium
   - `@sparticuz/chromium` — Serverless-compatible Chromium binary

2. **Create HTML template builder** (`server/services/pdf.ts`)
   - Build a self-contained HTML string that replicates the `FlyerLayout` component
   - Inline all Tailwind CSS (use the compiled CSS from the Vite build, or a minimal subset)
   - Inline SVG icons directly (already done in `flyer-icons.tsx`)
   - Replace `window.location.origin` with a configurable base URL
   - Generate QR code server-side using `qrcode` (Node library) instead of `qrcode.react`

3. **Create PDF generation service** (`server/services/pdf.ts`)

```typescript
// server/services/pdf.ts
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import type { CommunityReport, NeighborhoodProfile } from '../../src/types/index.js';

interface PdfOptions {
  report: CommunityReport;
  metrics?: NeighborhoodProfile['metrics'];
  topLanguages?: { language: string; percentage: number }[];
  neighborhoodSlug: string;
  baseUrl: string;
}

export async function generatePdf(options: PdfOptions): Promise<Buffer> {
  const html = buildFlyerHtml(options);

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'Letter',
      margin: { top: '0.6in', right: '0.7in', bottom: '0.6in', left: '0.7in' },
      printBackground: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

function buildFlyerHtml(options: PdfOptions): string {
  // Build self-contained HTML with inlined CSS and data
  // Mirrors FlyerLayout component structure
}
```

4. **Add route handler** in `server/routes/report.ts`

```typescript
// server/routes/report.ts — new endpoint
router.post('/pdf', async (req: Request, res: Response) => {
  try {
    const { report, metrics, topLanguages, neighborhoodSlug } = req.body as PdfRequest;

    if (!report || !neighborhoodSlug) {
      res.status(400).json({ error: 'Missing required fields: report, neighborhoodSlug' });
      return;
    }

    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const pdf = await generatePdf({ report, metrics, topLanguages, neighborhoodSlug, baseUrl });

    const filename = `block-report-${sanitizeFilename(report.neighborhoodName)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('PDF generation error', { error: message });
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});
```

### Phase 2: Frontend Download Button

Add a "Download PDF" button next to the existing "Print" button in `src/components/flyer/flyer-preview.tsx`.

```typescript
// src/components/flyer/flyer-preview.tsx — additions
const [downloading, setDownloading] = useState(false);

async function handleDownloadPdf() {
  setDownloading(true);
  try {
    const response = await fetch('/api/report/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report, metrics, topLanguages, neighborhoodSlug: slug }),
    });
    if (!response.ok) throw new Error('PDF generation failed');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `block-report-${slug}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('PDF download failed:', err);
    // Could show a toast notification
  } finally {
    setDownloading(false);
  }
}
```

**Button placement** — Add alongside the Print button in the action buttons row:

```tsx
{/* Action buttons — src/components/flyer/flyer-preview.tsx */}
<div className="flex gap-2 mt-3 no-print">
  <button onClick={() => window.print()} className="...">
    <PrinterIcon /> {t('flyer.print')}
  </button>
  <button onClick={handleDownloadPdf} disabled={downloading} className="...">
    <DownloadIcon /> {downloading ? 'Generating...' : 'Download PDF'}
  </button>
  <button onClick={() => setModalOpen(true)} className="...">
    <ExpandIcon /> Full Size
  </button>
</div>
```

### Phase 3: HTML Template for Server-Side Rendering

The HTML template in `server/services/pdf.ts` must replicate the `FlyerLayout` component without React/browser dependencies:

**Rendering strategy:** Build a standalone HTML string (no React SSR, no live URL navigation). This avoids depending on a running frontend and keeps the PDF endpoint self-contained. The HTML template duplicates the `FlyerLayout` structure with plain HTML/CSS.

**Key challenges and solutions:**

1. **Tailwind CSS** — The project uses Tailwind v4 with JIT compilation via Vite plugin. Tailwind classes like `text-[32px]` and `tracking-[0.35em]` won't resolve without the JIT compiler. **Solution:** Run `npx @tailwindcss/cli` at build time to generate a CSS file containing all classes used by the flyer template, OR write plain CSS equivalents for the ~40 utility classes used in the flyer. The latter is simpler and avoids a build dependency.

2. **QR Code** — Use the `qrcode` npm package (pure Node, SVG output) instead of `qrcode.react`. Generate SVG string and embed inline.

3. **`window.location.origin`** — `FlyerLayout` references `window.location.origin` on lines 34 and 212 for the QR code URL and footer text. **Solution:** The HTML template uses the `baseUrl` parameter (from `APP_URL` env var or request origin). This is a template-only concern — no change needed to the React component.

4. **SVG Icons** — Already defined as inline SVG in `flyer-icons.tsx`. Copy the SVG path data into the HTML template as static `<svg>` elements.

5. **Fonts for multilingual support** — The flyer uses `font-sans` (system font stack). In headless Chromium on serverless, CJK (Chinese, Korean) and Arabic fonts may be missing. **Solution:** Include Google Fonts CDN links in the HTML template for Noto Sans and Noto Sans CJK/Arabic. Load via `<link rel="stylesheet">` — Puppeteer's `waitUntil: 'networkidle0'` ensures fonts load before PDF capture.

6. **Arabic RTL support** — Arabic is a supported language (`LANGUAGE_CODES` includes `Arabic: 'ar'`), but `FlyerLayout` has no RTL support. **Solution:** When the report language is Arabic, the HTML template adds `dir="rtl"` to the root element and swaps left-aligned classes to right-aligned. This is a template-level concern for MVP; full RTL support in the React component can follow later.

## System-Wide Impact

- **Interaction graph**: `FlyerPreview` button click → `fetch('/api/report/pdf')` → Express route → `generatePdf()` → Puppeteer launches headless Chrome → renders HTML → `page.pdf()` → Express streams buffer back → browser triggers download.
- **Error propagation**: Puppeteer launch failure (missing Chromium binary) or page rendering error → caught in try/catch → 500 response → frontend shows error state. Rate limiter on `/api/report` (10 req/15min) already covers this endpoint.
- **State lifecycle risks**: Puppeteer browser instances could leak if `browser.close()` fails. The `try/finally` pattern prevents this. No persistent state is created — PDFs are generated on-the-fly and streamed.
- **API surface parity**: The existing `POST /api/report/generate` returns JSON report data. The new `POST /api/report/pdf` takes the same report data and returns a PDF. Both live under the same `/api/report` prefix and share the same rate limiter.
- **Integration test scenarios**:
  1. Generate a report → download PDF → verify PDF is valid and contains expected text
  2. Request PDF with missing fields → verify 400 response
  3. Concurrent PDF requests → verify Puppeteer instances don't leak
  4. PDF generation on Vercel serverless → verify @sparticuz/chromium loads correctly
  5. Non-English report → verify PDF renders correct characters (CJK, Arabic, Vietnamese diacritics)

## Acceptance Criteria

### Functional Requirements

- [ ] `POST /api/report/pdf` endpoint accepts report data and returns a valid PDF (`Content-Type: application/pdf`)
- [ ] PDF visually matches the existing `FlyerLayout` print output (letter size, same sections, QR code)
- [ ] PDF fits on a single letter-size page (content must not overflow to page 2)
- [ ] "Download PDF" button appears next to the "Print" button in `FlyerPreview`
- [ ] "Download PDF" button also appears in `FlyerModal` header alongside Print button
- [ ] Button shows loading/spinner state while PDF generates (5-15 seconds)
- [ ] PDF filename includes community name and language code (e.g., `block-report-mira-mesa-en.pdf`)
- [ ] `Content-Disposition` header set correctly for browser download

### Multilingual Requirements

- [ ] English PDF renders correctly
- [ ] Spanish PDF renders correctly (accents, ñ)
- [ ] Vietnamese PDF renders correctly (diacritics)
- [ ] Chinese PDF renders correctly (CJK characters, requires Noto Sans CJK font)
- [ ] Arabic PDF renders with correct character rendering (RTL text direction as stretch goal)
- [ ] Tagalog PDF renders correctly

### Error Handling

- [ ] Missing required fields → 400 JSON error response
- [ ] Puppeteer/Chromium failure → 500 JSON error with user-friendly message
- [ ] Frontend shows error state (not silent failure) when PDF generation fails
- [ ] Endpoint respects existing rate limiting (10 req/15min on `/api/report`)

### Deployment

- [ ] Works in local development (`npx tsx server/index.ts`) with locally installed Chromium
- [ ] Works on Vercel serverless deployment (via `@sparticuz/chromium`)
- [ ] Vercel function configured with adequate memory (1024MB) and timeout (30s)

## Success Metrics

- Users can download a PDF in under 5 seconds (warm Puppeteer) / 15 seconds (cold start)
- PDF is a single letter-size page matching the print layout
- Zero browser-dependency for PDF generation (works on mobile, any browser)

## Dependencies & Risks

### New Dependencies

| Package | Size | Purpose |
|---------|------|---------|
| `puppeteer-core` | ~3MB | Headless Chrome API (no bundled Chromium) |
| `@sparticuz/chromium` | ~50MB compressed | Serverless-compatible Chromium binary |
| `qrcode` | ~200KB | Server-side QR code generation (SVG output) |

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Chromium binary too large for Vercel | Endpoint fails to deploy | `@sparticuz/chromium` is designed for this (~50MB compressed, within Vercel's 250MB limit). Verify with a minimal test function before full implementation. May need Vercel Pro. |
| Cold start latency (~5-10s) | First PDF request is slow | Accept for MVP. Frontend shows loading state. Could pre-warm with a cron ping later. |
| Memory usage (~300MB per Puppeteer instance) | Vercel function OOM | Configure `vercel.json` with `"memory": 1024` for the PDF function. Close browser immediately in `finally` block. |
| HTML template drifts from React component | PDF doesn't match screen | Keep template simple with plain CSS (not Tailwind utilities). Document that visual changes to `FlyerLayout` must be mirrored in `buildFlyerHtml()`. Add a comment at top of both files cross-referencing each other. |
| Font rendering for CJK/Arabic | Characters appear as blank boxes (tofu) | Load Google Noto fonts via CDN `<link>` in the HTML template. Puppeteer's `waitUntil: 'networkidle0'` ensures fonts load. Test all 6 supported languages. |
| Rate limiting insufficiency | Server overloaded by PDF requests | Existing 10 req/15min limiter on `/api/report` applies. Consider a dedicated stricter limiter (e.g., 5 req/15min) for the `/pdf` sub-route specifically. |
| Tailwind CSS classes not resolving | PDF renders as unstyled HTML | Use plain CSS in the HTML template instead of Tailwind classes. This eliminates the JIT compilation dependency entirely. |
| `vercel.json` not configured for PDF function | Timeout/OOM on Vercel | Add explicit `functions` config for the PDF API route with `maxDuration: 30` and `memory: 1024`. |

## Implementation Checklist

### Phase 1: Backend PDF Service (server/)

- [x] Install `puppeteer-core`, `@sparticuz/chromium`, `qrcode` (for server-side QR SVG generation)
- [x] Create `server/services/pdf.ts` with:
  - [x] `buildFlyerHtml(options)` — standalone HTML template with plain CSS (not Tailwind), inline SVG icons, CDN font links for Noto Sans/CJK/Arabic
  - [x] `generatePdf(options)` — Puppeteer launch → `page.setContent(html)` → `page.pdf()` → `browser.close()`
  - [x] Local dev detection: use `puppeteer.launch({ executablePath: '/usr/bin/chromium' })` locally, `@sparticuz/chromium` on Vercel
- [x] Add `POST /api/report/pdf` route to `server/routes/report.ts`
- [x] Add `APP_URL` to `.env.example`
- [ ] Test locally with Mira Mesa English report data
- [ ] Test with Mira Mesa Spanish report data (verify accents)

### Phase 2: Frontend Download Button (src/)

- [x] Add `handleDownloadPdf()` to `src/components/flyer/flyer-preview.tsx`
- [x] Add "Download PDF" button with loading/spinner state next to Print button
- [x] Add "Download PDF" button to `FlyerModal` header (alongside Print button)
- [x] Show error toast/message if PDF generation fails
- [x] Add i18n key `flyer.downloadPdf` in `src/i18n/translations.ts` for all 6 languages

### Phase 3: Deployment & Verification

- [x] Add `functions` config to `vercel.json` for PDF endpoint (`maxDuration: 30`, `memory: 1024`)
- [ ] Deploy to Vercel and test PDF generation end-to-end
- [ ] Verify multilingual PDF output: English, Spanish, Vietnamese, Chinese, Arabic, Tagalog
- [ ] Verify QR code renders correctly in PDF and points to correct URL
- [ ] Verify PDF is a single page (content does not overflow)
- [ ] Verify PDF filename in browser download dialog

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `server/services/pdf.ts` | **Create** | PDF generation service with Puppeteer + HTML template |
| `server/routes/report.ts` | Modify | Add `POST /pdf` route handler |
| `src/components/flyer/flyer-preview.tsx` | Modify | Add Download PDF button + handler |
| `src/i18n/translations.ts` | Modify | Add `flyer.download` translation key |
| `.env.example` | Modify | Add `APP_URL` variable |
| `package.json` | Modify | Add `puppeteer-core`, `@sparticuz/chromium`, `qrcode` deps |
| `vercel.json` | Modify | Configure function memory/timeout for PDF endpoint (if needed) |

## Open Questions

These were identified during spec-flow analysis and should be resolved during implementation:

1. **Vercel plan tier** — Is the project on Vercel Free or Pro? Free tier has 10s function timeout (insufficient for Puppeteer cold start). Pro allows 60s and larger function bundles.
2. **PDF caching for MVP?** — Should generated PDFs be cached to `server/cache/pdfs/{community}_{langCode}.pdf` with 24h TTL? This avoids re-rendering identical reports. Recommended for post-MVP.
3. **Block-level PDF in scope?** — The endpoint currently targets community-level reports only. Block-level reports use `lat/lng/radius` instead of community name. Defer to a follow-up?

## Future Considerations

- **PDF caching** — Cache generated PDFs on disk (`server/cache/pdfs/`) to avoid re-rendering. Key by `{community}_{langCode}.pdf` with 24h TTL. Check cache before launching Puppeteer.
- **Batch PDF generation** — Extend `scripts/generate-reports.ts` to also produce PDFs for all pre-generated reports alongside the JSON files.
- **Block-level PDFs** — Add support for anchor-specific block reports via optional `lat/lng/radius` parameters on the PDF endpoint.
- **Email integration** — Attach generated PDFs to community notification emails.
- **PDF accessibility** — Add PDF tags and reading order metadata (PDF/UA compliance) for screen reader support. Puppeteer's `page.pdf()` does not produce tagged PDFs by default; may need post-processing with a library like `pdf-lib`.
- **Full Arabic RTL** — Extend `FlyerLayout` React component itself to support `dir="rtl"` and RTL-aware layout classes, not just the server-side HTML template.

## Sources & References

- **Upstream issue:** [bookchiq/block-report#51](https://github.com/bookchiq/block-report/issues/51)
- **Workplan stretch goal:** `docs/plans/block-report-workplan.md` line 280 — "PDF generation — Generate actual downloadable PDFs instead of relying on browser print"
- **Existing flyer component:** `src/components/flyer/flyer-layout.tsx` — print-optimized layout
- **Print CSS:** `src/print.css` — current print media styles
- **Report routes:** `server/routes/report.ts` — existing report API structure
- **@sparticuz/chromium docs:** Serverless Chromium for AWS Lambda / Vercel
- **Puppeteer PDF API:** `page.pdf()` with format and margin options
