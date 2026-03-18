import { memo, useCallback, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Circle, GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import type { Feature, FeatureCollection } from 'geojson';
import type { Block311Report, BlockMetrics, CommunityAnchor, TransitStop } from '../../types';

// ── Popup content components ─────────────────────────────────────────────────

type TypeConfig = {
  dot: string;   // Tailwind bg color — must match legend
  label: string;
  text: string;  // text color for label
};

const TYPE_CONFIG: Record<'library' | 'rec_center' | 'transit', TypeConfig> = {
  library:    { dot: 'bg-blue-500',  label: 'Library',      text: 'text-blue-700'  },
  rec_center: { dot: 'bg-green-500', label: 'Rec Center',   text: 'text-green-700' },
  transit:    { dot: 'bg-violet-600', label: 'Transit Stop', text: 'text-violet-700' },
};

function TypeBadge({ type }: { type: keyof typeof TYPE_CONFIG }) {
  const { dot, label, text } = TYPE_CONFIG[type];
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
      <span className={`text-xs font-semibold uppercase tracking-wide ${text}`}>{label}</span>
    </div>
  );
}

function AnchorPopupContent({ anchor }: { anchor: CommunityAnchor }) {
  const type = anchor.type === 'library' ? 'library' : 'rec_center';
  return (
    <div className="min-w-[200px] max-w-[260px]">
      <TypeBadge type={type} />
      <p className="font-semibold text-gray-900 text-sm leading-snug mb-1.5">{anchor.name}</p>
      {anchor.address && (
        <p className="text-xs text-gray-600 flex items-start gap-1 mb-1">
          <span aria-hidden="true" className="mt-px shrink-0">📍</span>
          <span>{anchor.address}</span>
        </p>
      )}
      {anchor.community && (
        <p className="text-xs text-gray-500 mb-1">
          <span className="font-medium">Neighborhood:</span> {anchor.community}
        </p>
      )}
      {anchor.phone && (
        <p className="text-xs mt-1">
          <a
            href={`tel:${anchor.phone}`}
            className="text-blue-600 hover:underline"
            aria-label={`Call ${anchor.name} at ${anchor.phone}`}
          >
            📞 {anchor.phone}
          </a>
        </p>
      )}
      {anchor.website && (
        <p className="text-xs mt-0.5">
          <a
            href={anchor.website}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:underline"
            aria-label={`Visit ${anchor.name} website (opens in new tab)`}
          >
            🌐 Website ↗
          </a>
        </p>
      )}
    </div>
  );
}

function TransitPopupContent({ name }: { name: string }) {
  return (
    <div className="min-w-[160px] max-w-[240px]">
      <TypeBadge type="transit" />
      <p className="font-semibold text-gray-900 text-sm leading-snug">{name}</p>
    </div>
  );
}

function BlockPopupContent({
  loading,
  data,
}: {
  loading: boolean;
  data: BlockMetrics | null;
}) {
  if (loading) {
    return (
      <div className="min-w-[200px] flex items-center gap-2 py-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-orange-500 shrink-0" />
        <span className="text-sm text-gray-600">Loading block data…</span>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-w-[200px] text-sm text-gray-500 py-1">No data available.</div>
    );
  }
  const resRate = data.totalRequests > 0 ? data.resolutionRate : 0;
  const resColor = resRate >= 0.75 ? 'text-green-700' : resRate >= 0.5 ? 'text-yellow-700' : 'text-red-700';

  return (
    <div className="min-w-[220px] max-w-[300px]">
      <div className="flex items-center gap-1.5 mb-2">
        <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full shrink-0 bg-orange-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-orange-700">
          Your Block · {data.radiusMiles} mi radius
        </span>
      </div>
      <div className="flex gap-3 mb-2">
        <div className="text-center">
          <p className="text-xl font-bold text-gray-900">{data.openCount}</p>
          <p className="text-xs text-gray-500">open</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-gray-900">{data.resolvedCount}</p>
          <p className="text-xs text-gray-500">resolved</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-gray-900">{data.totalRequests}</p>
          <p className="text-xs text-gray-500">total</p>
        </div>
      </div>
      <div className="flex gap-3 text-xs mb-3">
        <span className={`font-medium ${resColor}`}>
          {(resRate * 100).toFixed(0)}% resolved
        </span>
        {data.avgDaysToResolve != null && (
          <span className="text-gray-500">
            ~{data.avgDaysToResolve} days avg
          </span>
        )}
      </div>
      {data.topIssues.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-medium text-gray-700 mb-1">Top issues nearby</p>
          <ul className="space-y-1">
            {data.topIssues.slice(0, 4).map((issue) => (
              <li key={issue.category} className="text-xs text-gray-600 flex justify-between gap-2">
                <span className="truncate">{issue.category}</span>
                <span className="shrink-0 text-gray-400 font-mono">{issue.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.recentlyResolved.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-medium text-gray-700 mb-1">Recently resolved</p>
          <ul className="space-y-0.5">
            {data.recentlyResolved.map((r, i) => (
              <li key={`${r.category}-${r.date}-${i}`} className="text-xs text-gray-600 flex justify-between gap-2">
                <span className="truncate">{r.category}</span>
                <span className="shrink-0 text-gray-400">
                  {new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.totalRequests > 0 && (
        <p className="text-xs text-gray-400 italic mb-1">Click markers to see individual reports</p>
      )}
      <button
        type="button"
        onClick={() => window.print()}
        className="w-full mt-1 rounded bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600"
      >
        Print flyer for this area
      </button>
    </div>
  );
}

// Fix Leaflet default icon paths for bundlers
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

function makePinIcon(color: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24S24 21 24 12C24 5.373 18.627 0 12 0z"
        fill="${color}" stroke="white" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="5" fill="white" opacity="0.85"/>
    </svg>`.trim();
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -36],
  });
}

const blueIcon = makePinIcon('#3b82f6');
const greenIcon = makePinIcon('#22c55e');
const orangeIcon = makePinIcon('#f97316');

interface SanDiegoMapProps {
  libraries: CommunityAnchor[];
  recCenters: CommunityAnchor[];
  transitStops: TransitStop[];
  neighborhoodBoundaries: FeatureCollection | null;
  selectedCommunity: string | null;
  onAnchorClick: (anchor: CommunityAnchor) => void;
  onMapClick?: (lat: number, lng: number) => void;
  pinnedLocation?: { lat: number; lng: number } | null;
  blockData?: BlockMetrics | null;
  blockLoading?: boolean;
  blockRadius?: number;
  reports?: Block311Report[];
  totalReportsAvailable?: number;
}

// Normalize strings for fuzzy matching (e.g. "City Heights" matches "Mid-City:City Heights")
function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function findCommunityFeature(features: Feature[], community: string): Feature | null {
  const target = norm(community);
  return (
    features.find((f) => norm(f.properties?.cpname ?? '') === target) ??
    features.find((f) => norm(f.properties?.cpname ?? '').includes(target)) ??
    features.find((f) => target.includes(norm(f.properties?.cpname ?? ''))) ??
    null
  );
}

// Child component — pinned block location marker that auto-opens its popup
function PinnedMarker({
  lat,
  lng,
  loading,
  data,
}: {
  lat: number;
  lng: number;
  loading: boolean;
  data: BlockMetrics | null;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  useEffect(() => {
    markerRef.current?.openPopup();
  }, [lat, lng]);
  return (
    <Marker
      position={[lat, lng]}
      icon={orangeIcon}
      title="Your block"
      alt="Pinned location"
      ref={markerRef}
    >
      <Popup>
        <BlockPopupContent loading={loading} data={data} />
      </Popup>
    </Marker>
  );
}

// Child component — handles map click events with debounce
function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useMapEvents({
    click(e) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onClick(e.latlng.lat, e.latlng.lng);
      }, 300);
    },
  });
  return null;
}

// Child component — uses useMap() to zoom to selected community bounds
function MapController({ feature }: { feature: Feature | null }) {
  const map = useMap();
  useEffect(() => {
    if (!feature) return;
    const layer = L.geoJSON(feature);
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [feature, map]);
  return null;
}

// ── 311 report status colors ────────────────────────────────────────────────

function reportStatusColor(status: string, dateClosed: string | null): string {
  if (status === 'Closed' || dateClosed) return '#22c55e'; // green — resolved
  if (/referred/i.test(status)) return '#9ca3af';          // gray — referred
  return '#ef4444';                                         // red — open
}

function reportStatusLabel(status: string, dateClosed: string | null): string {
  if (status === 'Closed' || dateClosed) return 'Resolved';
  if (/referred/i.test(status)) return 'Referred';
  return 'Open';
}

function ReportPopupContent({ report }: { report: Block311Report }) {
  const color = reportStatusColor(report.status, report.dateClosed);
  const label = reportStatusLabel(report.status, report.dateClosed);
  const dateStr = report.dateRequested
    ? new Date(report.dateRequested).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Unknown';
  const closedStr = report.dateClosed
    ? new Date(report.dateClosed).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="min-w-[180px] max-w-[260px]">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span
          aria-hidden="true"
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>
          {label}
        </span>
      </div>
      <p className="font-semibold text-gray-900 text-sm leading-snug mb-1">{report.category}</p>
      {report.categoryDetail && (
        <p className="text-xs text-gray-500 mb-1">{report.categoryDetail}</p>
      )}
      <p className="text-xs text-gray-600 mb-0.5">Reported: {dateStr}</p>
      {closedStr && (
        <p className="text-xs text-gray-600 mb-0.5">Resolved: {closedStr}</p>
      )}
      {report.address && (
        <p className="text-xs text-gray-500 mt-1 flex items-start gap-1">
          <span aria-hidden="true" className="mt-px shrink-0">📍</span>
          <span>{report.address}</span>
        </p>
      )}
    </div>
  );
}

function SanDiegoMap({
  libraries,
  recCenters,
  transitStops,
  neighborhoodBoundaries,
  selectedCommunity,
  onAnchorClick,
  onMapClick,
  pinnedLocation,
  blockData,
  blockLoading = false,
  blockRadius = 0.25,
  reports = [],
  totalReportsAvailable = 0,
}: SanDiegoMapProps) {
  const handleMarkerClick = useCallback(
    (anchor: CommunityAnchor) => () => {
      onAnchorClick(anchor);
    },
    [onAnchorClick],
  );

  const selectedFeature = selectedCommunity && neighborhoodBoundaries
    ? findCommunityFeature(neighborhoodBoundaries.features, selectedCommunity)
    : null;

  return (
    <div role="region" aria-label="San Diego neighborhood map" className="relative w-full h-full">
    {/* Report count indicator — shown when results are capped */}
    {pinnedLocation && totalReportsAvailable > reports.length && (
      <div className="absolute top-14 right-2 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg shadow-md px-3 py-1.5 text-xs text-gray-600">
        Showing <span className="font-semibold text-gray-900">{reports.length}</span> of{' '}
        <span className="font-semibold text-gray-900">{totalReportsAvailable}</span> reports
      </div>
    )}
    {/* Legend */}
    <nav aria-label="Map legend" className="absolute bottom-8 left-2 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg shadow-md px-3 py-2 text-xs print:hidden">
      <ul className="space-y-1.5">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full bg-blue-500 shrink-0" />
          <span className="text-gray-700">Library</span>
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full bg-green-500 shrink-0" />
          <span className="text-gray-700">Rec Center</span>
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full bg-violet-600 shrink-0" />
          <span className="text-gray-700">Transit Stop</span>
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full bg-orange-500 shrink-0" />
          <span className="text-gray-700">Your Block</span>
        </li>
        {pinnedLocation && reports.length > 0 && (
          <>
            <li className="border-t border-gray-200 pt-1.5 mt-1 flex items-center gap-2">
              <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: '#ef4444' }} />
              <span className="text-gray-700">311 Open</span>
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: '#22c55e' }} />
              <span className="text-gray-700">311 Resolved</span>
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: '#9ca3af' }} />
              <span className="text-gray-700">311 Referred</span>
            </li>
          </>
        )}
      </ul>
    </nav>
    <MapContainer
      center={[32.7157, -117.1611]}
      zoom={11}
      preferCanvas={true}
      style={{ width: '100%', height: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Click-to-explore handler */}
      {onMapClick && <MapClickHandler onClick={onMapClick} />}

      {/* Radius circle around pinned location */}
      {pinnedLocation && (
        <Circle
          center={[pinnedLocation.lat, pinnedLocation.lng]}
          radius={blockRadius * 1609.34}
          pathOptions={{
            color: '#f97316',
            weight: 2,
            opacity: 0.7,
            fillColor: '#f97316',
            fillOpacity: 0.08,
            dashArray: '6 4',
          }}
        />
      )}

      {/* Pinned location marker — auto-opens popup when dropped */}
      {pinnedLocation && (
        <PinnedMarker
          lat={pinnedLocation.lat}
          lng={pinnedLocation.lng}
          loading={blockLoading}
          data={blockData ?? null}
        />
      )}

      {/* 311 report markers — color-coded by status */}
      {pinnedLocation && reports.map((report) => (
        <CircleMarker
          key={report.id}
          center={[report.lat, report.lng]}
          radius={6}
          pathOptions={{
            color: '#fff',
            weight: 1.5,
            fillColor: reportStatusColor(report.status, report.dateClosed),
            fillOpacity: 0.85,
          }}
          bubblingMouseEvents={false}
        >
          <Popup>
            <ReportPopupContent report={report} />
          </Popup>
        </CircleMarker>
      ))}

      {/* Zoom to selected community + highlight its boundary */}
      <MapController feature={selectedFeature} />
      {selectedFeature && (
        <GeoJSON
          key={selectedCommunity}
          data={selectedFeature}
          style={{
            color: '#2563eb',
            weight: 2.5,
            opacity: 0.9,
            fillColor: '#3b82f6',
            fillOpacity: 0.12,
          }}
        />
      )}

      {/* Transit stops — violet circles */}
      {transitStops.map((stop) => (
        <CircleMarker
          key={stop.id}
          center={[stop.lat, stop.lng]}
          radius={4}
          pathOptions={{ color: '#7c3aed', fillColor: '#7c3aed', fillOpacity: 0.8, weight: 1 }}
        >
          <Popup>
            <TransitPopupContent name={stop.name} />
          </Popup>
        </CircleMarker>
      ))}

      {/* Library markers — blue */}
      {libraries.map((lib) => (
        <Marker
          key={lib.id}
          position={[lib.lat, lib.lng]}
          icon={blueIcon}
          title={`Library: ${lib.name}`}
          alt={`Library: ${lib.name}`}
          eventHandlers={{ click: handleMarkerClick(lib) }}
        >
          <Popup>
            <AnchorPopupContent anchor={lib} />
          </Popup>
        </Marker>
      ))}

      {/* Rec center markers — green */}
      {recCenters.map((rc) => (
        <Marker
          key={rc.id}
          position={[rc.lat, rc.lng]}
          icon={greenIcon}
          title={`Rec Center: ${rc.name}`}
          alt={`Rec Center: ${rc.name}`}
          eventHandlers={{ click: handleMarkerClick(rc) }}
        >
          <Popup>
            <AnchorPopupContent anchor={rc} />
          </Popup>
        </Marker>
      ))}
    </MapContainer>
    </div>
  );
}

export default memo(SanDiegoMap);
