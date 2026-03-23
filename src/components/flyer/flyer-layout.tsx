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

/** Flyer structural labels translated per supported language. */
interface FlyerLabels {
  blockReport: string;
  issuesReported: string;
  resolved: string;
  avgDaysToFix: string;
  topIssues: string;
  goodNews: string;
  languagesSpoken: string;
  getInvolved: string;
  reportIssues: string;
  reportIssuesDesc: string;
  councilRep: string;
  nearestResource: string;
  tagline: string;
  scanForReport: string;
}

const FLYER_LABELS: Record<string, FlyerLabels> = {
  English: {
    blockReport: 'Block Report',
    issuesReported: 'Issues Reported',
    resolved: 'Resolved',
    avgDaysToFix: 'Avg Days to Fix',
    topIssues: 'Top Issues',
    goodNews: 'Good News',
    languagesSpoken: 'Languages Spoken',
    getInvolved: 'Get Involved in',
    reportIssues: 'Report Issues',
    reportIssuesDesc: 'Call 311 / Get It Done app',
    councilRep: 'Council Rep',
    nearestResource: 'Nearest Resource',
    tagline: 'Your neighborhood, your voice',
    scanForReport: 'Scan for full report',
  },
  Spanish: {
    blockReport: 'Informe del Barrio',
    issuesReported: 'Problemas Reportados',
    resolved: 'Resueltos',
    avgDaysToFix: 'Dias Promedio',
    topIssues: 'Principales Problemas',
    goodNews: 'Buenas Noticias',
    languagesSpoken: 'Idiomas Hablados',
    getInvolved: 'Participa en',
    reportIssues: 'Reportar Problemas',
    reportIssuesDesc: 'Llame al 311 / App Get It Done',
    councilRep: 'Concejal',
    nearestResource: 'Recurso Mas Cercano',
    tagline: 'Tu barrio, tu voz',
    scanForReport: 'Escanea para el informe completo',
  },
  Vietnamese: {
    blockReport: 'Bao Cao Khu Pho',
    issuesReported: 'Van De Bao Cao',
    resolved: 'Da Giai Quyet',
    avgDaysToFix: 'So Ngay Trung Binh',
    topIssues: 'Van De Chinh',
    goodNews: 'Tin Tot',
    languagesSpoken: 'Ngon Ngu Su Dung',
    getInvolved: 'Tham Gia tai',
    reportIssues: 'Bao Cao Van De',
    reportIssuesDesc: 'Goi 311 / Ung dung Get It Done',
    councilRep: 'Dai Dien Hoi Dong',
    nearestResource: 'Dia Diem Gan Nhat',
    tagline: 'Khu pho cua ban, tieng noi cua ban',
    scanForReport: 'Quet de xem bao cao day du',
  },
  Tagalog: {
    blockReport: 'Ulat ng Block',
    issuesReported: 'Mga Isyu na Iniulat',
    resolved: 'Nalutas',
    avgDaysToFix: 'Avg na Araw para Ayusin',
    topIssues: 'Nangungunang Isyu',
    goodNews: 'Mabuting Balita',
    languagesSpoken: 'Mga Wikang Sinasalita',
    getInvolved: 'Makisali sa',
    reportIssues: 'Mag-ulat ng Isyu',
    reportIssuesDesc: 'Tumawag sa 311 / Get It Done app',
    councilRep: 'Kinatawan ng Konseho',
    nearestResource: 'Pinakamalapit na Mapagkukunan',
    tagline: 'Ang iyong komunidad, ang iyong boses',
    scanForReport: 'I-scan para sa buong ulat',
  },
  Chinese: {
    blockReport: '\u793e\u533a\u62a5\u544a',
    issuesReported: '\u62a5\u544a\u7684\u95ee\u9898',
    resolved: '\u5df2\u89e3\u51b3',
    avgDaysToFix: '\u5e73\u5747\u5929\u6570',
    topIssues: '\u4e3b\u8981\u95ee\u9898',
    goodNews: '\u597d\u6d88\u606f',
    languagesSpoken: '\u4f7f\u7528\u8bed\u8a00',
    getInvolved: '\u53c2\u4e0e',
    reportIssues: '\u62a5\u544a\u95ee\u9898',
    reportIssuesDesc: '\u62e8\u6253311 / Get It Done\u5e94\u7528',
    councilRep: '\u8bae\u4f1a\u4ee3\u8868',
    nearestResource: '\u6700\u8fd1\u8d44\u6e90',
    tagline: '\u4f60\u7684\u793e\u533a\uff0c\u4f60\u7684\u58f0\u97f3',
    scanForReport: '\u626b\u63cf\u67e5\u770b\u5b8c\u6574\u62a5\u544a',
  },
  Arabic: {
    blockReport: '\u062a\u0642\u0631\u064a\u0631 \u0627\u0644\u062d\u064a',
    issuesReported: '\u0627\u0644\u0645\u0634\u0627\u0643\u0644 \u0627\u0644\u0645\u0628\u0644\u063a \u0639\u0646\u0647\u0627',
    resolved: '\u062a\u0645 \u0627\u0644\u062d\u0644',
    avgDaysToFix: '\u0645\u062a\u0648\u0633\u0637 \u0627\u0644\u0623\u064a\u0627\u0645',
    topIssues: '\u0623\u0647\u0645 \u0627\u0644\u0645\u0634\u0627\u0643\u0644',
    goodNews: '\u0623\u062e\u0628\u0627\u0631 \u0633\u0627\u0631\u0629',
    languagesSpoken: '\u0627\u0644\u0644\u063a\u0627\u062a \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u0629',
    getInvolved: '\u0634\u0627\u0631\u0643 \u0641\u064a',
    reportIssues: '\u0627\u0644\u0625\u0628\u0644\u0627\u063a \u0639\u0646 \u0645\u0634\u0643\u0644\u0629',
    reportIssuesDesc: '\u0627\u062a\u0635\u0644 311 / \u062a\u0637\u0628\u064a\u0642 Get It Done',
    councilRep: '\u0645\u0645\u062b\u0644 \u0627\u0644\u0645\u062c\u0644\u0633',
    nearestResource: '\u0623\u0642\u0631\u0628 \u0645\u0648\u0631\u062f',
    tagline: '\u062d\u064a\u0643\u060c \u0635\u0648\u062a\u0643',
    scanForReport: '\u0627\u0645\u0633\u062d \u0644\u0644\u062a\u0642\u0631\u064a\u0631 \u0627\u0644\u0643\u0627\u0645\u0644',
  },
};

export function FlyerLayout({ report, neighborhoodSlug, metrics, topLanguages, inline = false, baseUrl }: FlyerLayoutProps) {
  const labels = FLYER_LABELS[report.language] ?? FLYER_LABELS.English;
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
        <p className="text-[11px] font-bold uppercase tracking-[0.35em] mb-1">{labels.blockReport}</p>
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
              {labels.issuesReported}
            </div>
          </div>
          <div className="border-2 border-black rounded-lg p-4 text-center">
            <div className="text-[36px] font-black leading-none">
              {resolutionPct}%
            </div>
            <div className="text-[12px] mt-1.5 font-semibold uppercase tracking-wide">
              {labels.resolved}
            </div>
          </div>
          <div className="border-2 border-black rounded-lg p-4 text-center">
            <div className="text-[36px] font-black leading-none">
              {avgDays}
            </div>
            <div className="text-[12px] mt-1.5 font-semibold uppercase tracking-wide">
              {labels.avgDaysToFix}
            </div>
          </div>
        </div>
      )}

      {/* ── TWO-COLUMN: TOP ISSUES + GOOD NEWS ── */}
      <div className="grid grid-cols-2 gap-5 mb-5">
        {/* Top Issues — horizontal bars */}
        <div className="flyer-section">
          <h2 className="text-[15px] font-black uppercase tracking-widest border-b-2 border-black pb-1 mb-3">
            {labels.topIssues}
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
            <h2 className="text-[15px] font-black uppercase tracking-widest">{labels.goodNews}</h2>
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
            <h2 className="text-[15px] font-black uppercase tracking-widest">{labels.languagesSpoken}</h2>
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
          {labels.getInvolved} {report.neighborhoodName}
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
              <div className="font-bold">{labels.reportIssues}</div>
              <div>{labels.reportIssuesDesc}</div>
            </div>
          </div>
          <div className="flex items-start gap-1.5">
            <BuildingIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-bold">{labels.councilRep}</div>
              <div>{report.contactInfo.councilDistrict}</div>
            </div>
          </div>
          <div className="flex items-start gap-1.5">
            <MapPinIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-bold">{labels.nearestResource}</div>
              <div>{report.contactInfo.anchorLocation}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── FOOTER: QR + TAGLINE ── */}
      <div className="flex items-end justify-between border-t-2 border-black pt-3">
        <div>
          <p className="text-[11px] font-medium">
            {labels.blockReport} &mdash; {labels.tagline}
          </p>
          <p className="text-[10px] text-gray-600">
            Generated {formattedDate} &middot; {origin}/resources
          </p>
        </div>
        <div className="flex flex-col items-center">
          <QRCodeSVG value={qrUrl} size={72} level="M" />
          <p className="text-[9px] mt-1 text-center font-medium">{labels.scanForReport}</p>
        </div>
      </div>
    </div>
  );
}
