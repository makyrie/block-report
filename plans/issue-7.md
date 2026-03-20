---
title: "feat: PDF Generation for Community Briefs"
type: feat
status: active
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

**Key challenges and solutions:**

1. **Tailwind CSS** — Extract the minimal CSS needed for the flyer classes. Use the project's compiled CSS output or build a small utility-class subset inline.

2. **QR Code** — Use the `qrcode` npm package (pure Node, SVG output) instead of `qrcode.react`. Generate SVG string and embed inline.

3. **`window.location.origin`** — Replace with `baseUrl` parameter (from `APP_URL` env var or request origin).

4. **SVG Icons** — Already defined as inline SVG in `flyer-icons.tsx`. Copy the SVG strings into the HTML template.

5. **Fonts** — Use system fonts (the flyer uses `font-sans` which maps to the system font stack). Chromium includes good system font coverage.

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

- [ ] `POST /api/report/pdf` endpoint accepts report data and returns a valid PDF
- [ ] PDF visually matches the existing `FlyerLayout` print output (letter size, same sections, QR code)
- [ ] "Download PDF" button appears next to the "Print" button in `FlyerPreview`
- [ ] Button shows loading state while PDF generates
- [ ] PDF filename includes the neighborhood name (e.g., `block-report-mira-mesa.pdf`)
- [ ] Non-English reports generate PDFs with correct character rendering
- [ ] Endpoint respects existing rate limiting (10 req/15min on `/api/report`)
- [ ] Works in local development (`npx tsx server/index.ts`)
- [ ] Works on Vercel serverless deployment (via `@sparticuz/chromium`)
- [ ] Error states handled gracefully (Puppeteer failure → user-friendly message)

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
| Chromium binary too large for Vercel | Endpoint fails to deploy | `@sparticuz/chromium` is designed for this; stays under Vercel's 250MB limit. May need Vercel Pro for larger function bundles. |
| Cold start latency (~5-10s) | First PDF request is slow | Accept this for MVP. Could pre-warm with a cron ping. |
| Memory usage (~300MB per Puppeteer instance) | Vercel function OOM | Use Vercel's 1024MB function memory config. Close browser immediately after PDF capture. |
| HTML template drifts from React component | PDF doesn't match screen | Keep template simple. Document that changes to `FlyerLayout` must be mirrored in `buildFlyerHtml`. |
| Font rendering for CJK/Arabic | Characters missing in PDF | Chromium includes Noto fonts. Test with Vietnamese, Chinese, Arabic, Tagalog. |
| Rate limiting insufficiency | Server overloaded by PDF requests | Existing 10 req/15min limiter applies. Could add a dedicated stricter limiter for PDF. |

## Implementation Checklist

### Phase 1: Backend (server/)

- [ ] Install `puppeteer-core`, `@sparticuz/chromium`, `qrcode`
- [ ] Create `server/services/pdf.ts` with `generatePdf()` and `buildFlyerHtml()`
- [ ] Add `POST /api/report/pdf` route to `server/routes/report.ts`
- [ ] Add `APP_URL` to `.env.example`
- [ ] Test locally with Mira Mesa report data

### Phase 2: Frontend (src/)

- [ ] Add download handler to `src/components/flyer/flyer-preview.tsx`
- [ ] Add "Download PDF" button with loading state
- [ ] Add download button to `FlyerModal` header (alongside Print button)
- [ ] Add i18n key for download button label in `src/i18n/translations.ts`

### Phase 3: Deployment & Testing

- [ ] Configure Vercel function for PDF endpoint (memory, timeout)
- [ ] Test PDF generation on Vercel deployment
- [ ] Verify multilingual PDF output (Spanish, Vietnamese, Chinese, Arabic, Tagalog)
- [ ] Verify QR code renders correctly in PDF

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

## Future Considerations

- **Batch PDF generation** — Extend the `generate-reports` script to also produce PDFs for all pre-generated reports, creating a `server/cache/pdfs/` directory.
- **PDF caching** — Cache generated PDFs on disk to avoid re-rendering identical reports. Key by `{community}_{language}_hash.pdf`.
- **Email integration** — Attach generated PDFs to community notification emails.
- **Block-level PDFs** — Extend to support block-level reports (anchor-specific briefs) with the same flow.

## Sources & References

- **Upstream issue:** [bookchiq/block-report#51](https://github.com/bookchiq/block-report/issues/51)
- **Workplan stretch goal:** `docs/plans/block-report-workplan.md` line 280 — "PDF generation — Generate actual downloadable PDFs instead of relying on browser print"
- **Existing flyer component:** `src/components/flyer/flyer-layout.tsx` — print-optimized layout
- **Print CSS:** `src/print.css` — current print media styles
- **Report routes:** `server/routes/report.ts` — existing report API structure
- **@sparticuz/chromium docs:** Serverless Chromium for AWS Lambda / Vercel
- **Puppeteer PDF API:** `page.pdf()` with format and margin options
