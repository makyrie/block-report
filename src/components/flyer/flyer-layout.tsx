import { QRCodeSVG } from 'qrcode.react';
import type { CommunityReport, NeighborhoodProfile } from '../../types/index';
import {
  CheckCircleIcon,
  SmartphoneIcon,
  BuildingIcon,
  MapPinIcon,
  GlobeIcon,
} from './flyer-icons';

interface FlyerLayoutProps {
  report: CommunityReport;
  neighborhoodSlug: string;
  metrics?: NeighborhoodProfile['metrics'] | null;
  topLanguages?: { language: string; percentage: number }[];
  /** When true, the flyer is visible on screen (used in preview). Default: hidden (print-only). */
  inline?: boolean;
  /** Base URL for links and QR codes. Defaults to window.location.origin in browser. Required for SSR. */
  baseUrl?: string;
}

/** Truncate text to roughly N sentences. */
function truncateSentences(text: string, max: number): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (!sentences || sentences.length <= max) return text;
  return sentences.slice(0, max).join('').trim();
}

/** Map report language names to BCP 47 locale codes for date formatting. */
const LANGUAGE_TO_LOCALE: Record<string, string> = {
  English: 'en-US',
  Spanish: 'es',
  Vietnamese: 'vi',
  Tagalog: 'fil',
  Chinese: 'zh-CN',
  Arabic: 'ar',
};

export function FlyerLayout({ report, neighborhoodSlug, metrics, topLanguages, inline = false, baseUrl }: FlyerLayoutProps) {
  const locale = LANGUAGE_TO_LOCALE[report.language] ?? 'en-US';
  const formattedDate = new Date(report.generatedAt).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const origin = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const qrUrl = `${origin}/neighborhood/${neighborhoodSlug}`;

  const resolutionPct = metrics ? Math.round(metrics.resolutionRate * 100) : null;
  const avgDays = metrics ? Math.round(metrics.avgDaysToResolve) : null;
  const topIssuesData = metrics?.topIssues.slice(0, 3) ?? [];
  const maxIssueCount = topIssuesData[0]?.count ?? 1;

  const languagesForDisplay = (topLanguages ?? [])
    .filter((l) => l.language !== 'English' && l.percentage > 3)
    .slice(0, 4);

  return (
    <div dir={report.language === 'Arabic' ? 'rtl' : 'ltr'} className={`flyer-layout ${inline ? '' : 'hidden'} text-black font-sans`}>

      {/* ── TOP BANNER ── */}
      <div className="border-b-4 border-black pb-3 mb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.35em] mb-1">Block Report</p>
        <h1 className="text-[32px] font-black leading-none">
          {report.neighborhoodName}
        </h1>
        <p className="text-[15px] mt-1.5 font-medium">
          {formattedDate}
        </p>
      </div>

      {/* ── NARRATIVE HOOK ── */}
      <p className="text-[13px] leading-relaxed mb-4">
        {truncateSentences(report.summary, 2)}
      </p>

      {/* ── BIG NUMBER CARDS ── */}
      {metrics && (
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="border-2 border-black rounded-lg p-4 text-center">
            <div className="text-[36px] font-black leading-none">
              {metrics.totalRequests311.toLocaleString()}
            </div>
            <div className="text-[12px] mt-1.5 font-semibold uppercase tracking-wide">
              Issues Reported
            </div>
          </div>
          <div className="border-2 border-black rounded-lg p-4 text-center">
            <div className="text-[36px] font-black leading-none">
              {resolutionPct}%
            </div>
            <div className="text-[12px] mt-1.5 font-semibold uppercase tracking-wide">
              Resolved
            </div>
          </div>
          <div className="border-2 border-black rounded-lg p-4 text-center">
            <div className="text-[36px] font-black leading-none">
              {avgDays}
            </div>
            <div className="text-[12px] mt-1.5 font-semibold uppercase tracking-wide">
              Avg Days to Fix
            </div>
          </div>
        </div>
      )}

      {/* ── TWO-COLUMN: TOP ISSUES + GOOD NEWS ── */}
      <div className="grid grid-cols-2 gap-5 mb-5">
        {/* Top Issues — horizontal bars */}
        <div className="flyer-section">
          <h2 className="text-[15px] font-black uppercase tracking-widest border-b-2 border-black pb-1 mb-3">
            Top Issues
          </h2>
          {topIssuesData.length > 0 ? (
            <div className="space-y-3">
              {topIssuesData.map((issue) => (
                <div key={issue.category}>
                  <div className="flex justify-between text-[13px] mb-1">
                    <span className="font-medium">{issue.category}</span>
                    <span className="font-bold tabular-nums">{issue.count}</span>
                  </div>
                  <div className="h-4 bg-gray-200 rounded-sm">
                    <div
                      className="h-4 bg-black rounded-sm"
                      style={{ width: `${(issue.count / maxIssueCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ul className="text-[13px] space-y-1.5 list-none">
              {report.topIssues.slice(0, 3).map((item, i) => (
                <li key={i} className="flex gap-1">
                  <span className="font-bold flex-shrink-0">&bull;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Good News — callout box */}
        <div className="flyer-section border-2 border-black rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircleIcon className="w-5 h-5" />
            <h2 className="text-[15px] font-black uppercase tracking-widest">Good News</h2>
          </div>
          <ul className="text-[12px] space-y-2 list-none">
            {(metrics?.goodNews ?? report.goodNews).slice(0, 2).map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-bold flex-shrink-0 text-[15px] leading-none">{'\u2713'}</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── LANGUAGES SPOKEN ── */}
      {languagesForDisplay.length > 0 && (
        <div className="flyer-section mb-5">
          <div className="flex items-center gap-2 mb-2">
            <GlobeIcon className="w-5 h-5" />
            <h2 className="text-[15px] font-black uppercase tracking-widest">Languages Spoken</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {languagesForDisplay.map((l) => (
              <span
                key={l.language}
                className="border-2 border-black rounded-full px-4 py-1.5 text-[12px] font-semibold"
              >
                {l.language} {Math.round(l.percentage)}%
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── GET INVOLVED ── */}
      <div className="flyer-section border-2 border-black rounded-lg p-4 mb-5">
        <h2 className="text-[15px] font-black uppercase tracking-widest border-b border-black pb-1.5 mb-3">
          Get Involved in {report.neighborhoodName}
        </h2>
        <ul className="text-[12px] space-y-2 list-none mb-3">
          {report.howToParticipate.slice(0, 2).map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-bold flex-shrink-0">{'\u25B8'}</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div className="border-t border-black pt-2.5 grid grid-cols-3 gap-3 text-[11px]">
          <div className="flex items-start gap-1.5">
            <SmartphoneIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-bold">Report Issues</div>
              <div>Call 311 / Get It Done app</div>
            </div>
          </div>
          <div className="flex items-start gap-1.5">
            <BuildingIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-bold">Council Rep</div>
              <div>{report.contactInfo.councilDistrict}</div>
            </div>
          </div>
          <div className="flex items-start gap-1.5">
            <MapPinIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-bold">Nearest Resource</div>
              <div>{report.contactInfo.anchorLocation}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── FOOTER: QR + TAGLINE ── */}
      <div className="flex items-end justify-between border-t-2 border-black pt-3">
        <div>
          <p className="text-[11px] font-medium">
            Block Report &mdash; Your neighborhood, your voice
          </p>
          <p className="text-[10px] text-gray-600">
            Generated {formattedDate} &middot; {origin}/resources
          </p>
        </div>
        <div className="flex flex-col items-center">
          <QRCodeSVG value={qrUrl} size={72} level="M" />
          <p className="text-[9px] mt-1 text-center font-medium">Scan for full report</p>
        </div>
      </div>
    </div>
  );
}
