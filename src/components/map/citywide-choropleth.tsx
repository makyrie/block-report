import { useCallback, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Feature, FeatureCollection } from 'geojson';
import type { CitywideCommunity } from '../../types';
import { useLanguage } from '../../i18n/context';

// Sequential red-orange color ramp for access gap scores
function scoreToColor(score: number): string {
  if (score <= 20) return '#fee5d9';
  if (score <= 40) return '#fcae91';
  if (score <= 60) return '#fb6a4a';
  if (score <= 80) return '#de2d26';
  return '#a50f15';
}

const NO_DATA_COLOR = '#e5e7eb';

// Normalize strings for fuzzy matching (same logic as san-diego-map.tsx)
function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

interface CitywideChoroplethProps {
  boundaries: FeatureCollection;
  ranking: CitywideCommunity[];
  hoveredCommunity: string | null;
  onHoverCommunity: (community: string | null) => void;
  onClickCommunity: (community: string) => void;
}

// Sub-component to fit map bounds to GeoJSON
function FitBounds({ boundaries }: { boundaries: FeatureCollection }) {
  const map = useMap();
  useEffect(() => {
    if (boundaries.features.length > 0) {
      const layer = L.geoJSON(boundaries as GeoJSON.FeatureCollection);
      map.fitBounds(layer.getBounds(), { padding: [20, 20] });
    }
  }, [boundaries, map]);
  return null;
}

export default function CitywideChoropleth({
  boundaries,
  ranking,
  hoveredCommunity,
  onHoverCommunity,
  onClickCommunity,
}: CitywideChoroplethProps) {
  const { t } = useLanguage();
  const geoJsonRef = useRef<L.GeoJSON | null>(null);

  // Build a lookup map: normalized community name → ranking data
  const scoreMap = useMemo(() => {
    const map = new Map<string, CitywideCommunity>();
    for (const entry of ranking) {
      map.set(norm(entry.community), entry);
    }
    return map;
  }, [ranking]);

  // Find score for a GeoJSON feature
  const getScore = useCallback(
    (feature: Feature): CitywideCommunity | null => {
      const cpname = feature.properties?.cpname ?? feature.properties?.name ?? '';
      return scoreMap.get(norm(cpname)) ?? null;
    },
    [scoreMap],
  );

  // Style each feature based on its access gap score
  const style = useCallback(
    (feature?: Feature) => {
      if (!feature) return {};
      const entry = getScore(feature);
      const cpname = norm(feature.properties?.cpname ?? '');
      const isHovered = hoveredCommunity && norm(hoveredCommunity) === cpname;
      return {
        fillColor: entry ? scoreToColor(entry.accessGapScore) : NO_DATA_COLOR,
        fillOpacity: isHovered ? 0.9 : 0.7,
        weight: isHovered ? 3 : 1,
        color: isHovered ? '#1d4ed8' : '#ffffff',
        dashArray: entry ? undefined : '4',
      };
    },
    [getScore, hoveredCommunity],
  );

  // Attach hover and click handlers to each feature
  const onEachFeature = useCallback(
    (feature: Feature, layer: L.Layer) => {
      const entry = getScore(feature);
      const displayName = feature.properties?.cpname ?? 'Unknown';

      // Tooltip
      const tooltipContent = entry
        ? `<strong>${displayName}</strong><br/>Score: ${entry.accessGapScore}/100${entry.topFactors.length > 0 ? '<br/>' + entry.topFactors.join(', ') : ''}`
        : `<strong>${displayName}</strong><br/>${t('citywide.noScore')}`;
      layer.bindTooltip(tooltipContent, { sticky: true, direction: 'top' });

      layer.on({
        mouseover: () => onHoverCommunity(displayName),
        mouseout: () => onHoverCommunity(null),
        click: () => onClickCommunity(displayName),
      });
    },
    [getScore, onHoverCommunity, onClickCommunity, t],
  );

  // Update styles when hoveredCommunity changes without remounting GeoJSON
  useEffect(() => {
    if (geoJsonRef.current) {
      geoJsonRef.current.setStyle((feature?: Feature) => {
        if (!feature) return {};
        const entry = getScore(feature);
        const cpname = norm(feature.properties?.cpname ?? '');
        const isHovered = hoveredCommunity && norm(hoveredCommunity) === cpname;
        return {
          fillColor: entry ? scoreToColor(entry.accessGapScore) : NO_DATA_COLOR,
          fillOpacity: isHovered ? 0.9 : 0.7,
          weight: isHovered ? 3 : 1,
          color: isHovered ? '#1d4ed8' : '#ffffff',
          dashArray: entry ? undefined : '4',
        };
      });
    }
  }, [hoveredCommunity, getScore]);

  // Use a stable key based on ranking data to avoid remounting on hover
  const geoJsonKey = useMemo(() => ranking.map((r) => r.community).join(','), [ranking]);

  return (
    <div className="relative h-full w-full" role="img" aria-label={t('citywide.title')}>
      <MapContainer
        center={[32.82, -117.15]}
        zoom={11}
        className="h-full w-full"
        preferCanvas
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <GeoJSON
          key={geoJsonKey}
          data={boundaries}
          style={style}
          onEachFeature={onEachFeature}
          ref={(el) => { geoJsonRef.current = el; }}
        />
        <FitBounds boundaries={boundaries} />
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-md px-3 py-2 z-[1000]">
        <p className="text-xs font-semibold text-gray-700 mb-1.5">{t('citywide.legend')}</p>
        <div className="flex items-center gap-0.5">
          <span className="text-[10px] text-gray-500 mr-1">{t('citywide.legendLow')}</span>
          {['#fee5d9', '#fcae91', '#fb6a4a', '#de2d26', '#a50f15'].map((color) => (
            <span
              key={color}
              className="w-6 h-3 rounded-sm"
              style={{ backgroundColor: color }}
            />
          ))}
          <span className="text-[10px] text-gray-500 ml-1">{t('citywide.legendHigh')}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="w-4 h-2 rounded-sm border border-dashed border-gray-400" style={{ backgroundColor: NO_DATA_COLOR }} />
          <span className="text-[10px] text-gray-500">{t('citywide.noScore')}</span>
        </div>
      </div>
    </div>
  );
}
