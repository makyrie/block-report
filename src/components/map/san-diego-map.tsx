import { useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import type { CommunityAnchor } from '../../types';

// Fix Leaflet default icon paths for bundlers
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

const blueIcon = new L.Icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const greenIcon = new L.Icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  className: 'leaflet-marker-green',
});

interface TransitStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface SanDiegoMapProps {
  libraries: CommunityAnchor[];
  recCenters: CommunityAnchor[];
  transitStops: TransitStop[];
  onAnchorClick: (anchor: CommunityAnchor) => void;
}

export default function SanDiegoMap({
  libraries,
  recCenters,
  transitStops,
  onAnchorClick,
}: SanDiegoMapProps) {
  const handleMarkerClick = useCallback(
    (anchor: CommunityAnchor) => () => {
      onAnchorClick(anchor);
    },
    [onAnchorClick],
  );

  return (
    <MapContainer
      center={[32.7157, -117.1611]}
      zoom={11}
      style={{ width: '100%', height: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Transit stops — small gray circles */}
      {transitStops.map((stop) => (
        <CircleMarker
          key={stop.id}
          center={[stop.lat, stop.lng]}
          radius={4}
          pathOptions={{ color: '#9ca3af', fillColor: '#9ca3af', fillOpacity: 0.6, weight: 1 }}
        >
          <Popup>{stop.name}</Popup>
        </CircleMarker>
      ))}

      {/* Library markers — blue */}
      {libraries.map((lib) => (
        <Marker
          key={lib.id}
          position={[lib.lat, lib.lng]}
          icon={blueIcon}
          eventHandlers={{ click: handleMarkerClick(lib) }}
        >
          <Popup>
            <strong>{lib.name}</strong>
            <br />
            {lib.address}
          </Popup>
        </Marker>
      ))}

      {/* Rec center markers — green */}
      {recCenters.map((rc) => (
        <Marker
          key={rc.id}
          position={[rc.lat, rc.lng]}
          icon={greenIcon}
          eventHandlers={{ click: handleMarkerClick(rc) }}
        >
          <Popup>
            <strong>{rc.name}</strong>
            <br />
            {rc.address}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
