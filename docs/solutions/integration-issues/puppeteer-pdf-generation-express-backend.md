---
title: "Server-side PDF generation for community briefs via Puppeteer"
slug: "puppeteer-pdf-generation-express-backend"
date_solved: "2026-03-20"
problem_type: feature_implementation
component: "server/services/pdf/, server/routes/report.ts, src/components/flyer/"
severity: medium
symptoms:
  - "Users must manually invoke browser print > Save as PDF with no guided workflow"
  - "Cross-browser print CSS produces visually inconsistent PDFs"
  - "No programmatic or batch PDF generation capability"
  - "Print-to-PDF is unreliable or unavailable on mobile browsers"
  - "No Download PDF button in FlyerPreview or FlyerModal"
tags:
  - pdf
  - puppeteer
  - chromium
  - concurrency
  - html-template
  - xss-escaping
related_issues:
  - 7
  - 51
---

## Problem Statement

The project needed a way to export the community brief flyer as a downloadable PDF. The React flyer component (`FlyerLayout`) renders a rich civic data sheet — neighborhood summary, 311 metrics, top issues bar chart, language demographics, QR code, contact info — but the browser's native print-to-PDF produces inconsistent output across OS/browser combinations, loses the designed layout, and cannot be triggered from a "Download PDF" button with a predictable filename. The goal was deterministic, server-rendered PDFs that match the on-screen flyer exactly, work across all user devices, and support multilingual content (Noto fonts for CJK/Arabic/Vietnamese scripts).

## Technical Approach

Server-side PDF generation using **Puppeteer (puppeteer-core) + headless Chromium**. The backend builds a self-contained HTML document that mirrors the React `FlyerLayout` component, loads it into a Chromium page, waits for fonts, then calls `page.pdf()` to produce a letter-size PDF buffer which is streamed directly to the client.

Stack additions: `puppeteer-core`, `@sparticuz/chromium` (Lambda/Vercel-compatible Chromium binary), `qrcode` (QR code SVG generation). A new `POST /api/report/pdf` route was added to `server/routes/report.ts`. The frontend gained a `useDownloadPdf` hook and a `downloadPdf` utility that POST the report JSON, receive the PDF blob, and trigger a browser download via an ephemeral object URL.

## Key Architectural Decisions

**Modular `server/services/pdf/` directory** — the initial implementation was a single God module. Code review forced a split into five focused files:
- `index.ts` — orchestrator; acquires queue slot, calls browser and template, releases slot
- `browser.ts` — Chromium singleton with crash recovery
- `queue.ts` — concurrency queue
- `template.ts` — HTML/CSS builder, `escapeHtml`, SVG icons
- `fonts.ts` — Google Fonts CSS cache

**Browser singleton with reuse** — a single Chromium process is kept alive across requests. Each PDF request opens a new `Page`, uses it, then closes it. This avoids the ~1-2 second cold-start cost of launching Chromium per request.

**Self-contained HTML** — fonts are inlined from a server-side cache of Google Fonts CSS, and SVG icons are copied inline as string constants. The page does not need to load anything from the origin app URL.

**Shared download state** — `useDownloadPdf` hook is instantiated once in `FlyerPreview` and its state (`downloading`, `downloadError`, `handleDownloadPdf`) is passed down as props to `FlyerModal`, preventing independent download states that could conflict.

## Security Hardening

1. **XSS escaping** — `escapeHtml()` accepts `unknown`, converts non-strings explicitly, escapes all five HTML metacharacters (`&`, `<`, `>`, `"`, `'`). Every user-supplied value including numeric values is passed through `escapeHtml()` before template interpolation.

2. **Input validation at the perimeter** — the route validates: presence of `report` and `neighborhoodSlug`; exact TypeScript shape of `report` (all string fields, all arrays of strings); `neighborhoodSlug` format via `/^[a-z0-9-]+$/`; optional `metrics` and `topLanguages` structures. Invalid requests get 400.

3. **Field length limits** — `summary` <= 5000 chars, `neighborhoodName` <= 200 chars, each array <= 10 items, each item <= 5000 chars. Issue category names within metrics capped at 200 chars.

4. **Font CSS sanitization** — fetched Google Fonts CSS has all HTML tags stripped and all `@import` rules stripped. Content-type is checked to be `text/css` before accepting.

5. **Request interception** — inside the Puppeteer page, all network requests are intercepted. Only `data:`, `about:`, `https://fonts.googleapis.com/`, and `https://fonts.gstatic.com/` URLs are allowed; everything else is aborted.

6. **APP_URL protocol check** — on server startup, `APP_URL` is parsed and its protocol verified to be `http:` or `https:`. No fallback to attacker-controlled `Host` header.

7. **Content-Length header** — PDF buffer size sent as `Content-Length` for progress tracking and truncation detection.

## Performance Optimizations

1. **Concurrency queue** — at most 1 Chromium instance runs concurrently (Vercel functions have 1024 MB; one instance uses ~200-300 MB). Queue holds up to 3 waiting requests. Queue timeout is 15 seconds — leaving sufficient time for actual PDF generation within Vercel's 30-second function timeout.

2. **Browser reuse** — `getBrowser()` returns the cached `browserInstance` on warm invocations, paying the ~1-2 second Chromium launch cost only on cold start or after a crash.

3. **`domcontentloaded` instead of `networkidle2`** — saves ~500 ms of idle polling. Font loading handled explicitly via `page.evaluate(() => document.fonts.ready)`.

4. **Font CSS in-memory cache** — fetches Google Fonts CSS once and caches for 24 hours. The fetch has a 5-second `AbortSignal.timeout`.

5. **Content truncation** — narrative summary truncated to 2 sentences for the PDF; `goodNews` capped at 2 items, `howToParticipate` at 2 items, `topIssues` at 3 items.

6. **Lazy `@sparticuz/chromium` import** — the heavy Chromium binary module is loaded via dynamic `import()` on first browser launch, not at module level. This avoids the parse cost on cold starts for non-PDF routes. Future maintainers should not convert this to a static import.

7. **Timeout budget** — `setContent()` has a 15-second timeout and `page.pdf()` has a 10-second timeout, creating a combined 25-second maximum slot occupancy. The 15-second queue timeout was chosen to fit within Vercel's 30-second function timeout, but under worst-case conditions a queued request could dequeue at t=15s and then need up to 25s more — exceeding the function timeout. In practice, most renders complete in 2-4 seconds total.

## Reliability & Error Handling

1. **Browser crash recovery** — `getBrowser()` checks `browserInstance.connected` before returning. If disconnected, `closeBrowser()` is called and a fresh instance is launched. The `disconnected` event also nulls `browserInstance`.

2. **Force-kill fallback** — `closeBrowser()` calls `browser.close()` but falls back to `browser.process()?.kill('SIGKILL')` if that throws.

3. **`page.pdf()` timeout** — 10-second `Promise.race` wraps `page.pdf()`. Prevents indefinite hangs from consuming the queue slot.

4. **503 for queue pressure** — queue-full and queue-timeout errors return HTTP 503, signaling temporary overload rather than a broken service.

5. **Graceful shutdown** — `server/index.ts` listens for `SIGTERM` and `SIGINT`, calls `server.close()` then `closeBrowser()` before `process.exit(0)`.

6. **Font fetch degradation** — if `getGoogleFontsCss()` fails, it returns cached CSS or empty string. PDF generated with system fallback fonts.

7. **`revokeObjectURL` race fix** — frontend delays `URL.revokeObjectURL()` by 10 seconds via `setTimeout`, giving Firefox and Safari time to initiate the download.

## Known Residual Risks

1. **`--no-sandbox` on non-Vercel** — `browser.ts` unconditionally passes `--no-sandbox` and `--disable-setuid-sandbox` when running outside Vercel. This disables Chromium's process sandbox, expanding the attack surface if the HTML template is ever compromised. Mitigate by running the server as a non-root user in production.

2. **No per-client rate limiting** — the queue provides global concurrency control (1 active + 3 waiting) but no per-IP throttling. A single client can monopolize the queue. Consider adding `express-rate-limit` in front of the PDF route.

3. **`neighborhoodSlug` length unbounded** — the regex `/^[a-z0-9-]+$/` validates format but not length. An extremely long slug could cause `qrcode.toString()` to throw (QR capacity ~4,296 alphanumeric chars). Add a length cap (e.g., 100 chars).

4. **`topLanguages[].language` and `metrics.goodNews` items lack per-item length caps** — unlike `report` array items which are capped at 5000 chars, these fields only have array-length validation. An oversized string passes validation and enters the HTML template.

5. **`Content-Disposition` filename** — the `language` fallback path uses `report.language.toLowerCase().slice(0,2)` without explicit sanitization. Safety depends on the `slice(0,2)` truncating any CRLF injection characters. Fragile but currently safe.

## Code Examples

**Queue acquire/release (queue.ts):**
```typescript
export async function acquirePdfSlot(): Promise<void> {
  if (activePdfJobs < MAX_CONCURRENT_PDF) {
    activePdfJobs++;
    return;
  }
  if (pdfQueue.length >= MAX_QUEUE_DEPTH) {
    throw new Error('PDF generation queue full — try again later');
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const idx = pdfQueue.indexOf(entry);
      if (idx !== -1) pdfQueue.splice(idx, 1);
      reject(new Error('PDF generation queue timeout — too many concurrent requests'));
    }, QUEUE_TIMEOUT_MS);
    const entry = {
      resolve: () => { clearTimeout(timeout); activePdfJobs++; resolve(); },
      reject,
    };
    pdfQueue.push(entry);
  });
}
```

**Request interception whitelist (index.ts):**
```typescript
await page.setRequestInterception(true);
page.on('request', (req) => {
  const url = req.url();
  if (url.startsWith('data:') || url.startsWith('about:') ||
      url.startsWith('https://fonts.googleapis.com/') ||
      url.startsWith('https://fonts.gstatic.com/')) {
    req.continue();
  } else {
    req.abort();
  }
});
```

**page.pdf() with timeout:**
```typescript
const pdfPromise = page.pdf({ format: 'Letter', printBackground: true, ... });
const timeoutPromise = new Promise<never>((_, reject) =>
  setTimeout(() => reject(new Error('PDF rendering timed out')), 10_000),
);
const pdf = await Promise.race([pdfPromise, timeoutPromise]);
```

**escapeHtml (handles numeric values):**
```typescript
export function escapeHtml(value: unknown): string {
  const str = typeof value === 'string' ? value : String(value ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

## Lessons Learned

### 1. Decompose into testable units before writing code
The initial implementation was a single 491-line God module mixing browser management, concurrency, font fetching, HTML templating, and types. This made unit testing individual concerns impossible. The split into focused modules happened after multiple review rounds — it should have been the starting architecture.

### 2. Write escaping functions defensively from day one
The initial `escapeHtml()` omitted single-quote escaping and only accepted `string`. Numeric values were interpolated directly without escaping. Both were caught in review. Accept `unknown`, convert non-strings explicitly, escape all five HTML metacharacters.

### 3. Other mistakes caught in review
- Input validation was missing from the route handler — added as a separate fix commit instead of being part of the initial implementation.
- No concurrency budget was planned upfront — Chromium's ~200-300 MB per instance wasn't modelled against Vercel's 1024 MB limit.
- Shutdown hooks for Chromium were missing — orphan processes on SIGTERM.
- `page.pdf()` and font fetches had no timeouts — could block indefinitely.
- `APP_URL` fell back to attacker-controlled `Host` header for QR code URL generation.
- `@sparticuz/chromium` was placed in `devDependencies` instead of `dependencies`.
- `tsconfig.server.json` didn't include `src/utils` despite cross-boundary imports.

## Test Checklist

For similar server-side PDF generation features, ensure coverage of:
- [ ] `escapeHtml` covers all five metacharacters, numeric inputs, `null`/`undefined`
- [ ] Template test: adversarial strings in every field render escaped
- [ ] Queue tests: immediate acquire, FIFO ordering, depth-cap rejection, timeout message format
- [ ] Font fetch tests: HTML stripping, `@import` stripping, non-CSS rejection, network failure fallback
- [ ] Route tests: 400 for malformed body, 503 for queue-full/timeout, 200 with `application/pdf`

## Cross-References

- **GitHub issue:** #7 (PLAN: PDF generation for community briefs)
- **Upstream issue:** bookchiq/block-report#51
- **Plan document:** `plans/issue-7.md`
- **Branch:** `ce/issue-7-plan-pdf-generation-for-community-briefs`
- **Related todos:** `todos/005` through `todos/015` (review findings addressed during implementation)
