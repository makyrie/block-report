import { memo, useCallback, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Circle, GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import type { Feature, FeatureCollection } from 'geojson';
import type { BlockMetrics, CommunityAnchor, TransitStop } from '../../types';
import {
  AnchorPopupContent,
  TransitPopupContent,
  BlockPopupContent,
  ReportPopupContent,
  STATUS_COLORS,
  reportStatus,
} from './popup-content';

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
}: SanDiegoMapProps) {
  const reports = blockData?.reports ?? [];
  const totalReports = blockData?.totalReports ?? 0;
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
    {pinnedLocation && totalReports > reports.length && (
      <div className="absolute top-14 right-2 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg shadow-md px-3 py-1.5 text-xs text-gray-600">
        Showing <span className="font-semibold text-gray-900">{reports.length}</span> of{' '}
        <span className="font-semibold text-gray-900">{totalReports}</span> reports
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
              <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS.open }} />
              <span className="text-gray-700">311 Open</span>
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS.resolved }} />
              <span className="text-gray-700">311 Resolved</span>
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS.referred }} />
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
            fillColor: reportStatus(report.status, report.dateClosed).color,
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
